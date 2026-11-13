# Court Supply — Futsal Gear Store

A local e-commerce starter using Python/FastAPI and React/Vite. PostgreSQL schema migrations define the planned product catalog, size/colour variants, per-variant inventory, role-based users, orders, and audit history. The current API implementation is still the original SQLite demo; the migrations establish the PostgreSQL schema but do not switch the API to it.

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

## PostgreSQL schema migrations

The Alembic migration is under `backend/migrations`. Create a PostgreSQL database, set `DATABASE_URL` to a `postgresql+psycopg://...` connection string (see `backend/.env.example`), then from `backend/` run:

```sh
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/alembic upgrade head
```

To roll back the initial schema:

```sh
.venv/bin/alembic downgrade base
```

The initial migration creates role, user, category, brand, product, product variant, inventory, order, order item, order status history, and inventory movement tables. It seeds the `customer`, `manager`, and `administrator` roles. Inventory is one-to-one with a product variant, so every size/colour/SKU combination has its own stock row. For checkout, the API must lock or conditionally update the inventory row and insert the order, order items, and inventory movement records in the same PostgreSQL transaction; this migration defines the data model but does not implement that API behavior.

If you prefer pgAdmin, open `backend/migrations/sql/0001_initial_erd.sql` in the Query Tool while connected to `futsal_gear_store` and execute it. Use either the SQL file or Alembic on an empty database, not both. This creates the schema and role rows; it does not import old SQLite products because that catalog has no brand, SKU, size, or colour data to fill the new required fields.

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

The current demo API reads `DATABASE_PATH` (default `store.db` in its working directory) and `CORS_ORIGINS` from the process environment. Alembic reads `DATABASE_URL` for PostgreSQL migrations. `.env.example` files document configuration; the backend does not automatically load `.env` files. The current API still creates and seeds its SQLite database on startup.

The frontend accepts `VITE_API_URL` for a separately hosted backend; set it before building. The Vite proxy is for development only. Serve `frontend/dist` with a static host and deploy FastAPI separately, or configure your production reverse proxy to forward `/api` to FastAPI. Use persistent storage for the SQLite database.

This is a development starter. Checkout records a demo order and reduces inventory; it does not charge money, send email, or arrange shipping. Product illustrations are emoji placeholders, and there are no size variants. Before accepting real customers, add payment-provider integration, authentication and an admin workflow, shipping/tax rules, rate limits, and an appropriate privacy and data-retention policy. The public API intentionally has no order-list endpoint. Fonts use Google Fonts with local fallbacks.
