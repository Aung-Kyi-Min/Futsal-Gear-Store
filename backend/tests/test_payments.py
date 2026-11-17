"""Signed webhook and durable payment state tests."""
import hashlib
import hmac
import json
import os
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from sqlalchemy import text

import test_client_catalog as fixtures
from app.payments import verify_event

SECRET = 'whsec_test_secret'


def signed(event, timestamp=None):
    body = json.dumps(event).encode()
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    digest = hmac.new(SECRET.encode(), stamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    return body, f't={stamp},v1={digest}'


class SignatureTest(unittest.TestCase):
    @patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_signature_raw_body_timestamp_and_test_mode(self):
        event = {'id': 'evt_test', 'type': 'ignored', 'livemode': False}
        body, signature = signed(event)
        self.assertEqual(verify_event(body, signature), event)
        for payload, header in [(body + b' ', signature), signed(event, 1),
                                signed({**event, 'livemode': True}), (body, 'bad')]:
            with self.assertRaises(HTTPException) as error:
                verify_event(payload, header)
            self.assertEqual(error.exception.status_code, 400)


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'TEST_DATABASE_URL not configured')
class PaymentIntegrationTest(unittest.TestCase):
    setUp = fixtures.ClientCatalogTest.setUp
    tearDown = fixtures.ClientCatalogTest.tearDown
    order = fixtures.ClientCatalogTest.order

    def create(self):
        response = self.order([{'variant_id': 3, 'quantity': 1}])
        self.assertEqual(response.status_code, 201, response.text)
        self.order_id = response.json()['order_id']
        self.total = response.json()['total_minor']
        with self.engine.begin() as db:
            db.execute(text("UPDATE orders SET stripe_session_id='cs_test_example' WHERE order_id=:id"),
                       {'id': self.order_id})

    def event(self, event_id='evt_payment', **values):
        return {'id': event_id, 'type': 'checkout.session.completed', 'livemode': False,
                'data': {'object': {'id': 'cs_test_example', 'mode': 'payment', 'livemode': False,
                                    'client_reference_id': self.order_id, 'payment_status': 'paid',
                                    'amount_total': self.total, 'currency': 'myr', **values}}}

    def deliver(self, event):
        body, signature = signed(event)
        return self.client.post('/api/payments/webhook', content=body,
                                headers={'Stripe-Signature': signature})

    @patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_repeated_and_concurrent_events_queue_exactly_one_email(self):
        self.create()
        events = [self.event(), self.event(), self.event('evt_other')]
        with ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(pool.map(self.deliver, events))
        self.assertEqual([r.status_code for r in responses], [200, 200, 200])
        with self.engine.connect() as db:
            row = db.execute(text('SELECT payment_status, status, paid_at FROM orders WHERE order_id=:id'),
                             {'id': self.order_id}).one()
            self.assertEqual(tuple(row[:2]), ('PAID', 'placed'))
            self.assertIsNotNone(row.paid_at)
            self.assertEqual(db.execute(text('SELECT count(*) FROM email_outbox')).scalar_one(), 1)
            self.assertEqual(db.execute(text('SELECT count(*) FROM payment_events')).scalar_one(), 2)

    @patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_mismatches_and_unpaid_sessions_do_not_confirm(self):
        self.create()
        for changes in ({'amount_total': 1}, {'currency': 'usd'}, {'client_reference_id': 'wrong'}):
            self.assertEqual(self.deliver(self.event(**changes)).status_code, 400)
        self.assertEqual(self.deliver(self.event(payment_status='unpaid')).status_code, 200)
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT count(*) FROM email_outbox')).scalar_one(), 0)
        self.assertEqual(self.deliver({'id': 'evt_ignored', 'type': 'unrelated', 'livemode': False}).status_code, 200)

    @patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_queue_failure_rolls_back_payment_and_event_for_retry(self):
        self.create()
        with self.engine.begin() as db:
            db.execute(text("ALTER TABLE email_outbox ADD CONSTRAINT simulate_failure CHECK (false)"))
        with self.assertRaises(Exception):
            self.deliver(self.event())
        with self.engine.begin() as db:
            self.assertEqual(db.execute(text('SELECT count(*) FROM payment_events')).scalar_one(), 0)
            self.assertEqual(db.execute(text('SELECT payment_status FROM orders WHERE order_id=:id'),
                                        {'id': self.order_id}).scalar_one(), 'UNPAID')
            db.execute(text('ALTER TABLE email_outbox DROP CONSTRAINT simulate_failure'))
        self.assertEqual(self.deliver(self.event()).status_code, 200)

    @patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_test_example', 'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_checkout_timeout_retry_and_server_amount(self):
        self.create()
        path = f'/api/payments/orders/{self.order_id}/checkout'
        with patch('app.payments.httpx.post', side_effect=httpx.ReadTimeout('timeout')):
            self.assertEqual(self.client.post(path).status_code, 502)
        response = httpx.Response(200, json={'id': 'cs_test_example', 'livemode': False,
                                  'url': 'https://checkout.stripe.com/c/pay/cs_test_example'},
                                  request=httpx.Request('POST', 'https://api.stripe.com'))
        with patch('app.payments.httpx.post', return_value=response) as provider:
            self.assertEqual(self.client.post(path).status_code, 200)
            self.assertEqual(provider.call_args.kwargs['data']['line_items[0][price_data][unit_amount]'], str(self.total))
            self.assertIn(self.order_id, provider.call_args.kwargs['headers']['Idempotency-Key'])
        response = httpx.Response(200, json={'status': 'open'}, request=httpx.Request('GET', 'https://api.stripe.com'))
        with patch('app.payments.httpx.get', return_value=response), patch('app.payments.httpx.post') as provider:
            self.assertEqual(self.client.post(path).status_code, 200)
            provider.assert_not_called()

    @patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_test_example', 'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_expired_session_replacement_and_ownership(self):
        self.create()
        path = f'/api/payments/orders/{self.order_id}/checkout'
        with self.engine.begin() as db:
            db.execute(text("UPDATE orders SET checkout_url='https://checkout.stripe.com/old' WHERE order_id=:id"),
                       {'id': self.order_id})
        expired = httpx.Response(200, json={'status': 'expired'}, request=httpx.Request('GET', 'https://api.stripe.com'))
        replacement = httpx.Response(200, json={'id': 'cs_test_replacement', 'livemode': False,
                                    'url': 'https://checkout.stripe.com/c/pay/cs_test_replacement'},
                                    request=httpx.Request('POST', 'https://api.stripe.com'))
        with patch('app.payments.httpx.get', return_value=expired), patch('app.payments.httpx.post', return_value=replacement) as provider:
            self.assertEqual(self.client.post(path).status_code, 200)
            self.assertTrue(provider.call_args.kwargs['headers']['Idempotency-Key'].endswith('cs_test_example'))
        self.user = self.user.model_copy(update={'user_id': '10000000-0000-4000-8000-000000000004'})
        self.assertEqual(self.client.post(path).status_code, 404)

    @patch.dict(os.environ, {'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_async_success_after_unpaid_completion(self):
        self.create()
        self.assertEqual(self.deliver(self.event(payment_status='unpaid')).status_code, 200)
        event = self.event('evt_async')
        event['type'] = 'checkout.session.async_payment_succeeded'
        self.assertEqual(self.deliver(event).status_code, 200)
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT count(*) FROM email_outbox')).scalar_one(), 1)

    @patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_test_example', 'STRIPE_WEBHOOK_SECRET': SECRET})
    def test_minimum_amount_error_is_actionable(self):
        self.create()
        response = httpx.Response(400, json={'error': {'code': 'amount_too_small'}},
                                  request=httpx.Request('POST', 'https://api.stripe.com'))
        with patch('app.payments.httpx.post', return_value=response):
            result = self.client.post(f'/api/payments/orders/{self.order_id}/checkout')
        self.assertEqual(result.status_code, 422)
        self.assertIn('RM2.00', result.json()['detail'])
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT payment_status FROM orders WHERE order_id=:id'),
                                        {'id': self.order_id}).scalar_one(), 'UNPAID')

    @patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_test_example', 'STRIPE_WEBHOOK_SECRET': SECRET,
                            'CHECKOUT_ORIGIN': 'http://localhost:5173',
                            'CORS_ORIGINS': 'http://localhost:5173,http://127.0.0.1:5173'})
    def test_checkout_returns_to_same_browser_origin(self):
        self.create()
        response = httpx.Response(200, json={'id': 'cs_test_example', 'livemode': False,
                                  'url': 'https://checkout.stripe.com/c/pay/cs_test_example'},
                                  request=httpx.Request('POST', 'https://api.stripe.com'))
        path = f'/api/payments/orders/{self.order_id}/checkout'
        with patch('app.payments.httpx.post', return_value=response) as provider:
            result = self.client.post(path, headers={'Origin': 'http://127.0.0.1:5173'})
            self.assertEqual(result.status_code, 200)
            payload = provider.call_args.kwargs['data']
            for field in ('success_url', 'cancel_url'):
                self.assertTrue(payload[field].startswith(f'http://127.0.0.1:5173/orders/{self.order_id}?'))
        with patch('app.payments.httpx.post') as provider:
            result = self.client.post(path, headers={'Origin': 'https://untrusted.example'})
            self.assertEqual(result.status_code, 400)
            provider.assert_not_called()
