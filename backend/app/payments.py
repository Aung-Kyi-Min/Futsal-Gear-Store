"""Stripe hosted test checkout and transactional webhook fulfillment."""
import hashlib
import hmac
import json
import os
import time
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import text

from .auth import AuthDB, CurrentUser
from .order_receipt import receipt_snapshot

router = APIRouter(prefix='/api/payments', tags=['Payments'])


def payment_settings():
    key = os.getenv('STRIPE_SECRET_KEY', '')
    origin = os.getenv('CHECKOUT_ORIGIN', 'http://localhost:5173').rstrip('/')
    parsed = urlsplit(origin)
    if not key.startswith('sk_test_'):
        raise HTTPException(503, 'Stripe test checkout is not configured')
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        raise HTTPException(503, 'Checkout origin is not configured correctly')
    if not os.getenv('STRIPE_WEBHOOK_SECRET', '').startswith('whsec_'):
        raise HTTPException(503, 'Stripe webhook is not configured')
    return key, origin


@router.post('/orders/{order_id}/checkout')
def create_checkout(order_id: UUID, db: AuthDB, user: CurrentUser, request: Request):
    key, origin = payment_settings()
    # Storage and authentication belong to the exact browser origin. Preserve
    # it across hosted checkout; localhost and 127.0.0.1 are separate origins.
    browser_origin = request.headers.get('origin')
    allowed_origins = {
        value.strip().rstrip('/') for value in os.getenv(
            'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
        ).split(',') if value.strip()
    } | {origin}
    if browser_origin:
        if browser_origin not in allowed_origins or browser_origin == '*':
            raise HTTPException(400, 'Checkout must start from an allowed storefront origin')
        origin = browser_origin
    # Serialize concurrent retries; the provider idempotency key also handles
    # a successful provider request whose response or local commit was lost.
    order = db.execute(text('''
        SELECT total_minor, currency, payment_status, stripe_session_id, checkout_url
        FROM orders WHERE order_id=:id AND customer_id=:customer FOR UPDATE
    '''), {'id': order_id, 'customer': user.user_id}).mappings().one_or_none()
    if order is None:
        raise HTTPException(404, 'Order not found')
    if order['payment_status'] == 'PAID':
        raise HTTPException(409, 'Order is already paid')
    if order['checkout_url']:
        try:
            result = httpx.get(
                f"https://api.stripe.com/v1/checkout/sessions/{order['stripe_session_id']}",
                auth=(key, ''), timeout=15,
            )
            result.raise_for_status()
            state = result.json()['status']
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(502, 'Unable to check payment. Please try again.')
        if state == 'open':
            return {'checkout_url': order['checkout_url']}
        if state != 'expired':
            raise HTTPException(409, 'Checkout completed. Waiting for payment confirmation; refresh shortly.')
    data = {
        'mode': 'payment', 'payment_method_types[0]': 'card',
        'client_reference_id': str(order_id), 'metadata[order_id]': str(order_id),
        'customer_email': user.email,
        'success_url': f'{origin}/orders/{order_id}?payment=returned',
        'cancel_url': f'{origin}/orders/{order_id}?payment=cancelled',
        'line_items[0][price_data][currency]': order['currency'].lower(),
        'line_items[0][price_data][unit_amount]': str(order['total_minor']),
        'line_items[0][price_data][product_data][name]': f'Court Supply order {order_id}',
        'line_items[0][quantity]': '1',
    }
    try:
        response = httpx.post('https://api.stripe.com/v1/checkout/sessions',
                              auth=(key, ''), data=data, timeout=15,
                              headers={'Idempotency-Key': f"checkout-{order_id}-{order['stripe_session_id'] or 'initial'}",
                                       'Stripe-Version': '2024-06-20'})
        if response.is_error:
            try:
                provider_error = response.json().get('error', {})
            except (ValueError, AttributeError):
                provider_error = {}
            if isinstance(provider_error, dict) and provider_error.get('code') == 'amount_too_small':
                minimum = 'RM2.00' if order['currency'].upper() == 'MYR' else "the provider's minimum amount"
                raise HTTPException(422, f'Stripe requires an order total of at least {minimum}. Add more items and place a new order.')
        response.raise_for_status()
        session = response.json()
        url = urlsplit(session['url'])
        if session.get('livemode') is not False or not session['id'].startswith('cs_test_') or url.scheme != 'https' or url.hostname != 'checkout.stripe.com':
            raise ValueError('Unexpected checkout session')
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(502, 'Payment provider unavailable. Retry payment from your order history.')
    db.execute(text('''UPDATE orders SET stripe_session_id=:session, checkout_url=:url
                       WHERE order_id=:id'''),
               {'session': session['id'], 'url': session['url'], 'id': order_id})
    db.commit()
    return {'checkout_url': session['url']}


def verify_event(body: bytes, signature: str):
    secret = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    if not secret.startswith('whsec_'):
        raise HTTPException(503, 'Stripe webhook is not configured')
    try:
        parts = [part.split('=', 1) for part in signature.split(',')]
        timestamp = next(value for key, value in parts if key == 't')
        if abs(time.time() - int(timestamp)) > 300:
            raise ValueError('Expired signature')
        expected = hmac.new(secret.encode(), timestamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, value) for key, value in parts if key == 'v1'):
            raise ValueError('Invalid signature')
        event = json.loads(body)
        if not isinstance(event, dict) or not isinstance(event.get('id'), str) or not isinstance(event.get('type'), str):
            raise ValueError('Invalid event')
        if event.get('livemode') is not False:
            raise ValueError('Only test events are accepted')
        return event
    except (ValueError, TypeError, StopIteration, UnicodeError):
        raise HTTPException(400, 'Invalid payment webhook')


def apply_event(db, event):
    if event['type'] not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'):
        return
    data = event.get('data')
    if not isinstance(data, dict):
        raise HTTPException(400, 'Invalid checkout event')
    session = data.get('object', {})
    if not isinstance(session, dict):
        raise HTTPException(400, 'Invalid checkout session')
    if session.get('payment_status') != 'paid':
        return
    if session.get('livemode') is not False or session.get('mode') != 'payment' or not isinstance(session.get('id'), str):
        raise HTTPException(400, 'Invalid checkout session')
    order = db.execute(text('''
        SELECT order_id, customer_id, total_minor, currency, payment_status
        FROM orders WHERE stripe_session_id=:session FOR UPDATE
    '''), {'session': session['id']}).mappings().one_or_none()
    if order is None:
        # Retry: the session-creation transaction may still be committing.
        raise HTTPException(409, 'Checkout session is not registered')
    if (session.get('amount_total') != order['total_minor'] or
            session.get('currency') != order['currency'].lower() or
            session.get('client_reference_id') != str(order['order_id'])):
        raise HTTPException(400, 'Payment does not match the order')
    inserted = db.execute(text('''INSERT INTO payment_events (event_id) VALUES (:event)
                                 ON CONFLICT DO NOTHING RETURNING event_id'''),
                          {'event': event['id']}).scalar_one_or_none()
    if inserted is None:
        return
    if order['payment_status'] != 'PAID':
        db.execute(text('''UPDATE orders SET payment_status='PAID', paid_at=clock_timestamp(),
                           updated_at=clock_timestamp() WHERE order_id=:id'''), {'id': order['order_id']})
        db.execute(text('''
            INSERT INTO email_outbox (order_id, kind, recipient, payload)
            SELECT :id, 'payment_confirmation', email, CAST(:payload AS JSONB)
            FROM users WHERE user_id=:customer
            ON CONFLICT (order_id, kind) DO NOTHING
        '''), {'id': order['order_id'], 'customer': order['customer_id'],
               'payload': json.dumps(receipt_snapshot(db, order['order_id']))})
    db.commit()


@router.post('/webhook')
async def webhook(request: Request, db: AuthDB,
                  stripe_signature: Annotated[str, Header()] = ''):
    event = verify_event(await request.body(), stripe_signature)
    # Use the synchronous DB on a worker thread, as in other application routes.
    from starlette.concurrency import run_in_threadpool
    await run_in_threadpool(apply_event, db, event)
    return {'received': True}
