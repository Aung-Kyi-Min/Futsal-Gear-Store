import { request } from './api.js';

export function normalizeProduct(product) {
  const common = {
    name: product.name, category: product.category, brand: product.brand,
    description: product.description, image_url: product.image_url,
    currency: product.currency, color: 'cream', icon: '⚽',
  };
  const variants = product.variants.map(variant => ({
    ...common, id: variant.variant_id, product_id: product.product_id,
    sku: variant.sku, size: variant.size, colour: variant.colour,
    price_cents: variant.price_minor, stock: variant.quantity_on_hand,
  }));
  return {
    ...common, id: product.product_id, variants,
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    price_cents: variants.find(variant => variant.stock > 0)?.price_cents
      ?? variants[0]?.price_cents ?? product.base_price_minor,
  };
}

export async function loadCatalog() {
  const products = [];
  let page = 1;
  let data;
  do {
    data = await request(`/api/products?page=${page}&page_size=100`);
    products.push(...data.products.map(normalizeProduct));
    page += 1;
  } while (data.products.length && products.length < data.total);
  return products;
}
