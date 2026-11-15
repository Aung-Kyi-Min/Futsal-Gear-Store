-- Fictional Malaysian store data for local PostgreSQL testing.
-- Run AFTER 0001_initial_erd.sql OR `alembic upgrade head`, in the same database.
-- pgAdmin: open this file in Query Tool and execute the entire script.
-- psql: psql -d futsal_gear_store -v ON_ERROR_STOP=1 -f backend/migrations/sql/0002_sample_data.sql
-- Prices are illustrative MYR amounts in sen (29900 = RM299.00).
-- Customers/addresses are fictional; example.com emails cannot contact customers.
-- Password values deliberately cannot authenticate. These are database fixtures.
-- Stock is current stock after all seeded orders; placed orders reserve stock too.
-- Shipping is illustrative; tax is zero, not a statement of applicable tax rules.
-- This is a one-time seed, not an Alembic migration. No existing data is deleted.

BEGIN;

-- Refuse populated databases, including a second run of this file.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users)
       OR EXISTS (SELECT 1 FROM categories)
       OR EXISTS (SELECT 1 FROM brands)
       OR EXISTS (SELECT 1 FROM products)
       OR EXISTS (SELECT 1 FROM orders) THEN
        RAISE EXCEPTION 'Sample seed requires empty business tables. Use a fresh test database.';
    END IF;
    IF (SELECT COUNT(*) FROM roles WHERE role_name IN
        ('customer', 'manager', 'administrator')) <> 3 THEN
        RAISE EXCEPTION 'Apply the initial schema and its three roles first.';
    END IF;
END $$;

-- One bulk INSERT per table. Name/SKU lookups resolve generated foreign keys.

-- Users
INSERT INTO users (user_id, role_id, full_name, email, password_hash, is_active, created_at) VALUES
    ('10000000-0000-4000-8000-000000000001', (SELECT role_id FROM roles WHERE role_name = 'administrator'), 'Amir Hakim', 'amir.admin@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000002', (SELECT role_id FROM roles WHERE role_name = 'manager'), 'Siti Nadia', 'nadia.manager@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000003', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Daniel Tan', 'daniel.tan@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000004', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Nur Aisyah', 'nur.aisyah@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000005', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Arjun Kumar', 'arjun.kumar@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000006', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Lim Wei Jun', 'lim.weijun@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000007', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Farah Izzati', 'farah.izzati@example.com', '!seed-account-login-disabled!', TRUE, '2026-09-01 09:00:00+08'),
    ('10000000-0000-4000-8000-000000000008', (SELECT role_id FROM roles WHERE role_name = 'customer'), 'Jason Wong', 'jason.wong@example.com', '!seed-account-login-disabled!', FALSE, '2026-09-01 09:00:00+08');

-- Categories
INSERT INTO categories (name) VALUES
    ('Futsal Shoes'),
    ('Jerseys'),
    ('Shorts'),
    ('Socks'),
    ('Futsal Balls'),
    ('Goalkeeper Gear'),
    ('Bags'),
    ('Training Accessories');

-- Brands
INSERT INTO brands (name) VALUES
    ('Nike'),
    ('adidas'),
    ('Mizuno'),
    ('Joma'),
    ('PUMA'),
    ('Molten'),
    ('KIPSTA');

-- Products
INSERT INTO products (category_id, brand_id, name, description, base_price_minor, currency, is_active, created_at, updated_at) VALUES
    ((SELECT category_id FROM categories WHERE name = 'Futsal Shoes'), (SELECT brand_id FROM brands WHERE name = 'Nike'), 'Lunar Gato II', 'Indoor court shoes with a cushioned midsole and non-marking outsole.', 34900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Futsal Shoes'), (SELECT brand_id FROM brands WHERE name = 'adidas'), 'Top Sala Competition', 'Lightweight indoor futsal shoes for training and match days.', 29900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Futsal Shoes'), (SELECT brand_id FROM brands WHERE name = 'Mizuno'), 'Monarcida Neo Sala Club IN', 'Durable indoor shoes with a comfortable synthetic upper.', 22900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Jerseys'), (SELECT brand_id FROM brands WHERE name = 'Joma'), 'Combi Training Jersey', 'Breathable short-sleeve training jersey.', 5900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Shorts'), (SELECT brand_id FROM brands WHERE name = 'PUMA'), 'Team Training Shorts', 'Lightweight training shorts with an elastic waistband.', 7900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Socks'), (SELECT brand_id FROM brands WHERE name = 'adidas'), 'Milano Team Socks', 'Knee-length team socks with a supportive fit.', 3500, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Futsal Balls'), (SELECT brand_id FROM brands WHERE name = 'Molten'), 'F9G Futsal Ball', 'Low-bounce size 4 ball for indoor futsal practice.', 12900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Goalkeeper Gear'), (SELECT brand_id FROM brands WHERE name = 'KIPSTA'), 'Futsal Goalkeeper Gloves', 'Padded goalkeeper gloves for recreational indoor matches.', 8900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Bags'), (SELECT brand_id FROM brands WHERE name = 'Nike'), 'Academy Team Duffel', 'Medium sports bag for shoes, kit and training essentials.', 14900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08'),
    ((SELECT category_id FROM categories WHERE name = 'Training Accessories'), (SELECT brand_id FROM brands WHERE name = 'KIPSTA'), 'Training Marker Cones - 10 Pack', 'Set of ten flexible markers for passing and agility drills.', 2900, 'MYR', TRUE, '2026-09-01 10:00:00+08', '2026-09-01 10:00:00+08');

-- Product variants
INSERT INTO product_variants (product_id, sku, size, colour, price_minor, is_active) VALUES
    ((SELECT product_id FROM products WHERE name = 'Lunar Gato II'), 'CS-001-001', 'EU 40', 'Black / White', 34900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Lunar Gato II'), 'CS-001-002', 'EU 41', 'Black / White', 34900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Lunar Gato II'), 'CS-001-003', 'EU 42', 'Black / White', 34900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Lunar Gato II'), 'CS-001-004', 'EU 43', 'Black / White', 34900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Top Sala Competition'), 'CS-002-005', 'EU 39', 'White / Blue', 29900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Top Sala Competition'), 'CS-002-006', 'EU 40', 'White / Blue', 29900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Top Sala Competition'), 'CS-002-007', 'EU 41', 'White / Blue', 29900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Top Sala Competition'), 'CS-002-008', 'EU 42', 'White / Blue', 29900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Monarcida Neo Sala Club IN'), 'CS-003-009', 'EU 40', 'Blue / White', 22900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Monarcida Neo Sala Club IN'), 'CS-003-010', 'EU 41', 'Blue / White', 22900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Monarcida Neo Sala Club IN'), 'CS-003-011', 'EU 42', 'Blue / White', 22900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Combi Training Jersey'), 'CS-004-012', 'S', 'Red', 5900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Combi Training Jersey'), 'CS-004-013', 'M', 'Red', 5900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Combi Training Jersey'), 'CS-004-014', 'L', 'Red', 5900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Combi Training Jersey'), 'CS-004-015', 'XL', 'Red', 5900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Team Training Shorts'), 'CS-005-016', 'S', 'Black', 7900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Team Training Shorts'), 'CS-005-017', 'M', 'Black', 7900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Team Training Shorts'), 'CS-005-018', 'L', 'Black', 7900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Team Training Shorts'), 'CS-005-019', 'XL', 'Black', 7900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Milano Team Socks'), 'CS-006-020', 'EU 37-39', 'Black / White', 3500, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Milano Team Socks'), 'CS-006-021', 'EU 40-42', 'Black / White', 3500, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Milano Team Socks'), 'CS-006-022', 'EU 43-45', 'Black / White', 3500, TRUE),
    ((SELECT product_id FROM products WHERE name = 'F9G Futsal Ball'), 'CS-007-023', 'Size 4', 'White / Blue', 12900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Futsal Goalkeeper Gloves'), 'CS-008-024', '7', 'Black / Orange', 8900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Futsal Goalkeeper Gloves'), 'CS-008-025', '8', 'Black / Orange', 8900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Futsal Goalkeeper Gloves'), 'CS-008-026', '9', 'Black / Orange', 8900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Academy Team Duffel'), 'CS-009-027', 'Medium', 'Black', 14900, TRUE),
    ((SELECT product_id FROM products WHERE name = 'Training Marker Cones - 10 Pack'), 'CS-010-028', '10 Pack', 'Orange', 2900, TRUE);

-- Inventory
INSERT INTO inventory (variant_id, quantity_on_hand, updated_at) VALUES
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-001'), 0, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-002'), 17, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-003'), 18, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-004'), 19, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-005'), 20, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-006'), 21, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-007'), 22, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-008'), 15, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-009'), 16, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-010'), 17, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-011'), 18, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-012'), 19, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-013'), 20, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-014'), 21, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-015'), 22, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-016'), 15, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-017'), 16, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-018'), 17, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-019'), 18, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-020'), 19, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-021'), 20, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-022'), 21, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-007-023'), 22, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), 15, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-025'), 2, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-026'), 17, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-009-027'), 18, '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), 19, '2026-11-15 10:00:00+08');

-- Orders
INSERT INTO orders (order_id, customer_id, status, subtotal_minor, shipping_minor, tax_minor, total_minor, currency, delivery_name, delivery_address, created_at, updated_at) VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'delivered', 50700, 800, 0, 51500, 'MYR', 'Daniel Tan', 'Unit 3-02, Residensi Contoh, Jalan Ujian 3, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-10-01 10:00:00+08', '2026-10-04 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'delivered', 19700, 800, 0, 20500, 'MYR', 'Nur Aisyah', 'Unit 4-02, Residensi Contoh, Jalan Ujian 4, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-10-05 10:00:00+08', '2026-10-08 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'delivered', 14700, 1200, 0, 15900, 'MYR', 'Arjun Kumar', 'Unit 5-02, Residensi Contoh, Jalan Ujian 5, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-10-12 10:00:00+08', '2026-10-15 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000006', 'delivered', 33400, 0, 0, 33400, 'MYR', 'Lim Wei Jun', 'Unit 6-02, Residensi Contoh, Jalan Ujian 6, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-10-20 10:00:00+08', '2026-10-23 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000007', 'shipped', 23800, 800, 0, 24600, 'MYR', 'Farah Izzati', 'Unit 7-02, Residensi Contoh, Jalan Ujian 7, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-11-09 10:00:00+08', '2026-11-10 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'shipped', 29900, 800, 0, 30700, 'MYR', 'Daniel Tan', 'Unit 3-02, Residensi Contoh, Jalan Ujian 3, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-11-10 10:00:00+08', '2026-11-11 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', 'placed', 17300, 800, 0, 18100, 'MYR', 'Nur Aisyah', 'Unit 4-02, Residensi Contoh, Jalan Ujian 4, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-11-14 10:00:00+08', '2026-11-14 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', 'placed', 29600, 0, 0, 29600, 'MYR', 'Arjun Kumar', 'Unit 5-02, Residensi Contoh, Jalan Ujian 5, 50000 Kuala Lumpur, Malaysia (fictional test address)', '2026-11-15 10:00:00+08', '2026-11-15 10:00:00+08');

-- Order items
INSERT INTO order_items (order_id, variant_id, product_name_snapshot, size_snapshot, colour_snapshot, quantity, unit_price_minor, line_total_minor) VALUES
    ('20000000-0000-4000-8000-000000000001', (SELECT variant_id FROM product_variants WHERE sku = 'CS-001-003'), 'Lunar Gato II', 'EU 42', 'Black / White', 1, 34900, 34900),
    ('20000000-0000-4000-8000-000000000001', (SELECT variant_id FROM product_variants WHERE sku = 'CS-005-019'), 'Team Training Shorts', 'XL', 'Black', 2, 7900, 15800),
    ('20000000-0000-4000-8000-000000000002', (SELECT variant_id FROM product_variants WHERE sku = 'CS-004-013'), 'Combi Training Jersey', 'M', 'Red', 2, 5900, 11800),
    ('20000000-0000-4000-8000-000000000002', (SELECT variant_id FROM product_variants WHERE sku = 'CS-005-017'), 'Team Training Shorts', 'M', 'Black', 1, 7900, 7900),
    ('20000000-0000-4000-8000-000000000003', (SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), 'Futsal Goalkeeper Gloves', '7', 'Black / Orange', 1, 8900, 8900),
    ('20000000-0000-4000-8000-000000000003', (SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), 'Training Marker Cones - 10 Pack', '10 Pack', 'Orange', 2, 2900, 5800),
    ('20000000-0000-4000-8000-000000000004', (SELECT variant_id FROM product_variants WHERE sku = 'CS-002-008'), 'Top Sala Competition', 'EU 42', 'White / Blue', 1, 29900, 29900),
    ('20000000-0000-4000-8000-000000000004', (SELECT variant_id FROM product_variants WHERE sku = 'CS-006-022'), 'Milano Team Socks', 'EU 43-45', 'Black / White', 1, 3500, 3500),
    ('20000000-0000-4000-8000-000000000005', (SELECT variant_id FROM product_variants WHERE sku = 'CS-008-025'), 'Futsal Goalkeeper Gloves', '8', 'Black / Orange', 1, 8900, 8900),
    ('20000000-0000-4000-8000-000000000005', (SELECT variant_id FROM product_variants WHERE sku = 'CS-009-027'), 'Academy Team Duffel', 'Medium', 'Black', 1, 14900, 14900),
    ('20000000-0000-4000-8000-000000000006', (SELECT variant_id FROM product_variants WHERE sku = 'CS-003-011'), 'Monarcida Neo Sala Club IN', 'EU 42', 'Blue / White', 1, 22900, 22900),
    ('20000000-0000-4000-8000-000000000006', (SELECT variant_id FROM product_variants WHERE sku = 'CS-006-021'), 'Milano Team Socks', 'EU 40-42', 'Black / White', 2, 3500, 7000),
    ('20000000-0000-4000-8000-000000000007', (SELECT variant_id FROM product_variants WHERE sku = 'CS-004-012'), 'Combi Training Jersey', 'S', 'Red', 1, 5900, 5900),
    ('20000000-0000-4000-8000-000000000007', (SELECT variant_id FROM product_variants WHERE sku = 'CS-005-016'), 'Team Training Shorts', 'S', 'Black', 1, 7900, 7900),
    ('20000000-0000-4000-8000-000000000007', (SELECT variant_id FROM product_variants WHERE sku = 'CS-006-020'), 'Milano Team Socks', 'EU 37-39', 'Black / White', 1, 3500, 3500),
    ('20000000-0000-4000-8000-000000000008', (SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), 'Futsal Goalkeeper Gloves', '7', 'Black / Orange', 3, 8900, 26700),
    ('20000000-0000-4000-8000-000000000008', (SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), 'Training Marker Cones - 10 Pack', '10 Pack', 'Orange', 1, 2900, 2900);

-- Order status history
INSERT INTO order_status_history (order_id, changed_by_user_id, old_status, new_status, changed_at) VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', NULL, 'placed', '2026-10-01 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-10-02 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'shipped', 'delivered', '2026-10-04 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', NULL, 'placed', '2026-10-05 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-10-06 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'shipped', 'delivered', '2026-10-08 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', NULL, 'placed', '2026-10-12 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-10-13 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'shipped', 'delivered', '2026-10-15 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000006', NULL, 'placed', '2026-10-20 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-10-21 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'shipped', 'delivered', '2026-10-23 16:00:00+08'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000007', NULL, 'placed', '2026-11-09 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-11-10 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', NULL, 'placed', '2026-11-10 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'placed', 'shipped', '2026-11-11 14:00:00+08'),
    ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', NULL, 'placed', '2026-11-14 10:00:00+08'),
    ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', NULL, 'placed', '2026-11-15 10:00:00+08');

-- Inventory movements
INSERT INTO inventory_movements (variant_id, changed_by_user_id, order_id, quantity_delta, reason, created_at) VALUES
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-003'), '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', -1, 'order_placed', '2026-10-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-019'), '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', -2, 'order_placed', '2026-10-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-013'), '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', -2, 'order_placed', '2026-10-05 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-017'), '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', -1, 'order_placed', '2026-10-05 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', -1, 'order_placed', '2026-10-12 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', -2, 'order_placed', '2026-10-12 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-008'), '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004', -1, 'order_placed', '2026-10-20 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-022'), '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004', -1, 'order_placed', '2026-10-20 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-025'), '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000005', -1, 'order_placed', '2026-11-09 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-009-027'), '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000005', -1, 'order_placed', '2026-11-09 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-011'), '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006', -1, 'order_placed', '2026-11-10 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-021'), '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006', -2, 'order_placed', '2026-11-10 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-012'), '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000007', -1, 'order_placed', '2026-11-14 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-016'), '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000007', -1, 'order_placed', '2026-11-14 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-020'), '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000007', -1, 'order_placed', '2026-11-14 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000008', -3, 'order_placed', '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000008', -1, 'order_placed', '2026-11-15 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-002'), '10000000-0000-4000-8000-000000000002', NULL, 17, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-003'), '10000000-0000-4000-8000-000000000002', NULL, 19, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-001-004'), '10000000-0000-4000-8000-000000000002', NULL, 19, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-005'), '10000000-0000-4000-8000-000000000002', NULL, 20, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-006'), '10000000-0000-4000-8000-000000000002', NULL, 21, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-007'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-002-008'), '10000000-0000-4000-8000-000000000002', NULL, 16, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-009'), '10000000-0000-4000-8000-000000000002', NULL, 16, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-010'), '10000000-0000-4000-8000-000000000002', NULL, 17, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-003-011'), '10000000-0000-4000-8000-000000000002', NULL, 19, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-012'), '10000000-0000-4000-8000-000000000002', NULL, 20, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-013'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-014'), '10000000-0000-4000-8000-000000000002', NULL, 21, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-004-015'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-016'), '10000000-0000-4000-8000-000000000002', NULL, 16, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-017'), '10000000-0000-4000-8000-000000000002', NULL, 17, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-018'), '10000000-0000-4000-8000-000000000002', NULL, 17, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-005-019'), '10000000-0000-4000-8000-000000000002', NULL, 20, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-020'), '10000000-0000-4000-8000-000000000002', NULL, 20, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-021'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-006-022'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-007-023'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-024'), '10000000-0000-4000-8000-000000000002', NULL, 19, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-025'), '10000000-0000-4000-8000-000000000002', NULL, 3, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-008-026'), '10000000-0000-4000-8000-000000000002', NULL, 17, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-009-027'), '10000000-0000-4000-8000-000000000002', NULL, 19, 'opening_stock', '2026-09-01 10:00:00+08'),
    ((SELECT variant_id FROM product_variants WHERE sku = 'CS-010-028'), '10000000-0000-4000-8000-000000000002', NULL, 22, 'opening_stock', '2026-09-01 10:00:00+08');

COMMIT;
