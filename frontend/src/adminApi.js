import { request } from './api.js';

export async function adminPages(resource, token, signal) {
  const rows = [];
  const field = resource.replaceAll('-', '_');
  let page = 1;
  let data;
  do {
    data = await request(`/api/admin/${resource}?page=${page}&page_size=100`, { token, signal });
    rows.push(...data[field]);
    page += 1;
  } while (data[field].length && rows.length < data.total);
  return rows;
}

export async function loadManagerWorkspace(token, signal) {
  const requests = {
    products: adminPages('products', token, signal),
    orders: adminPages('orders', token, signal),
    inventory: adminPages('inventory', token, signal),
    categories: request('/api/categories', { signal }),
    brands: request('/api/brands', { signal }),
    discounts: adminPages('discount-codes', token, signal),
  };
  const results = await Promise.allSettled(Object.values(requests));
  const data = {};
  const failed = [];
  Object.keys(requests).forEach((resource, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') data[resource] = result.value;
    else if (result.reason?.status === 401) throw result.reason;
    else failed.push(resource);
  });
  return { data, failed };
}

export function minorUnits(value) {
  const amount = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a non-negative price with up to two decimal places.');
  const [whole, fraction = ''] = amount.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Price is too large.');
  return result;
}

export function productPayload(values) {
  return {
    name: values.name.trim(), description: values.description,
    category_id: Number(values.category_id), brand_id: Number(values.brand_id),
    base_price_minor: minorUnits(values.price), currency: values.currency.toUpperCase(),
    image_url: values.image_url.trim() || null, is_active: values.is_active === 'on',
  };
}

export function variantPayload(values) {
  return { sku: values.sku.trim(), size: values.size.trim(), colour: values.colour.trim(),
    price_minor: minorUnits(values.price), is_active: values.is_active === 'on' };
}

export function stockPayload(row, values) {
  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    throw new Error('Stock must be a whole number between 0 and 2147483647.');
  }
  if (!values.reason.trim()) throw new Error('Enter a reason for the adjustment.');
  return { expected_quantity: row.quantity_on_hand, quantity_on_hand: quantity, reason: values.reason.trim() };
}

// Quote cells and neutralize formulas in user-supplied names before spreadsheet export.
export function ordersCsv(orders) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r\n]/.test(text.trimStart())) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [['Order', 'Customer', 'Created', 'Total', 'Currency', 'Status'], ...orders.map(o => [
    o.order_id, o.delivery_name, o.created_at, (o.total_minor / 100).toFixed(2), o.currency, o.status,
  ])].map(row => row.map(cell).join(',')).join('\r\n');
}
