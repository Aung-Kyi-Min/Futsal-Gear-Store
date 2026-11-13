import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from sqlite3 import IntegrityError

from fastapi.testclient import TestClient
from app import main


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        main.DB_PATH = Path(self.directory.name) / 'test.db'
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.directory.cleanup()

    def order(self, items):
        return self.client.post('/api/orders', json={
            'customer_name': 'Test Player', 'email': 'player@example.com',
            'address': '123 Court Street', 'items': items})

    def test_catalog(self):
        response = self.client.get('/api/products')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['products']), 6)

    def test_order_prices_and_stock(self):
        response = self.order([{'product_id': 1, 'quantity': 2}])
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['total_cents'], 51800)
        self.assertEqual(self.client.get('/api/products').json()['products'][0]['stock'], 22)
        with main.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM orders').fetchone()[0], 1)

    def test_variants_have_separate_inventory_and_unique_identifiers(self):
        with closing(main.connect()) as db, db:
            db.execute("""
                INSERT INTO product_variants (product_id, sku, size, color, price_cents, stock)
                VALUES (1, 'BOOT-42-LIME', '42', 'lime', 26900, 1)
            """)
            insert_variant = """
                INSERT INTO product_variants (product_id, sku, size, color, price_cents, stock)
                VALUES (?, ?, ?, ?, 26900, ?)
            """
            for variant in [
                (1, 'boot-42-lime', '43', 'lime', 1),
                (1, 'BOOT-42-OTHER', '42', 'Lime', 1),
                (999, 'UNKNOWN-42', '42', 'lime', 1),
                (1, 'BOOT-43-LIME', '43', 'lime', -1),
            ]:
                with self.subTest(variant=variant), self.assertRaises(IntegrityError):
                    db.execute(insert_variant, variant)

        self.assertEqual(self.order([{'product_id': 1, 'quantity': 2}]).status_code, 201)
        with closing(main.connect()) as db:
            variants = db.execute(
                'SELECT sku, stock FROM product_variants WHERE product_id = 1 ORDER BY id'
            )
            self.assertEqual([tuple(row) for row in variants], [('SKU-1', 22), ('BOOT-42-LIME', 1)])

    def test_duplicate_items_cannot_bypass_stock(self):
        response = self.order([{'product_id': 1, 'quantity': 20}, {'product_id': 1, 'quantity': 20}])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get('/api/products').json()['products'][0]['stock'], 24)

    def test_invalid_orders(self):
        for items, status in [([], 422), ([{'product_id': 1, 'quantity': 0}], 422),
                              ([{'product_id': 999, 'quantity': 1}], 404)]:
            self.assertEqual(self.order(items).status_code, status)


class CatalogMigrationTest(unittest.TestCase):
    def test_migration_preserves_products_inventory_and_order_items(self):
        with tempfile.TemporaryDirectory() as directory:
            self.addCleanup(setattr, main, 'DB_PATH', main.DB_PATH)
            main.DB_PATH = Path(directory) / 'legacy.db'
            with closing(main.connect()) as db:
                db.executescript("""
                    CREATE TABLE products (
                        id INTEGER PRIMARY KEY, name TEXT, category TEXT, description TEXT,
                        price_cents INTEGER, icon TEXT, color TEXT, stock INTEGER
                    );
                    CREATE TABLE order_items (
                        order_id TEXT, product_id INTEGER, quantity INTEGER, unit_price_cents INTEGER
                    );
                    INSERT INTO products VALUES
                        (31, 'Legacy Boot', 'Footwear', 'Original description', 15000, '👟', 'blue', 3);
                    INSERT INTO order_items VALUES ('old-order', 31, 2, 14000);
                """)

            for _ in range(2):
                with TestClient(main.app) as client:
                    self.assertEqual(client.get('/api/products').json(), {
                        'products': [{
                            'id': 31, 'name': 'Legacy Boot', 'category': 'Footwear',
                            'description': 'Original description', 'price_cents': 15000,
                            'icon': '👟', 'color': 'blue', 'stock': 3,
                        }],
                        'currency': 'MYR',
                    })
                with closing(main.connect()) as db:
                    self.assertEqual(tuple(db.execute('SELECT * FROM order_items').fetchone()),
                                     ('old-order', 31, 2, 14000))
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM product_variants').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
