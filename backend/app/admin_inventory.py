from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text

from .auth import AuthDB, StaffUser
from .catalog import CatalogID, CatalogIDFilter, PageNumber, PageSize

router = APIRouter(prefix="/inventory")
MAX_STOCK_QUANTITY = 2**31 - 1
StockQuantity = Annotated[int, Field(strict=True, ge=0, le=MAX_STOCK_QUANTITY)]
INVENTORY_FIELDS = """
    FROM product_variants AS v
    JOIN products AS p ON p.product_id = v.product_id
    LEFT JOIN inventory AS i ON i.variant_id = v.variant_id
"""


class InventoryAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_quantity: StockQuantity
    quantity_on_hand: StockQuantity
    reason: Annotated[str, StringConstraints(
        strip_whitespace=True, min_length=1, max_length=80, pattern=r"^[^\x00]+$",
    )]


class InventoryStock(BaseModel):
    variant_id: int
    quantity_on_hand: int
    updated_at: datetime | None


class InventoryRow(InventoryStock):
    product_id: int
    product_name: str
    sku: str
    size: str
    colour: str
    is_active: bool
    product_is_active: bool


class InventoryPage(BaseModel):
    inventory: list[InventoryRow]
    total: int
    page: int
    page_size: int


class InventoryMovement(BaseModel):
    movement_id: int
    variant_id: int
    changed_by_user_id: UUID | None
    order_id: UUID | None
    quantity_delta: int
    reason: str
    created_at: datetime


@router.get("", response_model=InventoryPage)
def list_inventory(
    db: AuthDB,
    product_id: CatalogIDFilter = None,
    max_quantity: Annotated[int | None, Query(ge=0, le=MAX_STOCK_QUANTITY)] = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    filters = []
    params = {}
    if product_id is not None:
        filters.append("v.product_id = :product_id")
        params["product_id"] = product_id
    if max_quantity is not None:
        filters.append("COALESCE(i.quantity_on_hand, 0) <= :max_quantity")
        params["max_quantity"] = max_quantity
    where = "WHERE " + " AND ".join(filters) if filters else ""

    total = db.execute(text(f"SELECT COUNT(*) {INVENTORY_FIELDS} {where}"), params).scalar_one()
    offset = (page - 1) * page_size
    inventory = []
    if offset < total:
        inventory = db.execute(
            text(f"""
                SELECT v.variant_id, v.sku, v.size, v.colour, v.is_active,
                       p.product_id, p.name AS product_name, p.is_active AS product_is_active,
                       COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand, i.updated_at
                {INVENTORY_FIELDS} {where}
                ORDER BY v.variant_id LIMIT :limit OFFSET :offset
            """),
            {**params, "limit": page_size, "offset": offset},
        ).mappings().all()
    return {"inventory": inventory, "total": total, "page": page, "page_size": page_size}


@router.get("/{variant_id}", response_model=InventoryStock)
def get_stock(db: AuthDB, variant_id: CatalogID):
    stock = db.execute(
        text("""
            SELECT v.variant_id, COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand, i.updated_at
            FROM product_variants AS v
            LEFT JOIN inventory AS i ON i.variant_id = v.variant_id
            WHERE v.variant_id = :variant_id
        """),
        {"variant_id": variant_id},
    ).mappings().one_or_none()
    if stock is None:
        raise HTTPException(404, "Variant not found")
    return stock


@router.get("/{variant_id}/movements", response_model=list[InventoryMovement])
def list_movements(db: AuthDB, variant_id: CatalogID, limit: PageSize = 50):
    get_stock(db, variant_id)
    return db.execute(
        text("""
            SELECT movement_id, variant_id, changed_by_user_id, order_id, quantity_delta, reason, created_at
            FROM inventory_movements
            WHERE variant_id = :variant_id
            ORDER BY created_at DESC, movement_id DESC
            LIMIT :limit
        """),
        {"variant_id": variant_id, "limit": limit},
    ).mappings().all()


@router.patch("/{variant_id}", response_model=InventoryStock)
def update_stock(db: AuthDB, staff: StaffUser, variant_id: CatalogID, data: InventoryAdjustment):
    params = {"variant_id": variant_id}
    # Older variants can exist without an inventory row.
    db.execute(
        text("""
            INSERT INTO inventory (variant_id)
            SELECT variant_id FROM product_variants WHERE variant_id = :variant_id
            ON CONFLICT (variant_id) DO NOTHING
        """),
        params,
    )
    current = db.execute(
        text("""
            SELECT variant_id, quantity_on_hand, updated_at
            FROM inventory WHERE variant_id = :variant_id FOR UPDATE
        """),
        params,
    ).mappings().one_or_none()
    if current is None:
        raise HTTPException(404, "Variant not found")
    delta = data.quantity_on_hand - current["quantity_on_hand"]
    if delta == 0:
        db.commit()
        return current
    if data.expected_quantity != current["quantity_on_hand"]:
        raise HTTPException(409, "Stock changed. Reload inventory before adjusting it")

    updated = db.execute(
        text("""
            UPDATE inventory SET quantity_on_hand = :quantity, updated_at = clock_timestamp()
            WHERE variant_id = :variant_id
            RETURNING variant_id, quantity_on_hand, updated_at
        """),
        {**params, "quantity": data.quantity_on_hand},
    ).mappings().one()
    db.execute(
        text("""
            INSERT INTO inventory_movements (variant_id, changed_by_user_id, quantity_delta, reason, created_at)
            VALUES (:variant_id, :staff_id, :delta, :reason, :updated_at)
        """),
        {**params, "staff_id": staff.user_id, "delta": delta, "reason": data.reason, "updated_at": updated["updated_at"]},
    )
    db.commit()
    return updated
