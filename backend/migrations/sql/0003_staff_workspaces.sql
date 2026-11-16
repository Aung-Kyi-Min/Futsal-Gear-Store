-- Apply after the initial schema (and optional sample data), or use Alembic upgrade head.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT ck_orders_status;
ALTER TABLE orders ADD CONSTRAINT ck_orders_status CHECK (status IN ('placed', 'processing', 'shipped', 'delivered'));
ALTER TABLE order_status_history DROP CONSTRAINT ck_order_status_history_old_status;
ALTER TABLE order_status_history ADD CONSTRAINT ck_order_status_history_old_status CHECK (old_status IN ('placed', 'processing', 'shipped', 'delivered'));
ALTER TABLE order_status_history DROP CONSTRAINT ck_order_status_history_new_status;
ALTER TABLE order_status_history ADD CONSTRAINT ck_order_status_history_new_status CHECK (new_status IN ('placed', 'processing', 'shipped', 'delivered'));
CREATE TABLE shop_settings (id SMALLINT PRIMARY KEY CHECK (id = 1), store_name VARCHAR(160) NOT NULL, contact_email VARCHAR(254) NOT NULL);
INSERT INTO shop_settings VALUES (1, 'Court Supply', 'contact@courtsupply.com');
COMMIT;
