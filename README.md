# Court Supply — Futsal Gear Store

A local e-commerce starter using Python/FastAPI and React/Vite. Authentication, the client storefront catalog, and signed-in checkout use PostgreSQL. The original SQLite demo endpoints remain available separately. PostgreSQL migrations also define inventory, orders, and audit history.

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

The initial migration creates role, user, category, brand, product, product variant, inventory, order, order item, order status history, and inventory movement tables. It seeds the `customer`, `manager`, and `administrator` roles. Inventory is one-to-one with a product variant, so every size/colour/SKU combination has its own stock row. Signed-in checkout locks inventory per variant and writes the order, order items, stock movements, and initial status history in one PostgreSQL transaction.

If you prefer pgAdmin, open `backend/migrations/sql/0001_initial_erd.sql` in the Query Tool while connected to `futsal_gear_store` and execute it. Use either the SQL file or Alembic on an empty database, not both. This creates the schema and role rows; it does not import old SQLite products because that catalog has no brand, SKU, size, or colour data to fill the new required fields.

## PostgreSQL sample data

After creating the PostgreSQL schema, open `backend/migrations/sql/0002_sample_data.sql` in pgAdmin's Query Tool on the same database and execute the entire file. It adds 8 fictional users, 10 products, 28 size/colour variants, current inventory, and 8 orders with matching items, stock movements, and status histories. Prices are illustrative MYR values stored in sen. There are out-of-stock and low-stock examples, an inactive customer, and orders in every supported status.

Run the sample script before registering users if you want both sample data and working accounts in the same database. The script requires empty business tables and refuses a second run.

With `psql`, run from the project root:

```sh
psql -d futsal_gear_store -v ON_ERROR_STOP=1 -f backend/migrations/sql/0002_sample_data.sql
```

For example, query the seeded catalog and stock:

```sql
SELECT p.name, v.sku, v.size, v.colour,
       v.price_minor / 100.0 AS price_myr, i.quantity_on_hand
FROM products p
JOIN product_variants v ON v.product_id = p.product_id
JOIN inventory i ON i.variant_id = v.variant_id
ORDER BY p.name, v.size;
```

## Test the catalog with Postman

Set `DATABASE_URL` to the PostgreSQL instance where you applied the schema and sample data. Start FastAPI and send these requests to `http://127.0.0.1:8000` with **No Auth**.

| Request | Result |
| --- | --- |
| `GET /api/categories` | Category IDs and names |
| `GET /api/brands` | Brand IDs and names |
| `GET /api/products` | Active products with category, brand, base price, image, availability, and active size/colour variants with prices and stock |
| `GET /api/products/{product_id}` | Product details and active variants with SKU, size, colour, price, and stock |

Try `GET /api/products?search=lunar&category_id=1&brand_id=1&page=1&page_size=5` with the sample data. Search matches part of a name or description without regard to case. Filters combine, and the response includes `total`, `page`, and `page_size`. The default page size is 20 and the maximum is 100. Use a `product_id` from the list to request details. Missing or inactive products return `404`. An active variant with zero stock remains visible.

Prices use integer minor units in the product's currency. For MYR, `29900` means RM299.00. The React home/shop pages read `GET /api/products` and use PostgreSQL variant IDs in a separate `court-variant-cart` local storage key. Choose a size/colour before adding an item. The original `GET /api/demo/products` and `POST /api/orders` endpoints still use SQLite and are not used by the storefront.

## Test authentication with Postman

To verify PostgreSQL credentials and generate the connection URL without manually encoding passwords, run from the project root:

```sh
backend/.venv/bin/python backend/scripts/configure_database.py
```

Enter your actual PostgreSQL password at the hidden prompt. The command tests the connection and saves `backend/.env` only after success. Restart FastAPI afterward. If the command reports that PostgreSQL rejected the credentials, confirm the server instance, username, and password in pgAdmin; changing the URL syntax cannot fix a password rejected by the server.

For local setup, copy `backend/.env.example` to `backend/.env` if that file does not already exist. Set `DATABASE_URL` to your actual PostgreSQL connection string and set `AUTH_SECRET_KEY` to a random secret of at least 32 bytes. Keep this file private; Git ignores it. Restart FastAPI after editing the file. A registration response of `503` with `Authentication database is not configured` means `DATABASE_URL` is missing or empty.

After applying the PostgreSQL schema, start FastAPI from `backend/`. If you prefer environment variables in your terminal, use your PostgreSQL username, password, and port in `DATABASE_URL`.

```sh
export DATABASE_URL='postgresql+psycopg://postgres:YOUR_PASSWORD@127.0.0.1:5432/futsal_gear_store'
export AUTH_SECRET_KEY="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))')"
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep the same secret across restarts if you want previously issued tokens to remain valid until they expire. Seed accounts have disabled password placeholders. Register a new email, such as `postman@example.com`, before testing login.

| Request | Postman input | Success |
| --- | --- | --- |
| `POST http://127.0.0.1:8000/api/auth/register` | Body → raw → JSON. Send `full_name`, `email`, and `password` (12–128 characters). | `201 Created` with the new public user and the `customer` role |
| `POST http://127.0.0.1:8000/api/auth/login` | Body → raw → JSON. Send the same `email` and `password`. | `200 OK` with the user and an `access_token` that expires in one hour |
| `GET http://127.0.0.1:8000/api/auth/me` | Authorization → Bearer Token. Paste the `access_token` from login. | `200 OK` with the signed-in user |

Registering the same email again returns `409 Conflict`, regardless of letter case. An incorrect password or a missing or expired bearer token returns `401 Unauthorized`. Invalid registration input returns `422 Unprocessable Entity`.

## Test role permissions with Postman

Sign in, then send `GET http://127.0.0.1:8000/api/admin/me` with your access token under **Authorization → Bearer Token**. A `customer` receives `403 Forbidden`, while a `manager` or `administrator` receives `200 OK`. A missing or invalid token returns `401 Unauthorized`. All three roles can use `GET /api/auth/me`.

Public registration creates customers. To test a staff role, register a separate account such as `staff-test@example.com`, then run this in pgAdmin against your local test database:

```sql
UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'manager')
WHERE email = 'staff-test@example.com';
```

Use `administrator` to test that role or `customer` to restore the account. The API reads the current role from PostgreSQL on each protected request, so you can reuse an unexpired token after changing the role.

## Test the admin APIs with Postman

Use `http://127.0.0.1:8000` as the base URL and set **Authorization → Bearer Token** to a manager or administrator's access token. Send write request bodies as **Body → raw → JSON**. These APIs use the existing PostgreSQL schema and seeded orders.

| Request | What to send or expect |
| --- | --- |
| `GET /api/admin/products` | List products, including inactive ones. Supports the public catalog filters and `is_active`. |
| `GET /api/admin/products/{product_id}` | Product and variants with stock and activity flags. |
| `POST /api/admin/products` | Send `{"name":"Training Boot","category_id":1,"brand_id":1,"base_price_minor":12900}`. Use category and brand IDs from the public lists. |
| `PATCH /api/admin/products/{product_id}` | Edit product fields, or send `{"is_active":false}` to hide it from the public catalog. |
| `POST /api/admin/products/{product_id}/variants` | Send `{"sku":"TRAINING-BOOT-42","size":"EU 42","colour":"Black","price_minor":12900}`. New variants start at zero stock. |
| `PATCH /api/admin/products/{product_id}/variants/{variant_id}` | Edit SKU, size, colour, price, or `is_active`. Duplicate SKUs and duplicate size/colour pairs within a product return `409`. |
| `POST /api/admin/categories` or `POST /api/admin/brands` | Send `{"name":"Example Name"}` to add an entry for product creation. |
| `GET /api/admin/inventory?max_quantity=4` | List variants with up to four units. Also supports `product_id`, `page`, and `page_size`. |
| `GET /api/admin/inventory/{variant_id}` | Read the current quantity before making an adjustment. |
| `PATCH /api/admin/inventory/{variant_id}` | For a new variant, send `{"expected_quantity":0,"quantity_on_hand":5,"reason":"Opening stock"}`. If stock changed and the target differs from the current quantity, the API returns `409`. Reload before retrying. |
| `GET /api/admin/inventory/{variant_id}/movements` | Read the latest stock changes, including delta, reason, and staff user. Supports `limit`. |
| `GET /api/admin/orders?status=placed&page=1&page_size=5` | Find an order ID to test. The status filter is optional. |
| `GET /api/admin/orders/{order_id}` | Order totals, delivery details, item snapshots, and status history. |
| `PATCH /api/admin/orders/{order_id}/status` | Send `{"status":"shipped"}`, then `{"status":"delivered"}`. Skipping stages or moving backwards returns `409`. Repeating the current status returns `200` without adding a history entry. |

Product and variant deactivation preserves existing orders. PostgreSQL orders appear in the admin API. Orders placed through the storefront checkout appear in the admin dashboard.

### Admin dashboard

Open `http://localhost:5173/admin` and sign in with a manager or administrator account. The dashboard uses the signed-in bearer token for all `/api/admin` requests. Both roles can use the operations allowed by the backend; customer accounts are rejected.

- **Products:** view all products, including inactive ones; create/edit products, categories, and brands; open Variants to create/edit SKUs, sizes, colours, prices, and active status. New variants start at zero stock.
- **Orders:** search/filter orders, view delivery details, items, and status history, and mark orders shipped or delivered. Export CSV downloads all loaded orders.
- **Inventory:** search individual variants, set a new quantity with an adjustment reason, and inspect the most recent 50 stock movements. A concurrent change returns a conflict and refreshes inventory so you can retry against current stock.
- **Overview:** counts, low-stock variants, recent orders, and recorded order values come from the database. Order values are grouped by currency and do not represent collected payments.

Lists load all API pages. Use Refresh to pick up changes from other staff or checkout. Saves refresh the dashboard; failures show the API error. Expired tokens log out and return to the home page. Staff/role management and store settings are not shown because those APIs are not implemented.

## Frontend

The account dialog calls the PostgreSQL registration and login APIs. Signup requires a 12–128 character password; after registration, log in to start a session. The access token stays in session storage for the current tab, and `/api/auth/me` restores the account after a reload. Log out clears the token. Configure `DATABASE_URL` and `AUTH_SECRET_KEY` as described above before testing accounts. SQL seed accounts have disabled passwords; register a new account through the UI.

The signed-in name and email prefill checkout. Placing an order requires login and calls `POST /api/customer/orders` with a bearer token. The account supplies the customer identity; the request contains `customer_name`, `address`, and `items` with `variant_id` and `quantity`. Prices and totals come from the database. Orders have zero shipping/tax for this demo and are recorded with status `placed`.

```json
{
  "customer_name": "Daniel Tan",
  "address": "123 Test Street, Kuala Lumpur",
  "items": [{ "variant_id": 3, "quantity": 1 }]
}
```

Insufficient stock returns `409`; unavailable variants return `404`; missing/expired login returns `401`. No payment is taken. Cart quantity changes are local; stock is reserved when the order is placed.

In another terminal, from the project root:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` requests to the backend on port 8000. Keep both servers running.

## Checks

Frontend API request and error handling checks:

```sh
node --test frontend/tests/*.test.js
```

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

```sh
cd frontend
npm run build
```

## Configuration and deployment

The backend reads `DATABASE_PATH` (default `store.db` in its working directory) and `CORS_ORIGINS` (comma-separated allowed frontend origins) from the process environment. `.env.example` files document configuration; the backend and Alembic automatically load `backend/.env`; exported environment variables take precedence. Startup seeds a new SQLite database and migrates existing catalogs in place.

The SQLite demo upgrades older products to one `One Size` variant each, keeping their product IDs, prices, and stock. The legacy SQLite demo checkout uses the variant with the lowest ID for each product.

The frontend accepts `VITE_API_URL` for a separately hosted backend; set it before building. The Vite proxy is for development only. Serve `frontend/dist` with a static host and deploy FastAPI separately, or configure your production reverse proxy to forward `/api` to FastAPI. Use persistent storage for the SQLite database.

This is a development starter. Checkout records a demo order and reduces inventory; it does not charge money, send email, or arrange shipping. Product illustrations are emoji placeholders. Before accepting real customers, add payment-provider integration, shipping/tax rules, rate limits, and an appropriate privacy and data-retention policy. The public API intentionally has no order-list endpoint. Fonts use Google Fonts with local fallbacks.

PostgreSQL catalog/checkout integration tests use an isolated schema per test. To run them, set `TEST_DATABASE_URL` to a disposable UTF-8 PostgreSQL database and run the backend test command above. They check public visibility, variant prices, audit records, transaction rollback, and concurrent requests for the last item. Without that variable these integration tests are skipped.
