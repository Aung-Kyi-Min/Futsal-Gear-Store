# Court Supply — Futsal Gear Store

A local e-commerce starter using Python/FastAPI, SQLite, and React/Vite. Includes six seeded products, category filters, search, a persistent browser cart, and a demo checkout. Prices use MYR and integer cents. Orders persist in SQLite; stock checks and order writes share a transaction.

## Requirements

Python 3.10+ and Node.js 20.19+ (or 22.12+).

## Backend

From the project root:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API: http://127.0.0.1:8000/api/products · Interactive docs: http://127.0.0.1:8000/docs

## Frontend

In another terminal, from the project root:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` requests to the backend on port 8000. Keep both servers running.

## Checks

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

```sh
cd frontend
npm run build
```

## Configuration and deployment

The backend reads `DATABASE_PATH` (default `store.db` in its working directory) and `CORS_ORIGINS` (comma-separated allowed frontend origins) from the process environment. `.env.example` files document configuration; the backend does not automatically load `.env` files. Startup seeds a new SQLite database and migrates existing catalogs in place.

`products` stores the name, category, description, and image. Each `product_variants` row stores a product's size, colour, unique SKU, price in MYR cents, and stock quantity. Existing products migrate to one `One Size` variant each, keeping their product IDs, prices, and stock. The current storefront and checkout use the variant with the lowest ID for each product.

The frontend accepts `VITE_API_URL` for a separately hosted backend; set it before building. The Vite proxy is for development only. Serve `frontend/dist` with a static host and deploy FastAPI separately, or configure your production reverse proxy to forward `/api` to FastAPI. Use persistent storage for the SQLite database.

This is a development starter. Checkout records a demo order and reduces inventory; it does not charge money, send email, or arrange shipping. Product illustrations are emoji placeholders. Before accepting real customers, add payment-provider integration, authentication and an admin workflow, shipping/tax rules, rate limits, and an appropriate privacy and data-retention policy. The public API intentionally has no order-list endpoint. Fonts use Google Fonts with local fallbacks.
