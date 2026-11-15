import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import OperationalError

from .db import postgres_engine

router = APIRouter(prefix="/api", tags=["Catalog"])
MAX_POSTGRES_ID = 2**63 - 1
CatalogID = Annotated[int, Path(ge=1, le=MAX_POSTGRES_ID)]
CatalogIDFilter = Annotated[int | None, Query(ge=1, le=MAX_POSTGRES_ID)]
CatalogSearch = Annotated[str | None, Query(max_length=180, pattern=r"^[^\x00]*$")]
PageNumber = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]

PRODUCT_FIELDS = """
    SELECT p.product_id, p.name, p.description, p.base_price_minor, p.currency, p.image_url, p.is_active,
           p.category_id, c.name AS category, p.brand_id, b.name AS brand,
           EXISTS (
               SELECT 1
               FROM product_variants AS v
               JOIN inventory AS i ON i.variant_id = v.variant_id
               WHERE v.product_id = p.product_id AND v.is_active AND i.quantity_on_hand > 0
           ) AS in_stock
    FROM products AS p
    JOIN categories AS c ON c.category_id = p.category_id
    JOIN brands AS b ON b.brand_id = p.brand_id
"""


class ProductSummary(BaseModel):
    product_id: int
    name: str
    description: str
    base_price_minor: int
    currency: str
    image_url: str | None
    category_id: int
    category: str
    brand_id: int
    brand: str
    in_stock: bool


class ProductVariant(BaseModel):
    variant_id: int
    sku: str
    size: str
    colour: str
    price_minor: int
    quantity_on_hand: int


class ProductDetail(ProductSummary):
    variants: list[ProductVariant]


class ProductPage(BaseModel):
    products: list[ProductSummary]
    total: int
    page: int
    page_size: int


class Category(BaseModel):
    category_id: int
    name: str


class Brand(BaseModel):
    brand_id: int
    name: str


def get_catalog_db():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(503, "Catalog database is not configured")
    try:
        with postgres_engine(database_url).connect() as db:
            # Keep multiple reads in a request on the same snapshot.
            yield db.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    except OperationalError as exc:
        raise HTTPException(503, "Catalog database is unavailable") from exc


CatalogDB = Annotated[Connection, Depends(get_catalog_db)]


@router.get("/products", response_model=ProductPage)
def list_products(
    db: CatalogDB,
    search: CatalogSearch = None,
    category_id: CatalogIDFilter = None,
    brand_id: CatalogIDFilter = None,
    page: PageNumber = 1,
    page_size: PageSize = 20,
):
    return product_page(db, search, category_id, brand_id, page, page_size, is_active=True)


def product_page(
    db: Connection, search: str | None, category_id: int | None, brand_id: int | None,
    page: int, page_size: int, *, is_active: bool | None,
):
    filters = []
    params: dict[str, int | str | bool] = {}
    if is_active is not None:
        filters.append("p.is_active = :is_active")
        params["is_active"] = is_active
    if search and (term := search.strip()):
        filters.append("(strpos(lower(p.name), lower(:search)) > 0 OR strpos(lower(p.description), lower(:search)) > 0)")
        params["search"] = term
    if category_id is not None:
        filters.append("p.category_id = :category_id")
        params["category_id"] = category_id
    if brand_id is not None:
        filters.append("p.brand_id = :brand_id")
        params["brand_id"] = brand_id

    where = "WHERE " + " AND ".join(filters) if filters else ""
    total = db.execute(text(f"SELECT COUNT(*) FROM products AS p {where}"), params).scalar_one()
    offset = (page - 1) * page_size
    products = []
    if offset < total:
        products = db.execute(
            text(f"{PRODUCT_FIELDS} {where} ORDER BY p.product_id LIMIT :limit OFFSET :offset"),
            {**params, "limit": page_size, "offset": offset},
        ).mappings().all()
    return {"products": products, "total": total, "page": page, "page_size": page_size}


@router.get("/products/{product_id}", response_model=ProductDetail)
def get_product(db: CatalogDB, product_id: CatalogID):
    return product_detail(db, product_id, include_inactive=False)


def product_detail(db: Connection, product_id: int, *, include_inactive: bool):
    active_product = "" if include_inactive else " AND p.is_active"
    params = {"product_id": product_id}
    product = db.execute(
        text(f"{PRODUCT_FIELDS} WHERE p.product_id = :product_id{active_product}"),
        params,
    ).mappings().one_or_none()
    if product is None:
        raise HTTPException(404, "Product not found")

    active_variant = "" if include_inactive else " AND v.is_active"
    variants = db.execute(
        text(f"{VARIANT_FIELDS} WHERE v.product_id = :product_id{active_variant} ORDER BY v.variant_id"),
        params,
    ).mappings().all()
    return {**product, "variants": variants}


VARIANT_FIELDS = """
    SELECT v.variant_id, v.sku, v.size, v.colour, v.price_minor, v.is_active,
           COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand
    FROM product_variants AS v
    LEFT JOIN inventory AS i ON i.variant_id = v.variant_id
"""


@router.get("/categories", response_model=list[Category])
def list_categories(db: CatalogDB):
    return db.execute(text("SELECT category_id, name FROM categories ORDER BY name, category_id")).mappings().all()


@router.get("/brands", response_model=list[Brand])
def list_brands(db: CatalogDB):
    return db.execute(text("SELECT brand_id, name FROM brands ORDER BY name, brand_id")).mappings().all()
