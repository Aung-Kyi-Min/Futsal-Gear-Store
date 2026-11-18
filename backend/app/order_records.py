from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection

OrderStatus = Literal["placed", "processing", "shipped", "delivered"]
ORDER_FIELDS = """
    order_id, customer_id, status, payment_status, paid_at, subtotal_minor, shipping_minor, tax_minor,
    discount_code, discount_minor, total_minor, currency, delivery_name, created_at, updated_at
"""
STATUS_HISTORY_FIELDS = "history_id, old_status, new_status, changed_at"


class OrderSummary(BaseModel):
    order_id: UUID
    customer_id: UUID
    status: OrderStatus
    payment_status: Literal["UNPAID", "PAID"]
    paid_at: datetime | None
    subtotal_minor: int
    shipping_minor: int
    tax_minor: int
    discount_code: str | None
    discount_minor: int
    total_minor: int
    currency: str
    delivery_name: str
    created_at: datetime
    updated_at: datetime


class OrderItem(BaseModel):
    order_item_id: int
    product_id: int
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
            SELECT oi.order_item_id, v.product_id, oi.variant_id, oi.product_name_snapshot,
                   oi.size_snapshot, oi.colour_snapshot, oi.quantity, oi.unit_price_minor,
                   oi.line_total_minor
            FROM order_items oi JOIN product_variants v ON v.variant_id = oi.variant_id
            WHERE oi.order_id = :order_id ORDER BY oi.order_item_id
        """),
        {"order_id": order_id},
    ).mappings().all()
