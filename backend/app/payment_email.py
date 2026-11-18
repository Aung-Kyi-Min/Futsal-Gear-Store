import asyncio
import json
import logging
import os
import smtplib
import ssl
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from email.errors import MessageError

import certifi
from email_validator import validate_email
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from .db import postgres_engine
from .order_receipt import confirmation_message, receipt_snapshot

logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True, repr=False)
class SMTPSettings:
    host: str
    port: int
    security: str
    from_email: str
    username: str
    password: str

    @classmethod
    def from_environment(cls):
        host = os.getenv("SMTP_HOST", "").strip()
        if not host:
            return None
        security = os.getenv("SMTP_SECURITY", "starttls").strip().lower()
        if security not in ("starttls", "ssl", "none"):
            raise ValueError("SMTP_SECURITY must be starttls, ssl, or none")
        if security == "none" and host not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("SMTP without TLS requires a loopback server")
        port = int(os.getenv("SMTP_PORT") or {"starttls": 587, "ssl": 465, "none": 1025}[security])
        if not 1 <= port <= 65535:
            raise ValueError("SMTP_PORT must be between 1 and 65535")
        sender = validate_email(os.getenv("SMTP_FROM_EMAIL", "").strip(), check_deliverability=False)
        username = os.getenv("SMTP_USERNAME", "")
        password = os.getenv("SMTP_PASSWORD", "")
        if bool(username) != bool(password):
            raise ValueError("SMTP_USERNAME and SMTP_PASSWORD must be set together")
        return cls(host, port, security, sender.normalized, username, password)


def send_confirmation(settings: SMTPSettings, message):
    context = ssl.create_default_context()
    # A Python installation can lack a system CA bundle, including macOS installers.
    context.load_verify_locations(cafile=certifi.where())
    if settings.security == "ssl":
        smtp = smtplib.SMTP_SSL(settings.host, settings.port, timeout=10, context=context)
    else:
        smtp = smtplib.SMTP(settings.host, settings.port, timeout=10)
    try:
        if settings.security == "starttls":
            smtp.starttls(context=context)
        if settings.username:
            smtp.login(settings.username, settings.password)
        smtp.send_message(message)
    finally:
        # A disconnect after DATA is accepted should not trigger a second send.
        with suppress(OSError):
            smtp.close()


def deliver_one(engine: Engine, settings: SMTPSettings) -> bool:
    with engine.begin() as db:
        job = db.execute(text("""
            SELECT email_id, order_id, recipient, payload, attempt_count
            FROM email_outbox
            WHERE kind = 'payment_confirmation'
              AND sent_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
            ORDER BY next_attempt_at, email_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        """)).mappings().one_or_none()
        if job is None:
            return False

        # Enrich receipts queued by earlier versions with the saved order details.
        if "items" not in job["payload"]:
            job = {**job, "payload": {**receipt_snapshot(db, job["order_id"]), **job["payload"]}}
            db.execute(text("UPDATE email_outbox SET payload = CAST(:payload AS JSONB) WHERE email_id = :email_id"),
                       {"email_id": job["email_id"], "payload": json.dumps(job["payload"])})

        try:
            send_confirmation(settings, confirmation_message(job, settings.from_email))
        except (OSError, ValueError, KeyError, TypeError, MessageError) as exc:
            delay = min(60 * 2 ** min(job["attempt_count"], 6), 3600)
            db.execute(text("""
                UPDATE email_outbox SET attempt_count = attempt_count + 1,
                    next_attempt_at = clock_timestamp() + :delay * INTERVAL '1 second'
                WHERE email_id = :email_id
            """), {"email_id": job["email_id"], "delay": delay})
            logger.warning("Payment email %s failed (%s); retry in %ss", job["email_id"], type(exc).__name__, delay)
        else:
            db.execute(text("""
                UPDATE email_outbox SET sent_at = clock_timestamp(), attempt_count = attempt_count + 1
                WHERE email_id = :email_id
            """), {"email_id": job["email_id"]})
    return True


async def poll_email_outbox(stop: asyncio.Event, engine: Engine, settings: SMTPSettings):
    while not stop.is_set():
        try:
            if await asyncio.to_thread(deliver_one, engine, settings):
                continue
        except SQLAlchemyError as exc:
            logger.warning("Payment email worker cannot read or update the outbox (%s)", type(exc).__name__)
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=5)


@asynccontextmanager
async def payment_email_worker():
    try:
        settings = SMTPSettings.from_environment()
    except ValueError:
        logger.error("Payment email is disabled: check SMTP configuration in backend/.env")
        settings = None

    database_url = os.getenv("DATABASE_URL")
    if not settings or not database_url:
        if settings and not database_url:
            logger.error("Payment email is disabled because DATABASE_URL is missing")
        yield
        return

    stop = asyncio.Event()
    task = asyncio.create_task(poll_email_outbox(stop, postgres_engine(database_url), settings))
    try:
        yield
    finally:
        stop.set()
        await task
