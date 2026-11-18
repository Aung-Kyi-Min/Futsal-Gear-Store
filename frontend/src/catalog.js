import { request } from './api.js';
import sampleImages from './productImages.json' with { type: 'json' };

const sampleAngleImages = {
  'Lunar Gato II': '/images/futsal-shoes-black-views.jpg',
  'Top Sala Competition': '/images/futsal-shoes-blue-views.jpg',
  'Monarcida Neo Sala Club IN': '/images/futsal-shoes-bluewhite-views.jpg',
  'Combi Training Jersey': '/images/training-jersey-red-views.jpg',
  'Team Training Shorts': '/images/training-shorts-black-views.jpg',
  'Milano Team Socks': '/images/team-socks-black-views.jpg',
  'F9G Futsal Ball': '/images/futsal-ball-bluewhite-views.jpg',
  'Futsal Goalkeeper Gloves': '/images/goalkeeper-gloves-black-orange-views.jpg',
  'Academy Team Duffel': '/images/team-duffel-black-views.jpg',
  'Training Marker Cones - 10 Pack': '/images/training-cones-orange-views.jpg',
};

export function normalizeProduct(product) {
  const common = {
    name: product.name, category: product.category, brand: product.brand,
    description: product.description, image_url: product.image_url || sampleImages[product.name] || null,
    angle_image_url: sampleAngleImages[product.name] || null,
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
    data = await request(`/api/products?page=${page}&page_size=100`, { cache: 'no-store' });
    products.push(...data.products.map(normalizeProduct));
    page += 1;
  } while (data.products.length && products.length < data.total);
  return products;
}
