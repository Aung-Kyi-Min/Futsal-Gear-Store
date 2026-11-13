import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(os.getenv("DATABASE_PATH", "store.db"))
PRODUCTS = [
    (1, "Court Pro IC", "Footwear", "Precision grip. Every direction.", 25900, "👟", "lime", 24),
    (2, "Matchday Futsal Ball", "Balls", "Low bounce. Total control.", 8900, "⚽", "cream", 40),
    (3, "Training Jersey", "Apparel", "Lightweight comfort for extra time.", 5900, "👕", "blue", 35),
    (4, "Grip Crew Socks", "Accessories", "Stay locked in from kick-off.", 2900, "🧦", "pink", 60),
    (5, "Court Essential Bag", "Accessories", "Your full kit. Ready to go.", 11900, "🎒", "cream", 18),
    (6, "Keeper Match Gloves", "Accessories", "Confidence between the posts.", 9900, "🧤", "lime", 20),
]


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY, name TEXT, category TEXT, description TEXT,
                price_cents INTEGER, icon TEXT, color TEXT, stock INTEGER
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, customer_name TEXT, email TEXT, address TEXT,
                total_cents INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS order_items (
                order_id TEXT, product_id INTEGER, quantity INTEGER, unit_price_cents INTEGER
            );
        """)
        db.executemany("INSERT OR IGNORE INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)", PRODUCTS)


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
    with connect() as db:
        return {"products": [dict(row) for row in db.execute("SELECT * FROM products ORDER BY id")], "currency": "MYR"}


@app.post("/api/orders", status_code=201)
def create_order(order: OrderRequest):
    quantities = {}
    for item in order.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        total = 0
        lines = []
        for product_id, quantity in quantities.items():
            product = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
            if product is None:
                raise HTTPException(404, "Product not found")
            if quantity > product["stock"]:
                raise HTTPException(409, f"Not enough stock for {product['name']}")
            total += product["price_cents"] * quantity
            lines.append((product_id, quantity, product["price_cents"]))
        order_id = str(uuid4())
        db.execute("INSERT INTO orders (id, customer_name, email, address, total_cents) VALUES (?, ?, ?, ?, ?)",
                   (order_id, order.customer_name, order.email, order.address, total))
        for product_id, quantity, price in lines:
            db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (quantity, product_id))
            db.execute("INSERT INTO order_items VALUES (?, ?, ?, ?)", (order_id, product_id, quantity, price))
    return {"order_id": order_id, "total_cents": total, "currency": "MYR", "status": "received"}
