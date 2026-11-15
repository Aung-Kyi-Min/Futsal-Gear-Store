import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request, storeToken, storedToken } from '../src/api.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.sessionStorage; });

test('sends JSON credentials and bearer token in the expected format', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/login');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { email: 'player@example.com', password: 'test password' });
    return Response.json({ access_token: 'new-token' });
  };
  assert.deepEqual(await request('/api/auth/login', {
    method: 'POST', token: 'test-token', body: { email: 'player@example.com', password: 'test password' },
  }), { access_token: 'new-token' });
});

test('preserves auth failures and formats FastAPI validation errors', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'Invalid email or password' }, { status: 401 });
  await assert.rejects(request('/api/auth/login'), error => error.status === 401 && error.message === 'Invalid email or password');
  globalThis.fetch = async () => Response.json({ detail: [{ loc: ['body', 'password'], msg: 'Too short' }] }, { status: 422 });
  await assert.rejects(request('/api/auth/register'), /password: Too short/);
});

test('handles non-JSON server errors and an unavailable backend', async () => {
  globalThis.fetch = async () => new Response('<h1>Unavailable</h1>', { status: 503 });
  await assert.rejects(request('/api/products'), /could not complete/);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(request('/api/products'), error => error.status === 0 && /Unable to connect/.test(error.message));
});

test('storage restrictions do not break authentication', () => {
  globalThis.sessionStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(storedToken(), '');
  assert.doesNotThrow(() => { storeToken('token'); storeToken(''); });
});
