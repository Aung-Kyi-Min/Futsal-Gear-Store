"""PostgreSQL integration checks; set TEST_DATABASE_URL to a disposable local DB.

Each test creates and drops its own schema, leaving existing schemas untouched.
"""
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app import main
from app.auth import PublicUser, get_auth_db, get_current_user, get_signing_secret
from app.catalog import get_catalog_db


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'TEST_DATABASE_URL not configured')
class ClientCatalogTest(unittest.TestCase):
    def setUp(self):
        self.schema = 'client_test_' + uuid4().hex
        self.admin_engine = create_engine(os.environ['TEST_DATABASE_URL'])
        with self.admin_engine.begin() as db:
            db.execute(text(f'CREATE SCHEMA {self.schema}'))
        self.engine = create_engine(os.environ['TEST_DATABASE_URL'],
                                    connect_args={'options': f'-csearch_path={self.schema}'})
        root = Path(__file__).resolve().parents[1] / 'migrations' / 'sql'
        with self.engine.connect() as db:
            db.exec_driver_sql((root / '0001_initial_erd.sql').read_text())
            db.exec_driver_sql((root / '0002_sample_data.sql').read_text())
            db.exec_driver_sql((root / '0003_staff_workspaces.sql').read_text())
        self.directory = tempfile.TemporaryDirectory()
        self.old_path = main.DB_PATH
        main.DB_PATH = Path(self.directory.name) / 'demo.db'

        def connection():
            with self.engine.connect() as db:
                yield db

        self.user = PublicUser(user_id='10000000-0000-4000-8000-000000000003',
                               full_name='Daniel Tan', email='daniel.tan@example.com', role='customer')
        main.app.dependency_overrides[get_catalog_db] = connection
        main.app.dependency_overrides[get_auth_db] = connection
        main.app.dependency_overrides[get_current_user] = lambda: self.user
        main.app.dependency_overrides[get_signing_secret] = lambda: 'x' * 40
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.clear()
        main.DB_PATH = self.old_path
        self.directory.cleanup()
        self.engine.dispose()
        with self.admin_engine.begin() as db:
            db.execute(text(f'DROP SCHEMA {self.schema} CASCADE'))
        self.admin_engine.dispose()

    def order(self, items):
        return self.client.post('/api/customer/orders', json={
            'customer_name': 'Daniel Tan', 'address': '123 Test Street, Kuala Lumpur', 'items': items,
        })

    def test_public_catalog_filters_inactive_products_and_variants(self):
        with self.engine.begin() as db:
            db.execute(text('UPDATE products SET is_active=false WHERE product_id=2'))
            db.execute(text('UPDATE product_variants SET is_active=false WHERE variant_id=2'))
        response = self.client.get('/api/products?page_size=2')
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['total'], 9)
        self.assertEqual(len(body['products']), 2)
        first = body['products'][0]
        self.assertNotIn('is_active', first)
        self.assertEqual(first['product_id'], 1)
        self.assertEqual(first['variants'][0]['quantity_on_hand'], 0)
        self.assertNotIn(2, [v['variant_id'] for v in first['variants']])
        self.assertNotIn(2, [p['product_id'] for p in body['products']])
        filtered = self.client.get('/api/products?search=Lunar&category_id=1').json()
        self.assertEqual(filtered['total'], 1)
        self.assertEqual(self.client.get('/api/products?page_size=101').status_code, 422)

    def test_checkout_uses_variant_price_and_records_stock_and_audit(self):
        with self.engine.connect() as db:
            before = db.execute(text('SELECT quantity_on_hand FROM inventory WHERE variant_id=3')).scalar_one()
        response = self.order([{'variant_id': 3, 'quantity': 2}])
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['total_minor'], 69800)
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT quantity_on_hand FROM inventory WHERE variant_id=3')).scalar_one(), before - 2)
            order_id = response.json()['order_id']
            self.assertEqual(db.execute(text('SELECT count(*) FROM order_items WHERE order_id=:id'), {'id': order_id}).scalar_one(), 1)
            self.assertEqual(db.execute(text('SELECT sum(quantity_delta) FROM inventory_movements WHERE order_id=:id'), {'id': order_id}).scalar_one(), -2)
            self.assertEqual(db.execute(text('SELECT new_status FROM order_status_history WHERE order_id=:id'), {'id': order_id}).scalar_one(), 'placed')

    def test_stock_failure_creates_no_order_or_partial_deduction(self):
        with self.engine.connect() as db:
            before = db.execute(text('SELECT count(*) FROM orders')).scalar_one()
        response = self.order([{'variant_id': 3, 'quantity': 1}, {'variant_id': 25, 'quantity': 3}])
        self.assertEqual(response.status_code, 409)
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT count(*) FROM orders')).scalar_one(), before)
        self.assertEqual(self.order([{'variant_id': 3, 'quantity': 60}, {'variant_id': 3, 'quantity': 40}]).status_code, 422)
        main.app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.order([{'variant_id': 3, 'quantity': 1}]).status_code, 401)

    def test_concurrent_checkout_cannot_oversell_last_unit(self):
        with self.engine.begin() as db:
            db.execute(text('UPDATE inventory SET quantity_on_hand=1 WHERE variant_id=3'))
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.order([{'variant_id': 3, 'quantity': 1}]), range(2)))
        self.assertEqual(sorted(r.status_code for r in responses), [201, 409])
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT quantity_on_hand FROM inventory WHERE variant_id=3')).scalar_one(), 0)
