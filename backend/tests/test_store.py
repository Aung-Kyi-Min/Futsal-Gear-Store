import tempfile
import unittest
from pathlib import Path
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

    def test_duplicate_items_cannot_bypass_stock(self):
        response = self.order([{'product_id': 1, 'quantity': 20}, {'product_id': 1, 'quantity': 20}])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get('/api/products').json()['products'][0]['stock'], 24)

    def test_invalid_orders(self):
        for items, status in [([], 422), ([{'product_id': 1, 'quantity': 0}], 422),
                              ([{'product_id': 999, 'quantity': 1}], 404)]:
            self.assertEqual(self.order(items).status_code, status)


if __name__ == '__main__':
    unittest.main()
