import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, normalizeProduct } from '../src/catalog.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const product = {
  product_id: 42, name: 'Indoor shoes', description: 'Training shoes', category: 'Futsal Shoes',
  brand: 'Example', base_price_minor: 20000, currency: 'MYR', image_url: null,
  variants: [
    { variant_id: 101, sku: 'SHOE-40', size: 'EU 40', colour: 'Blue', price_minor: 20000, quantity_on_hand: 0 },
    { variant_id: 102, sku: 'SHOE-41', size: 'EU 41', colour: 'Blue', price_minor: 22000, quantity_on_hand: 3 },
  ],
};
test('preserves distinct variant IDs, prices and stock for cart items', () => {
  const p = normalizeProduct(product);
  assert.equal(p.id, 42);
  assert.equal(p.price_cents, 22000);
  assert.equal(p.stock, 3);
  assert.deepEqual(p.variants.map(v => [v.id, v.product_id, v.stock]), [[101, 42, 0], [102, 42, 3]]);
});
test('loads every public catalog page rather than silently dropping later products', async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls += 1;
    assert.equal(url, `/api/products?page=${calls}&page_size=100`);
    return Response.json({ products: [{ ...product, product_id: calls }], total: 2, page: calls, page_size: 100 });
  };
  assert.deepEqual((await loadCatalog()).map(p => p.id), [1, 2]);
  assert.equal(calls, 2);
});
