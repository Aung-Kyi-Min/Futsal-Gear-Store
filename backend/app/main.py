import os
import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(os.getenv("DATABASE_PATH", "store.db"))
PRODUCTS = [
    (1, "Court Pro IC", "Footwear", "Precision grip. Every direction.", "👟"),
    (2, "Matchday Futsal Ball", "Balls", "Low bounce. Total control.", "⚽"),
    (3, "Training Jersey", "Apparel", "Lightweight comfort for extra time.", "👕"),
    (4, "Grip Crew Socks", "Accessories", "Stay locked in from kick-off.", "🧦"),
    (5, "Court Essential Bag", "Accessories", "Your full kit. Ready to go.", "🎒"),
    (6, "Keeper Match Gloves", "Accessories", "Confidence between the posts.", "🧤"),
]
DEFAULT_VARIANTS = [
    (1, "SKU-1", "One Size", "lime", 25900, 24),
    (2, "SKU-2", "One Size", "cream", 8900, 40),
    (3, "SKU-3", "One Size", "blue", 5900, 35),
    (4, "SKU-4", "One Size", "pink", 2900, 60),
    (5, "SKU-5", "One Size", "cream", 11900, 18),
    (6, "SKU-6", "One Size", "lime", 9900, 20),
]

# The existing storefront uses one variant per product and checks out by product ID.
DEFAULT_VARIANT_JOIN = """
    JOIN product_variants AS v ON v.id = (
        SELECT id FROM product_variants WHERE product_id = p.id ORDER BY id LIMIT 1
    )
"""


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        product_columns = {column["name"] for column in db.execute("PRAGMA table_info(products)")}
        legacy_catalog = "price_cents" in product_columns
        if legacy_catalog:
            db.execute("ALTER TABLE products RENAME TO legacy_products")

        db.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                image TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS product_variants (
                id INTEGER PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                sku TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(sku)) > 0),
                size TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(size)) > 0),
                color TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(color)) > 0),
                price_cents INTEGER NOT NULL CHECK (typeof(price_cents) = 'integer' AND price_cents >= 0),
                stock INTEGER NOT NULL CHECK (typeof(stock) = 'integer' AND stock >= 0),
                UNIQUE (product_id, size, color)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, customer_name TEXT, email TEXT, address TEXT,
                total_cents INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                order_id TEXT, product_id INTEGER, quantity INTEGER, unit_price_cents INTEGER
            )
        """)

        if legacy_catalog:
            db.execute("""
                INSERT INTO products (id, name, category, description, image)
                SELECT id, name, category, description, icon FROM legacy_products
            """)
            db.execute("""
                INSERT INTO product_variants (product_id, sku, size, color, price_cents, stock)
                SELECT id, 'SKU-' || id, 'One Size', color, price_cents, stock
                FROM legacy_products
                ORDER BY id
            """)
            db.execute("DROP TABLE legacy_products")
        elif not product_columns:
            db.executemany(
                "INSERT INTO products (id, name, category, description, image) VALUES (?, ?, ?, ?, ?)",
                PRODUCTS,
            )
            db.executemany(
                """
                INSERT INTO product_variants (product_id, sku, size, color, price_cents, stock)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                DEFAULT_VARIANTS,
            )


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Futsal Gear Store API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
)


class OrderItem(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class OrderRequest(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100, pattern=r"\S")
    email: str = Field(max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    address: str = Field(min_length=5, max_length=500, pattern=r"\S")
    items: List[OrderItem] = Field(min_length=1, max_length=100)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/products")
def products():
    with closing(connect()) as db:
        rows = db.execute(f"""
            SELECT p.id, p.name, p.category, p.description, v.price_cents, p.image AS icon, v.color, v.stock
            FROM products AS p
            {DEFAULT_VARIANT_JOIN}
            ORDER BY p.id
        """)
        return {"products": [dict(row) for row in rows], "currency": "MYR"}


@app.post("/api/orders", status_code=201)
def create_order(order: OrderRequest):
    quantities = {}
    for item in order.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        total = 0
        lines = []
        for product_id, quantity in quantities.items():
            product = db.execute(f"""
                SELECT p.name, v.id AS variant_id, v.stock, v.price_cents
                FROM products AS p
                {DEFAULT_VARIANT_JOIN}
                WHERE p.id = ?
            """, (product_id,)).fetchone()
            if product is None:
                raise HTTPException(404, "Product not found")
            if quantity > product["stock"]:
                raise HTTPException(409, f"Not enough stock for {product['name']}")
            total += product["price_cents"] * quantity
            lines.append((product_id, product["variant_id"], quantity, product["price_cents"]))
        order_id = str(uuid4())
        db.execute("INSERT INTO orders (id, customer_name, email, address, total_cents) VALUES (?, ?, ?, ?, ?)",
                   (order_id, order.customer_name, order.email, order.address, total))
        for product_id, variant_id, quantity, price in lines:
            db.execute("UPDATE product_variants SET stock = stock - ? WHERE id = ?", (quantity, variant_id))
            db.execute("INSERT INTO order_items VALUES (?, ?, ?, ?)", (order_id, product_id, quantity, price))
    return {"order_id": order_id, "total_cents": total, "currency": "MYR", "status": "received"}
