"""PostgreSQL integration checks; set TEST_DATABASE_URL to a disposable local DB.

Each test creates and drops its own schema, leaving existing schemas untouched.
"""
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app import main
from app.auth import PublicUser, get_auth_db, get_current_user, get_signing_secret
from app.catalog import get_catalog_db
from app.discounts import shop_date


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
            db.exec_driver_sql((root / '0004_discount_codes.sql').read_text())
            db.exec_driver_sql((root / '0004_payments.sql').read_text())
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

    def order(self, items, **options):
        return self.client.post('/api/customer/orders', json={
            'customer_name': 'Daniel Tan', 'address': '123 Test Street, Kuala Lumpur', 'items': items, **options,
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

    def test_order_history_is_private_and_shows_checkout_and_staff_updates(self):
        with self.engine.begin() as db:
            db.execute(text("UPDATE orders SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 day'"))
        checkout = self.order([{'variant_id': 3, 'quantity': 2}])
        self.assertEqual(checkout.status_code, 201, checkout.text)
        order_id = checkout.json()['order_id']
        order_path = f'/api/customer/orders/{order_id}'
        listing = self.client.get('/api/customer/orders?page_size=1')
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(listing.headers['cache-control'], 'private, no-store')
        self.assertEqual(listing.json()['total'], 3)
        self.assertEqual([order['order_id'] for order in listing.json()['orders']], [order_id])
        second_page = self.client.get('/api/customer/orders?page_size=1&page=2').json()
        self.assertNotEqual(second_page['orders'][0]['order_id'], order_id)

        customer = self.user
        self.user = PublicUser(user_id='10000000-0000-4000-8000-000000000001',
                               full_name='Amir Hakim', email='amir.admin@example.com', role='administrator')
        status = self.client.patch(f'/api/admin/orders/{order_id}/status', json={'status': 'processing'})
        self.assertEqual(status.status_code, 200, status.text)
        self.assertEqual(self.client.get(order_path).status_code, 404)
        self.assertEqual(self.client.get('/api/customer/orders').json()['orders'], [])

        self.user = customer
        detail = self.client.get(order_path)
        self.assertEqual(detail.status_code, 200, detail.text)
        order = detail.json()
        self.assertEqual(order['total_minor'], 69800)
        self.assertEqual(order['delivery_address'], '123 Test Street, Kuala Lumpur')
        self.assertEqual(order['items'][0]['product_name_snapshot'], 'Lunar Gato II')
        self.assertEqual(order['items'][0]['quantity'], 2)
        self.assertEqual([event['new_status'] for event in order['status_history']], ['placed', 'processing'])
        self.assertNotIn('changed_by_user_id', order['status_history'][1])

        main.app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get('/api/customer/orders').status_code, 401)
        self.assertEqual(self.client.get(order_path).status_code, 401)

    def test_manager_discount_is_validated_at_quote_and_checkout_and_saved_on_order(self):
        today = shop_date()
        code_url = '/api/admin/discount-codes'
        code = {'code': 'futsal10', 'percent_off': 10, 'expires_on': today.isoformat()}
        self.assertEqual(self.client.post(code_url, json=code).status_code, 403)
        customer = self.user
        self.user = PublicUser(user_id='10000000-0000-4000-8000-000000000002',
                               full_name='Test Manager', email='manager@example.com', role='manager')
        self.assertEqual(self.client.post(code_url, json={
            **code, 'expires_on': (today - timedelta(days=1)).isoformat(),
        }).status_code, 422)
        created = self.client.post(code_url, json=code)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()['code'], 'FUTSAL10')
        self.assertEqual(self.client.post(code_url, json={**code, 'code': 'Futsal10'}).status_code, 409)
        self.assertEqual(self.client.get(code_url).json()['discount_codes'], [created.json()])
        self.user = customer

        with self.engine.begin() as db:
            db.execute(text('UPDATE product_variants SET price_minor=34905 WHERE variant_id=3'))
            before = db.execute(text('SELECT quantity_on_hand FROM inventory WHERE variant_id=3')).scalar_one()
        items = [{'variant_id': 3, 'quantity': 1}]
        quote = self.client.post('/api/customer/orders/quote', json={'items': items, 'discount_code': ' futsal10 '})
        self.assertEqual(quote.status_code, 200, quote.text)
        self.assertEqual(quote.json(), {
            'subtotal_minor': 34905, 'discount_code': 'FUTSAL10',
            'discount_minor': 3491, 'total_minor': 31414, 'currency': 'MYR',
        })
        self.assertEqual(self.order(items, discount_code='UNKNOWN').status_code, 422)
        with patch('app.discounts.shop_date', return_value=today + timedelta(days=1)):
            expired = self.order(items, discount_code='futsal10')
            self.assertEqual(expired.status_code, 422)
            self.assertEqual(expired.json()['detail'], 'Discount code has expired')
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT quantity_on_hand FROM inventory WHERE variant_id=3')).scalar_one(), before)

        checkout = self.order(items, discount_code='futsal10')
        self.assertEqual(checkout.status_code, 201, checkout.text)
        order_id = checkout.json()['order_id']
        self.assertEqual(checkout.json()['total_minor'], 31414)
        order = self.client.get(f'/api/customer/orders/{order_id}').json()
        self.assertEqual((order['discount_code'], order['discount_minor'], order['total_minor']),
                         ('FUTSAL10', 3491, 31414))
        self.assertEqual(order['items'][0]['line_total_minor'], 34905)

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
