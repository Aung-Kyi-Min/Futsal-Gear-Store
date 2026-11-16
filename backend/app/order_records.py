from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection

OrderStatus = Literal["placed", "processing", "shipped", "delivered"]
ORDER_FIELDS = """
    order_id, customer_id, status, subtotal_minor, shipping_minor, tax_minor,
    total_minor, currency, delivery_name, created_at, updated_at
"""
STATUS_HISTORY_FIELDS = "history_id, old_status, new_status, changed_at"


class OrderSummary(BaseModel):
    order_id: UUID
    customer_id: UUID
    status: OrderStatus
    subtotal_minor: int
    shipping_minor: int
    tax_minor: int
    total_minor: int
    currency: str
    delivery_name: str
    created_at: datetime
    updated_at: datetime


class OrderItem(BaseModel):
    order_item_id: int
    variant_id: int
    product_name_snapshot: str
    size_snapshot: str
    colour_snapshot: str
    quantity: int
    unit_price_minor: int
    line_total_minor: int


class OrderStatusEntry(BaseModel):
    history_id: int
    old_status: OrderStatus | None
    new_status: OrderStatus
    changed_at: datetime


class OrderPage(BaseModel):
    orders: list[OrderSummary]
    total: int
    page: int
    page_size: int


def order_items(db: Connection, order_id: UUID):
    return db.execute(
        text("""
            SELECT order_item_id, variant_id, product_name_snapshot, size_snapshot, colour_snapshot,
                   quantity, unit_price_minor, line_total_minor
            FROM order_items WHERE order_id = :order_id ORDER BY order_item_id
        """),
        {"order_id": order_id},
    ).mappings().all()
