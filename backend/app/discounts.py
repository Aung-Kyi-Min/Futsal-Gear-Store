from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.engine import Connection

from .auth import AuthDB
from .catalog import PageNumber, PageSize

router = APIRouter(prefix="/discount-codes")
SHOP_TIMEZONE = ZoneInfo("Asia/Kuala_Lumpur")
Code = Annotated[str, StringConstraints(
    strip_whitespace=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$",
)]


class DiscountCode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Code
    percent_off: int = Field(strict=True, ge=1, le=100)
    expires_on: date


class DiscountPage(BaseModel):
    discount_codes: list[DiscountCode]
    total: int
    page: int
    page_size: int


def shop_date() -> date:
    return datetime.now(SHOP_TIMEZONE).date()


def discount_amount(db: Connection, code: str, subtotal: int) -> int:
    discount = db.execute(
        text("SELECT percent_off, expires_on FROM discount_codes WHERE code = :code"),
        {"code": code},
    ).mappings().one_or_none()
    if discount is None:
        raise HTTPException(422, "Discount code not found")
    if discount["expires_on"] < shop_date():
        raise HTTPException(422, "Discount code has expired")
    return (subtotal * discount["percent_off"] + 50) // 100


@router.get("", response_model=DiscountPage)
def list_codes(db: AuthDB, page: PageNumber = 1, page_size: PageSize = 20):
    total = db.execute(text("SELECT COUNT(*) FROM discount_codes")).scalar_one()
    offset = (page - 1) * page_size
    codes = []
    if offset < total:
        codes = db.execute(
            text("""
                SELECT code, percent_off, expires_on FROM discount_codes
                ORDER BY expires_on DESC, code LIMIT :limit OFFSET :offset
            """),
            {"limit": page_size, "offset": offset},
        ).mappings().all()
    return {"discount_codes": codes, "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201, response_model=DiscountCode)
def create_code(data: DiscountCode, db: AuthDB):
    if data.expires_on < shop_date():
        raise HTTPException(422, "Expiry date must be today or later in Malaysia")
    code = db.execute(
        text("""
            INSERT INTO discount_codes (code, percent_off, expires_on)
            VALUES (:code, :percent_off, :expires_on)
            ON CONFLICT (code) DO NOTHING
            RETURNING code, percent_off, expires_on
        """),
        {**data.model_dump(), "code": data.code.upper()},
    ).mappings().one_or_none()
    if code is None:
        raise HTTPException(409, "Discount code already exists")
    db.commit()
    return code
