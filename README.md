# Court Supply — Futsal Gear Store

A local e-commerce starter using Python/FastAPI and React/Vite. The authentication API uses PostgreSQL. The existing catalog and checkout use the SQLite demo data. PostgreSQL migrations also define the planned catalog, inventory, orders, and audit history.

## Requirements

Python 3.10–3.13 and Node.js 20.19+ (or 22.12+). Use Python 3.13 if you are setting up a new environment for the pinned PostgreSQL driver.

## Backend

From the project root:

```sh
python3.13 -m venv backend/.venv
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

## Test authentication with Postman

Start PostgreSQL and create the `futsal_gear_store` database. From `backend/`, run the migration setup above, then start FastAPI in the same terminal. Use your PostgreSQL username, password, and port in `DATABASE_URL`.

```sh
export DATABASE_URL='postgresql+psycopg://postgres:YOUR_PASSWORD@127.0.0.1:5432/futsal_gear_store'
.venv/bin/alembic upgrade head
export AUTH_SECRET_KEY="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))')"
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If the database was set up with the pgAdmin SQL script, skip the Alembic command. Keep the same secret across restarts if you want previously issued tokens to remain valid until they expire.

| Request | Postman input | Success |
| --- | --- | --- |
| `POST http://127.0.0.1:8000/api/auth/register` | Body → raw → JSON. Send `full_name`, `email`, and `password` (12–128 characters). | `201 Created` with the new public user and the `customer` role |
| `POST http://127.0.0.1:8000/api/auth/login` | Body → raw → JSON. Send the same `email` and `password`. | `200 OK` with the user and an `access_token` that expires in one hour |
| `GET http://127.0.0.1:8000/api/auth/me` | Authorization → Bearer Token. Paste the `access_token` from login. | `200 OK` with the signed-in user |

Registering the same email again returns `409 Conflict`, regardless of letter case. An incorrect password or a missing or expired bearer token returns `401 Unauthorized`. Invalid registration input returns `422 Unprocessable Entity`.

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

This is a development starter. Checkout records a demo order and reduces inventory; it does not charge money, send email, or arrange shipping. Product illustrations are emoji placeholders. Before accepting real customers, add payment-provider integration, authenticated checkout and an admin workflow, shipping/tax rules, rate limits, and an appropriate privacy and data-retention policy. The public API intentionally has no order-list endpoint. Fonts use Google Fonts with local fallbacks.
