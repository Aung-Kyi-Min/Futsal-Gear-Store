"""Verified product reviews and staff moderation."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from psycopg.errors import UniqueViolation
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .auth import AuthDB, CurrentUser, StaffUser
from .catalog import CatalogDB, CatalogID, PageNumber, PageSize

router = APIRouter(prefix="/api", tags=["Reviews"])

ReviewText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: int = Field(strict=True, ge=1)
    rating: int = Field(strict=True, ge=1, le=5)
    review_text: ReviewText


class ReviewVisibilityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_hidden: bool


class ProductReview(BaseModel):
    review_id: int
    product_id: int
    customer_name: str
    rating: int
    review_text: str
    created_at: datetime


class ProductReviewPage(BaseModel):
    average_rating: float | None
    review_count: int
    reviews: list[ProductReview]


class AdminReview(ProductReview):
    customer_id: UUID
    order_id: UUID | None
    product_name: str
    is_hidden: bool


class AdminReviewPage(BaseModel):
    reviews: list[AdminReview]
    total: int
    page: int
    page_size: int


@router.get("/products/{product_id}/reviews", response_model=ProductReviewPage)
def list_product_reviews(db: CatalogDB, product_id: CatalogID):
    exists = db.execute(
        text("SELECT 1 FROM products WHERE product_id = :product_id AND is_active"),
        {"product_id": product_id},
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(404, "Product not found")
    summary = db.execute(
        text("""
            SELECT AVG(rating)::FLOAT AS average_rating, COUNT(*) AS review_count
            FROM product_reviews WHERE product_id = :product_id AND NOT is_hidden
        """),
        {"product_id": product_id},
    ).mappings().one()
    reviews = db.execute(
        text("""
            SELECT r.review_id, r.product_id, u.full_name AS customer_name,
                   r.rating, r.review_text, r.created_at
            FROM product_reviews r JOIN users u ON u.user_id = r.user_id
            WHERE r.product_id = :product_id AND NOT r.is_hidden
            ORDER BY r.created_at DESC, r.review_id DESC
        """),
        {"product_id": product_id},
    ).mappings().all()
    return {**summary, "reviews": reviews}


@router.post("/customer/orders/{order_id}/reviews", status_code=201)
def create_review(order_id: UUID, data: ReviewCreate, db: AuthDB, user: CurrentUser):
    if user.role != "customer":
        raise HTTPException(403, "Only customer accounts can submit reviews")
    eligible = db.execute(
        text("""
            SELECT 1
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN product_variants v ON v.variant_id = oi.variant_id
            WHERE o.order_id = :order_id AND o.customer_id = :customer_id
              AND o.status = 'delivered' AND v.product_id = :product_id
            LIMIT 1
        """),
        {"order_id": order_id, "customer_id": user.user_id, "product_id": data.product_id},
    ).scalar_one_or_none()
    if eligible is None:
        raise HTTPException(403, "A delivered order containing this product is required to review it")
    try:
        review = db.execute(
            text("""
            INSERT INTO product_reviews (product_id, user_id, order_id, rating, review_text)
                VALUES (:product_id, :customer_id, :order_id, :rating, :review_text)
                RETURNING review_id, product_id, rating, review_text, created_at
            """),
            {"product_id": data.product_id, "customer_id": user.user_id,
             "order_id": order_id, "rating": data.rating, "review_text": data.review_text},
        ).mappings().one()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if isinstance(exc.orig, UniqueViolation):
            raise HTTPException(409, "You have already reviewed this product") from exc
        raise
    return {**review, "customer_name": user.full_name}


@router.get("/admin/reviews", response_model=AdminReviewPage)
def list_admin_reviews(db: AuthDB, staff: StaffUser, page: PageNumber = 1, page_size: PageSize = 100):
    total = db.execute(text("SELECT COUNT(*) FROM product_reviews")).scalar_one()
    rows = db.execute(
        text("""
            SELECT r.review_id, r.product_id, r.user_id AS customer_id, r.order_id,
                   p.name AS product_name, u.full_name AS customer_name, r.rating,
                   r.review_text, r.is_hidden, r.created_at
            FROM product_reviews r
            JOIN products p ON p.product_id = r.product_id
            JOIN users u ON u.user_id = r.user_id
            ORDER BY r.created_at DESC, r.review_id DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": page_size, "offset": (page - 1) * page_size},
    ).mappings().all()
    return {"reviews": rows, "total": total, "page": page, "page_size": page_size}


@router.patch("/admin/reviews/{review_id}", response_model=AdminReview)
def set_review_visibility(review_id: CatalogID, data: ReviewVisibilityPatch, db: AuthDB, staff: StaffUser):
    review = db.execute(
        text("""
            UPDATE product_reviews
            SET is_hidden = :is_hidden,
                hidden_by_user_id = CASE WHEN :is_hidden THEN :staff_id ELSE NULL END,
                hidden_at = CASE WHEN :is_hidden THEN clock_timestamp() ELSE NULL END
            WHERE review_id = :review_id
            RETURNING review_id, product_id, user_id AS customer_id, order_id, rating, review_text,
                      is_hidden, created_at,
                      (SELECT name FROM products WHERE products.product_id = product_reviews.product_id) AS product_name,
                      (SELECT full_name FROM users WHERE users.user_id = product_reviews.user_id) AS customer_name
        """),
        {"review_id": review_id, "is_hidden": data.is_hidden, "staff_id": staff.user_id},
    ).mappings().one_or_none()
    if review is None:
        raise HTTPException(404, "Review not found")
    db.commit()
    return review
