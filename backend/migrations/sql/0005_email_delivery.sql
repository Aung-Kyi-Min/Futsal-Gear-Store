BEGIN;

ALTER TABLE email_outbox
    ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX ix_email_outbox_ready
    ON email_outbox (next_attempt_at, email_id)
    WHERE sent_at IS NULL;

COMMIT;
