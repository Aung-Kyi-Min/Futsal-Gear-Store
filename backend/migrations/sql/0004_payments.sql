BEGIN;
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(16) NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PAID'));
ALTER TABLE orders ADD COLUMN stripe_session_id TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN checkout_url TEXT;
ALTER TABLE orders ADD COLUMN paid_at TIMESTAMPTZ;
CREATE TABLE payment_events (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE email_outbox (
    email_id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id),
    kind TEXT NOT NULL CHECK (kind = 'payment_confirmation'),
    recipient VARCHAR(254) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    sent_at TIMESTAMPTZ,
    UNIQUE (order_id, kind)
);
COMMIT;
