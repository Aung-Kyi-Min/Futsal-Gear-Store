from typing import Annotated

from fastapi import APIRouter, HTTPException
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from typing_extensions import TypedDict

from .auth import AuthDB
from .catalog import (
    MAX_POSTGRES_ID,
    VARIANT_FIELDS,
    Brand,
    CatalogID,
    CatalogIDFilter,
    CatalogSearch,
    Category,
    PageNumber,
    PageSize,
    ProductSummary,
    ProductVariant,
    product_detail,
    product_page,
)

router = APIRouter()

CatalogReference = Annotated[int, Field(strict=True, ge=1, le=MAX_POSTGRES_ID)]
MinorAmount = Annotated[int, Field(strict=True, ge=0, le=MAX_POSTGRES_ID)]
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180, pattern=r"^[^\x00]+$")]
Description = Annotated[str, StringConstraints(max_length=5000, pattern=r"^[^\x00]*$")]
ImageURL = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2048, pattern=r"^[^\x00]+$")]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
SKU = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80, pattern=r"^[^\x00]+$")]
Size = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40, pattern=r"^[^\x00]+$")]
Colour = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60, pattern=r"^[^\x00]+$")]


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ProductName
    category_id: CatalogReference
    brand_id: CatalogReference
    base_price_minor: MinorAmount
    description: Description = ""
    image_url: ImageURL | None = None
    currency: Currency = "MYR"
    is_active: bool = True


class ProductPatch(TypedDict, total=False):
    __pydantic_config__ = ConfigDict(extra="forbid")

    name: ProductName
    category_id: CatalogReference
    brand_id: CatalogReference
    base_price_minor: MinorAmount
    description: Description
    image_url: ImageURL | None
    currency: Currency
    is_active: bool


class VariantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: SKU
    size: Size
    colour: Colour
    price_minor: MinorAmount
    is_active: bool = True


class VariantPatch(TypedDict, total=False):
    __pydantic_config__ = ConfigDict(extra="forbid")

    sku: SKU
    size: Size
    colour: Colour
    price_minor: MinorAmount
    is_active: bool


class AdminProduct(ProductSummary):
    is_active: bool


class AdminVariant(ProductVariant):
    is_active: bool


class AdminProductDetail(AdminProduct):
    variants: list[AdminVariant]


class AdminProductPage(BaseModel):
    products: list[AdminProduct]
    total: int
    page: int
    page_size: int


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00]+$")]


class BrandCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[^\x00]+$")]


@router.get("/products", response_model=AdminProductPage)
def list_products(
    db: AuthDB,
    search: CatalogSearch = None,
    category_id: CatalogIDFilter = None,
    brand_id: CatalogIDFilter = None,
    is_active: bool | None = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    return product_page(db, search, category_id, brand_id, page, page_size, is_active=is_active)


@router.get("/products/{product_id}", response_model=AdminProductDetail)
def get_product(db: AuthDB, product_id: CatalogID):
    return product_detail(db, product_id, include_inactive=True)


@router.post("/products", status_code=201, response_model=AdminProductDetail)
def create_product(db: AuthDB, data: ProductCreate):
    try:
        product_id = db.execute(
            text("""
                INSERT INTO products
                    (name, category_id, brand_id, base_price_minor, description, image_url, currency, is_active)
                VALUES
                    (:name, :category_id, :brand_id, :base_price_minor, :description, :image_url, :currency, :is_active)
                RETURNING product_id
            """),
            data.model_dump(),
        ).scalar_one()
    except IntegrityError as exc:
        if isinstance(exc.orig, ForeignKeyViolation):
            raise HTTPException(404, "Category or brand not found") from exc
        raise
    product = product_detail(db, product_id, include_inactive=True)
    db.commit()
    return product


@router.patch("/products/{product_id}", response_model=AdminProductDetail)
def update_product(db: AuthDB, product_id: CatalogID, data: ProductPatch):
    if not data:
        raise HTTPException(422, "Provide at least one product field to update")
    # ProductPatch rejects keys outside the declared column names.
    assignments = ", ".join(f"{column} = :{column}" for column in data)
    try:
        updated_id = db.execute(
            text(f"""
                UPDATE products SET {assignments}, updated_at = clock_timestamp()
                WHERE product_id = :product_id RETURNING product_id
            """),
            {**data, "product_id": product_id},
        ).scalar_one_or_none()
    except IntegrityError as exc:
        if isinstance(exc.orig, ForeignKeyViolation):
            raise HTTPException(404, "Category or brand not found") from exc
        raise
    if updated_id is None:
        raise HTTPException(404, "Product not found")
    product = product_detail(db, updated_id, include_inactive=True)
    db.commit()
    return product


@router.post("/products/{product_id}/variants", status_code=201, response_model=AdminVariant)
def create_variant(db: AuthDB, product_id: CatalogID, data: VariantCreate):
    try:
        variant_id = db.execute(
            text("""
                INSERT INTO product_variants (product_id, sku, size, colour, price_minor, is_active)
                VALUES (:product_id, :sku, :size, :colour, :price_minor, :is_active)
                RETURNING variant_id
            """),
            {**data.model_dump(), "product_id": product_id},
        ).scalar_one()
    except IntegrityError as exc:
        if isinstance(exc.orig, ForeignKeyViolation):
            raise HTTPException(404, "Product not found") from exc
        if isinstance(exc.orig, UniqueViolation):
            raise HTTPException(409, "SKU or product size and colour already in use") from exc
        raise
    db.execute(text("INSERT INTO inventory (variant_id) VALUES (:variant_id)"), {"variant_id": variant_id})
    variant = db.execute(text(f"{VARIANT_FIELDS} WHERE v.variant_id = :variant_id"),
                         {"variant_id": variant_id}).mappings().one()
    db.commit()
    return variant


@router.patch("/products/{product_id}/variants/{variant_id}", response_model=AdminVariant)
def update_variant(db: AuthDB, product_id: CatalogID, variant_id: CatalogID, data: VariantPatch):
    if not data:
        raise HTTPException(422, "Provide at least one variant field to update")
    # VariantPatch rejects keys outside the declared column names.
    assignments = ", ".join(f"{column} = :{column}" for column in data)
    try:
        updated_id = db.execute(
            text(f"""
                UPDATE product_variants SET {assignments}
                WHERE product_id = :product_id AND variant_id = :variant_id RETURNING variant_id
            """),
            {**data, "product_id": product_id, "variant_id": variant_id},
        ).scalar_one_or_none()
    except IntegrityError as exc:
        if isinstance(exc.orig, UniqueViolation):
            raise HTTPException(409, "SKU or product size and colour already in use") from exc
        raise
    if updated_id is None:
        raise HTTPException(404, "Variant not found for this product")
    variant = db.execute(text(f"{VARIANT_FIELDS} WHERE v.variant_id = :variant_id"),
                         {"variant_id": updated_id}).mappings().one()
    db.commit()
    return variant


@router.post("/categories", status_code=201, response_model=Category)
def create_category(db: AuthDB, data: CategoryCreate):
    category = db.execute(
        text("""
            INSERT INTO categories (name) VALUES (:name)
            ON CONFLICT (name) DO NOTHING RETURNING category_id, name
        """),
        data.model_dump(),
    ).mappings().one_or_none()
    if category is None:
        raise HTTPException(409, "Category name already in use")
    db.commit()
    return category


@router.post("/brands", status_code=201, response_model=Brand)
def create_brand(db: AuthDB, data: BrandCreate):
    brand = db.execute(
        text("""
            INSERT INTO brands (name) VALUES (:name)
            ON CONFLICT (name) DO NOTHING RETURNING brand_id, name
        """),
        data.model_dump(),
    ).mappings().one_or_none()
    if brand is None:
        raise HTTPException(409, "Brand name already in use")
    db.commit()
    return brand
