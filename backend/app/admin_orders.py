from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text

from .auth import AuthDB, StaffUser
from .catalog import PageNumber, PageSize

router = APIRouter(prefix="/orders")
OrderStatus = Literal["placed", "processing", "shipped", "delivered"]
NEXT_STATUS = {"placed": "processing", "processing": "shipped", "shipped": "delivered"}
ORDER_FIELDS = """
    order_id, customer_id, status, subtotal_minor, shipping_minor, tax_minor,
    total_minor, currency, delivery_name, created_at, updated_at
"""


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
    changed_by_user_id: UUID
    old_status: OrderStatus | None
    new_status: OrderStatus
    changed_at: datetime


class OrderDetail(OrderSummary):
    customer_email: str
    delivery_address: str
    items: list[OrderItem]
    status_history: list[OrderStatusEntry]


class OrderPage(BaseModel):
    orders: list[OrderSummary]
    total: int
    page: int
    page_size: int


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus


@router.get("", response_model=OrderPage)
def list_orders(db: AuthDB, status: OrderStatus | None = None, page: PageNumber = 1, page_size: PageSize = 20):
    where = "WHERE status = :status" if status is not None else ""
    params = {"status": status} if status is not None else {}
    total = db.execute(text(f"SELECT COUNT(*) FROM orders {where}"), params).scalar_one()
    offset = (page - 1) * page_size
    orders = []
    if offset < total:
        orders = db.execute(
            text(f"""
                SELECT {ORDER_FIELDS} FROM orders {where}
                ORDER BY created_at DESC, order_id DESC LIMIT :limit OFFSET :offset
            """),
            {**params, "limit": page_size, "offset": offset},
        ).mappings().all()
    return {"orders": orders, "total": total, "page": page, "page_size": page_size}


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(db: AuthDB, order_id: UUID):
    params = {"order_id": order_id}
    order = db.execute(
        text(f"""
            SELECT {ORDER_FIELDS}, delivery_address,
                   (SELECT email FROM users WHERE user_id = orders.customer_id) AS customer_email
            FROM orders WHERE order_id = :order_id FOR SHARE
        """),
        params,
    ).mappings().one_or_none()
    if order is None:
        raise HTTPException(404, "Order not found")
    items = db.execute(
        text("""
            SELECT order_item_id, variant_id, product_name_snapshot, size_snapshot, colour_snapshot,
                   quantity, unit_price_minor, line_total_minor
            FROM order_items WHERE order_id = :order_id ORDER BY order_item_id
        """),
        params,
    ).mappings().all()
    history = db.execute(
        text("""
            SELECT history_id, changed_by_user_id, old_status, new_status, changed_at
            FROM order_status_history WHERE order_id = :order_id ORDER BY changed_at, history_id
        """),
        params,
    ).mappings().all()
    return {**order, "items": items, "status_history": history}


@router.patch("/{order_id}/status", response_model=OrderSummary)
def update_order_status(db: AuthDB, staff: StaffUser, order_id: UUID, data: OrderStatusUpdate):
    params = {"order_id": order_id}
    current = db.execute(
        text(f"SELECT {ORDER_FIELDS} FROM orders WHERE order_id = :order_id FOR UPDATE"),
        params,
    ).mappings().one_or_none()
    if current is None:
        raise HTTPException(404, "Order not found")
    old_status = current["status"]
    if old_status == data.status:
        return current
    if NEXT_STATUS.get(old_status) != data.status:
        raise HTTPException(409, f"Cannot change order status from {old_status} to {data.status}")

    updated = db.execute(
        text(f"""
            UPDATE orders SET status = :status, updated_at = clock_timestamp()
            WHERE order_id = :order_id RETURNING {ORDER_FIELDS}
        """),
        {**params, "status": data.status},
    ).mappings().one()
    db.execute(
        text("""
            INSERT INTO order_status_history (order_id, changed_by_user_id, old_status, new_status, changed_at)
            VALUES (:order_id, :staff_id, :old_status, :new_status, :updated_at)
        """),
        {**params, "staff_id": staff.user_id, "old_status": old_status,
         "new_status": data.status, "updated_at": updated["updated_at"]},
    )
    db.commit()
    return updated
