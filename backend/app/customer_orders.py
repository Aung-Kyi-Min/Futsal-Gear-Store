"""Signed-in checkout and order history."""
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text

from .auth import AuthDB, CurrentUser
from .catalog import MAX_POSTGRES_ID, PageNumber, PageSize
from .order_records import (
    ORDER_FIELDS,
    STATUS_HISTORY_FIELDS,
    OrderItem,
    OrderPage,
    OrderStatusEntry,
    OrderSummary,
    order_items,
)

router = APIRouter(prefix='/api/customer/orders', tags=['Customer orders'])


class CheckoutItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    variant_id: int = Field(strict=True, ge=1, le=MAX_POSTGRES_ID)
    quantity: int = Field(strict=True, ge=1, le=99)


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    customer_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=500)]
    items: list[CheckoutItem] = Field(min_length=1, max_length=100)


class CustomerOrderDetail(OrderSummary):
    delivery_address: str
    items: list[OrderItem]
    status_history: list[OrderStatusEntry]


@router.get('', response_model=OrderPage)
def list_orders(db: AuthDB, user: CurrentUser, response: Response, page: PageNumber = 1, page_size: PageSize = 20):
    response.headers['Cache-Control'] = 'private, no-store'
    params = {'customer_id': user.user_id}
    total = db.execute(
        text('SELECT COUNT(*) FROM orders WHERE customer_id = :customer_id'),
        params,
    ).scalar_one()
    offset = (page - 1) * page_size
    orders = []
    if offset < total:
        orders = db.execute(
            text(f'''
                SELECT {ORDER_FIELDS} FROM orders WHERE customer_id = :customer_id
                ORDER BY created_at DESC, order_id DESC LIMIT :limit OFFSET :offset
            '''),
            {**params, 'limit': page_size, 'offset': offset},
        ).mappings().all()
    return {'orders': orders, 'total': total, 'page': page, 'page_size': page_size}


@router.get('/{order_id}', response_model=CustomerOrderDetail)
def get_order(db: AuthDB, user: CurrentUser, response: Response, order_id: UUID):
    response.headers['Cache-Control'] = 'private, no-store'
    params = {'order_id': order_id, 'customer_id': user.user_id}
    order = db.execute(
        text(f'''
            SELECT {ORDER_FIELDS}, delivery_address
            FROM orders WHERE order_id = :order_id AND customer_id = :customer_id FOR SHARE
        '''),
        params,
    ).mappings().one_or_none()
    if order is None:
        raise HTTPException(404, 'Order not found', headers={'Cache-Control': 'private, no-store'})
    history = db.execute(
        text(f'''
            SELECT {STATUS_HISTORY_FIELDS}
            FROM order_status_history WHERE order_id = :order_id ORDER BY changed_at, history_id
        '''),
        {'order_id': order_id},
    ).mappings().all()
    return {**order, 'items': order_items(db, order_id), 'status_history': history}


@router.post('', status_code=201)
def checkout(data: CheckoutRequest, db: AuthDB, user: CurrentUser):
    quantities = {}
    for item in data.items:
        quantities[item.variant_id] = quantities.get(item.variant_id, 0) + item.quantity
    if any(quantity > 99 for quantity in quantities.values()):
        raise HTTPException(422, 'Maximum quantity is 99 per variant')

    lines = []
    currencies = set()
    # Authentication already began this connection's transaction. Commit only
    # after the order, stock deductions, and audit rows all succeed.
    for variant_id, quantity in sorted(quantities.items()):
        variant = db.execute(text('''
            SELECT v.variant_id, v.price_minor, v.size, v.colour, p.name, p.currency,
                   i.quantity_on_hand
            FROM product_variants v
            JOIN products p ON p.product_id = v.product_id
            JOIN inventory i ON i.variant_id = v.variant_id
            WHERE v.variant_id = :variant_id AND v.is_active AND p.is_active
            FOR SHARE OF p, v FOR UPDATE OF i
        '''), {'variant_id': variant_id}).mappings().one_or_none()
        if variant is None:
            raise HTTPException(404, 'Product variant is no longer available')
        if quantity > variant['quantity_on_hand']:
            raise HTTPException(409, f"Not enough stock for {variant['name']} ({variant['size']}, {variant['colour']})")
        currencies.add(variant['currency'])
        lines.append({**variant, 'quantity': quantity})
    if len(currencies) != 1:
        raise HTTPException(422, 'Please order products in one currency at a time')
    total = sum(line['price_minor'] * line['quantity'] for line in lines)
    if total > MAX_POSTGRES_ID:
        raise HTTPException(422, 'Order total exceeds the supported amount')
    order_id = uuid4()
    db.execute(text('''
        INSERT INTO orders (order_id, customer_id, subtotal_minor, total_minor, currency,
                            delivery_name, delivery_address)
        VALUES (:order_id, :customer_id, :total, :total, :currency, :name, :address)
    '''), {'order_id': order_id, 'customer_id': user.user_id, 'total': total,
           'currency': next(iter(currencies)), 'name': data.customer_name, 'address': data.address})
    for line in lines:
        params = {**line, 'order_id': order_id, 'user_id': user.user_id,
                  'line_total': line['price_minor'] * line['quantity']}
        db.execute(text('''
            UPDATE inventory SET quantity_on_hand = quantity_on_hand - :quantity,
                updated_at = clock_timestamp() WHERE variant_id = :variant_id
        '''), params)
        db.execute(text('''
            INSERT INTO order_items (order_id, variant_id, product_name_snapshot, size_snapshot,
                colour_snapshot, quantity, unit_price_minor, line_total_minor)
            VALUES (:order_id, :variant_id, :name, :size, :colour, :quantity, :price_minor, :line_total)
        '''), params)
        db.execute(text('''
            INSERT INTO inventory_movements (variant_id, changed_by_user_id, order_id, quantity_delta, reason)
            VALUES (:variant_id, :user_id, :order_id, -:quantity, 'order_placed')
        '''), params)
    db.execute(text('''
        INSERT INTO order_status_history (order_id, changed_by_user_id, old_status, new_status)
        VALUES (:order_id, :user_id, NULL, 'placed')
    '''), {'order_id': order_id, 'user_id': user.user_id})
    db.commit()
    return {'order_id': str(order_id), 'total_minor': total, 'currency': next(iter(currencies)), 'status': 'placed', 'payment_status': 'UNPAID'}
