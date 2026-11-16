"""Check the contracts used by the dashboard against isolated PostgreSQL schemas."""
import os
import unittest

from sqlalchemy import text

import test_client_catalog as fixtures
from app.auth import PublicUser


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'TEST_DATABASE_URL not configured')
class AdminIntegrationTest(unittest.TestCase):
    setUp = fixtures.ClientCatalogTest.setUp
    tearDown = fixtures.ClientCatalogTest.tearDown

    def staff(self, role='administrator'):
        self.user = PublicUser(user_id='10000000-0000-4000-8000-000000000001',
                               full_name='Amir Hakim', email='amir.admin@example.com', role=role)

    def test_permissions_and_product_variant_workflow(self):
        self.assertEqual(self.client.get('/api/admin/products').status_code, 403)
        self.staff()
        listing = self.client.get('/api/admin/products?page_size=2')
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(listing.json()['total'], 10)
        self.assertEqual(len(listing.json()['products']), 2)
        category = self.client.post('/api/admin/categories', json={'name': 'Test category'})
        brand = self.client.post('/api/admin/brands', json={'name': 'Test brand'})
        self.assertEqual(category.status_code, 201, category.text)
        self.assertEqual(brand.status_code, 201, brand.text)
        created = self.client.post('/api/admin/products', json={
            'name': 'Test indoor shoes', 'description': 'Test description',
            'category_id': category.json()['category_id'], 'brand_id': brand.json()['brand_id'],
            'base_price_minor': 19999, 'currency': 'MYR', 'image_url': None, 'is_active': True,
        })
        self.assertEqual(created.status_code, 201, created.text)
        product_id = created.json()['product_id']
        variant = self.client.post(f'/api/admin/products/{product_id}/variants', json={
            'sku': 'TEST-41', 'size': '41', 'colour': 'Blue', 'price_minor': 20999, 'is_active': True,
        })
        self.assertEqual(variant.status_code, 201, variant.text)
        self.assertEqual(variant.json()['quantity_on_hand'], 0)
        variant_id = variant.json()['variant_id']
        update = self.client.patch(f'/api/admin/products/{product_id}/variants/{variant_id}',
                                  json={'price_minor': 21999, 'is_active': False})
        self.assertEqual(update.status_code, 200, update.text)
        detail = self.client.get(f'/api/admin/products/{product_id}').json()
        self.assertFalse(detail['variants'][0]['is_active'])
        patched = self.client.patch(f'/api/admin/products/{product_id}', json={'name': 'Edited shoes', 'is_active': False})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(self.client.get(f'/api/products/{product_id}').status_code, 404)

    def test_stock_update_history_and_stale_adjustment(self):
        self.staff('manager')
        rows = self.client.get('/api/admin/inventory').json()['inventory']
        row = rows[0]
        variant_id = row['variant_id']
        old = row['quantity_on_hand']
        response = self.client.patch(f'/api/admin/inventory/{variant_id}', json={
            'expected_quantity': old, 'quantity_on_hand': old + 5, 'reason': 'Supplier restock',
        })
        self.assertEqual(response.status_code, 200, response.text)
        stale = self.client.patch(f'/api/admin/inventory/{variant_id}', json={
            'expected_quantity': old, 'quantity_on_hand': old + 7, 'reason': 'Stale count',
        })
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(self.client.get(f'/api/admin/inventory/{variant_id}').json()['quantity_on_hand'], old + 5)
        history = self.client.get(f'/api/admin/inventory/{variant_id}/movements').json()
        self.assertEqual(history[0]['quantity_delta'], 5)
        self.assertEqual(history[0]['reason'], 'Supplier restock')

    def test_order_detail_and_valid_status_transitions(self):
        self.staff('manager')
        response = self.client.get('/api/admin/orders?status=placed')
        self.assertEqual(response.status_code, 200, response.text)
        order_id = response.json()['orders'][0]['order_id']
        detail = self.client.get(f'/api/admin/orders/{order_id}').json()
        self.assertTrue(detail['items'])
        self.assertTrue(detail['delivery_address'])
        self.assertIn('customer_email', detail)
        invalid = self.client.patch(f'/api/admin/orders/{order_id}/status', json={'status': 'delivered'})
        self.assertEqual(invalid.status_code, 409)
        for status in ['processing', 'shipped', 'delivered']:
            changed = self.client.patch(f'/api/admin/orders/{order_id}/status', json={'status': status})
            self.assertEqual(changed.status_code, 200, changed.text)
            self.assertEqual(changed.json()['status'], status)
        history = self.client.get(f'/api/admin/orders/{order_id}').json()['status_history']
        self.assertEqual(history[-1]['new_status'], 'delivered')

    def test_manager_cannot_access_admin_tools(self):
        self.staff('manager')
        for path in ('managers', 'activity', 'settings'):
            self.assertEqual(self.client.get('/api/admin/' + path).status_code, 403)
        self.assertEqual(self.client.patch('/api/admin/settings', json={
            'store_name': 'Test Store', 'contact_email': 'shop@example.com',
        }).status_code, 403)

    def test_admin_manager_lifecycle_and_settings(self):
        self.staff()
        created = self.client.post('/api/admin/managers', json={
            'full_name': 'Test Manager', 'email': 'new.manager@example.com',
            'password': 'long-enough-password',
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.assertNotIn('password_hash', created.json())
        user_id = created.json()['user_id']
        for active in (False, True):
            changed = self.client.patch(f'/api/admin/managers/{user_id}', json={'is_active': active})
            self.assertEqual(changed.status_code, 200, changed.text)
            self.assertEqual(changed.json()['is_active'], active)
        settings = {'store_name': 'Test Store', 'contact_email': 'shop@example.com'}
        saved = self.client.patch('/api/admin/settings', json=settings)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.client.get('/api/admin/settings').json(), settings)
        activity = self.client.get('/api/admin/activity')
        self.assertEqual(activity.status_code, 200, activity.text)
        self.assertTrue(activity.json())
        self.assertIn('staff_name', activity.json()[0])
