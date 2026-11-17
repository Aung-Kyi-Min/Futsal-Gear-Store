-- Apply once after the staff workspace migration, or use Alembic upgrade head.
BEGIN;

CREATE TABLE discount_codes (
    code VARCHAR(32) PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
    percent_off SMALLINT NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
    expires_on DATE NOT NULL
);

ALTER TABLE orders
    ADD COLUMN discount_code VARCHAR(32) REFERENCES discount_codes(code) ON DELETE RESTRICT,
    ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_orders_discount CHECK (
        discount_minor BETWEEN 0 AND subtotal_minor
        AND (discount_code IS NOT NULL OR discount_minor = 0)
    ),
    DROP CONSTRAINT ck_orders_total_matches_components,
    ADD CONSTRAINT ck_orders_total_matches_components CHECK (
        total_minor = subtotal_minor - discount_minor + shipping_minor + tax_minor
    );

COMMIT;
