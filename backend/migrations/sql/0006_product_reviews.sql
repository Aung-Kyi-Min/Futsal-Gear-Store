BEGIN;

-- Keep the established review columns and data used by older local setups.
CREATE TABLE IF NOT EXISTS product_reviews (
    review_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL,
    review_text VARCHAR(500) NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_by_user_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
    hidden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_product_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT ck_product_reviews_text_length CHECK (length(trim(review_text)) BETWEEN 3 AND 500),
    CONSTRAINT ck_product_reviews_moderation_state CHECK (
        (is_hidden AND hidden_by_user_id IS NOT NULL AND hidden_at IS NOT NULL)
        OR (NOT is_hidden AND hidden_by_user_id IS NULL AND hidden_at IS NULL)
    ),
    CONSTRAINT uq_product_reviews_product_user UNIQUE (product_id, user_id)
);

ALTER TABLE product_reviews
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(order_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ix_product_reviews_public
    ON product_reviews (product_id, created_at DESC)
    WHERE is_hidden = FALSE;

COMMIT;
