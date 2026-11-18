import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { adminPages, loadManagerWorkspace, minorUnits, ordersCsv, productPayload, stockPayload, variantPayload } from '../src/adminApi.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('admin list requests send bearer tokens and load every page', async () => {
  let page = 0;
  globalThis.fetch = async (url, options) => {
    page += 1;
    assert.equal(url, `/api/admin/inventory?page=${page}&page_size=100`);
    assert.equal(options.headers.Authorization, 'Bearer staff-token');
    return Response.json({ inventory: [{ variant_id: page }], total: 2 });
  };
  assert.deepEqual(await adminPages('inventory', 'staff-token'), [{ variant_id: 1 }, { variant_id: 2 }]);
});

test('a failed orders request does not hide products in the manager workspace', async () => {
  globalThis.fetch = async (url) => {
    const resource = url.split('?')[0].split('/').at(-1);
    if (resource === 'orders') return new Response('Internal Server Error', { status: 500 });
    if (resource === 'products') return Response.json({ products: [{ product_id: 1 }], total: 1 });
    if (resource === 'categories' || resource === 'brands') return Response.json([]);
    return Response.json({ [resource.replaceAll('-', '_')]: [], total: 0 });
  };
  const result = await loadManagerWorkspace('staff-token');
  assert.deepEqual(result.data.products, [{ product_id: 1 }]);
  assert.deepEqual(result.failed, ['orders']);
  assert.equal(result.data.orders, undefined);
});

test('prices convert exactly to minor units and reject fractional cents', () => {
  assert.equal(minorUnits('19.99'), 1999);
  assert.equal(minorUnits('0.1'), 10);
  assert.throws(() => minorUnits('1.001'));
  assert.throws(() => minorUnits('-1'));
  const p = productPayload({ name: ' Ball ', description: '', category_id: '2', brand_id: '3', price: '89.90', currency: 'MYR', image_url: '', is_active: 'on' });
  assert.deepEqual(p, { name: 'Ball', description: '', category_id: 2, brand_id: 3, base_price_minor: 8990, currency: 'MYR', image_url: null, is_active: true });
  assert.deepEqual(variantPayload({ sku: ' BALL-4 ', size: '4', colour: 'White', price: '89.90' }), { sku: 'BALL-4', size: '4', colour: 'White', price_minor: 8990, is_active: false });
});

test('stock adjustments send the previously loaded stock and a required reason', () => {
  assert.deepEqual(stockPayload({ quantity_on_hand: 5 }, { quantity: '8', reason: ' Restock ' }), { expected_quantity: 5, quantity_on_hand: 8, reason: 'Restock' });
  assert.throws(() => stockPayload({ quantity_on_hand: 5 }, { quantity: '1.5', reason: 'Restock' }));
  assert.throws(() => stockPayload({ quantity_on_hand: 5 }, { quantity: '8', reason: '  ' }));
});

test('CSV preserves commas and quotes and neutralizes spreadsheet formulas', () => {
  const csv = ordersCsv([{ order_id: '123', delivery_name: '=SUM(1,2)', created_at: '2026-11-15', total_minor: 1999, currency: 'MYR', status: 'placed' }]);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /"19.99","MYR","placed"/);
});

test('expired tokens surface as 401 instead of displaying demo records', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'Invalid or expired bearer token' }, { status: 401 });
  await assert.rejects(adminPages('orders', 'expired'), err => err.status === 401);
});
