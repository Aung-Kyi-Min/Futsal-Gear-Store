"""Forward test webhooks using the same Stripe key as FastAPI."""
import os
import shutil
from pathlib import Path

from dotenv import dotenv_values


def main():
    config = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    key = os.getenv("STRIPE_SECRET_KEY", config.get("STRIPE_SECRET_KEY") or "")
    if not key.startswith("sk_test_"):
        raise SystemExit("Set STRIPE_SECRET_KEY to your Stripe test secret in backend/.env.")
    stripe = shutil.which("stripe")
    if stripe is None:
        raise SystemExit("Install the Stripe CLI first: brew install stripe")
    os.execve(
        stripe,
        [
            stripe, "listen",
            "--events", "checkout.session.completed,checkout.session.async_payment_succeeded",
            "--forward-to", "http://127.0.0.1:8000/api/payments/webhook",
        ],
        {**os.environ, "STRIPE_API_KEY": key},
    )


if __name__ == "__main__":
    main()
