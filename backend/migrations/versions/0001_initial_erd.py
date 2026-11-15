"""Create the Court Supply ERD schema.

Revision ID: 0001_initial_erd
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_erd"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "roles",
        sa.Column("role_id", sa.SmallInteger(), primary_key=True, autoincrement=True),
        sa.Column("role_name", sa.String(32), nullable=False, unique=True),
        sa.CheckConstraint("role_name IN ('customer', 'manager', 'administrator')", name="ck_roles_name"),
    )
    op.create_table(
        "users",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.role_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "categories",
        sa.Column("category_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
    )
    op.create_table(
        "brands",
        sa.Column("brand_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
    )
    op.create_table(
        "products",
        sa.Column("product_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("category_id", sa.BigInteger(), sa.ForeignKey("categories.category_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("brand_id", sa.BigInteger(), sa.ForeignKey("brands.brand_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("base_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("image_url", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("base_price_minor >= 0", name="ck_products_base_price_nonnegative"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_products_currency_format"),
    )
    op.create_table(
        "product_variants",
        sa.Column("variant_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.BigInteger(), sa.ForeignKey("products.product_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False, unique=True),
        sa.Column("size", sa.String(40), nullable=False),
        sa.Column("colour", sa.String(60), nullable=False),
        sa.Column("price_minor", sa.BigInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("product_id", "size", "colour", name="uq_variant_product_size_colour"),
        sa.CheckConstraint("price_minor >= 0", name="ck_variants_price_nonnegative"),
    )
    op.create_table(
        "inventory",
        sa.Column("variant_id", sa.BigInteger(), sa.ForeignKey("product_variants.variant_id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("quantity_on_hand", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity_on_hand >= 0", name="ck_inventory_quantity_nonnegative"),
    )
    op.create_table(
        "orders",
        sa.Column("order_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="placed"),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("shipping_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("delivery_name", sa.String(160), nullable=False),
        sa.Column("delivery_address", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('placed', 'shipped', 'delivered')", name="ck_orders_status"),
        sa.CheckConstraint("subtotal_minor >= 0 AND shipping_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0", name="ck_orders_amounts_nonnegative"),
        sa.CheckConstraint("total_minor = subtotal_minor + shipping_minor + tax_minor", name="ck_orders_total_matches_components"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_orders_currency_format"),
    )
    op.create_table(
        "order_items",
        sa.Column("order_item_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.order_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("variant_id", sa.BigInteger(), sa.ForeignKey("product_variants.variant_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("product_name_snapshot", sa.String(180), nullable=False),
        sa.Column("size_snapshot", sa.String(40), nullable=False),
        sa.Column("colour_snapshot", sa.String(60), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("line_total_minor", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint("order_id", "variant_id", name="uq_order_item_order_variant"),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        sa.CheckConstraint("unit_price_minor >= 0 AND line_total_minor >= 0", name="ck_order_items_amounts_nonnegative"),
        sa.CheckConstraint("line_total_minor = quantity * unit_price_minor", name="ck_order_items_line_total"),
    )
    op.create_table(
        "order_status_history",
        sa.Column("history_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.order_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("old_status", sa.String(20)),
        sa.Column("new_status", sa.String(20), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("new_status IN ('placed', 'shipped', 'delivered')", name="ck_order_status_history_new_status"),
        sa.CheckConstraint("old_status IS NULL OR old_status IN ('placed', 'shipped', 'delivered')", name="ck_order_status_history_old_status"),
    )
    op.create_table(
        "inventory_movements",
        sa.Column("movement_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("variant_id", sa.BigInteger(), sa.ForeignKey("product_variants.variant_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="RESTRICT"), nullable=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.order_id", ondelete="RESTRICT"), nullable=True),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity_delta <> 0", name="ck_inventory_movements_nonzero_delta"),
    )

    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("uq_users_email_ci", "users", [sa.text("lower(email)")], unique=True)
    op.create_index("ix_products_brand_id", "products", ["brand_id"])
    op.create_index("ix_products_active_name", "products", ["is_active", "name"])
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_orders_customer_created", "orders", ["customer_id", "created_at"])
    op.create_index("ix_orders_status_created", "orders", ["status", "created_at"])
    op.create_index("ix_order_items_variant_id", "order_items", ["variant_id"])
    op.create_index("ix_order_status_history_order_changed", "order_status_history", ["order_id", "changed_at"])
    op.create_index("ix_inventory_movements_variant_created", "inventory_movements", ["variant_id", "created_at"])

    op.execute("INSERT INTO roles (role_name) VALUES ('customer'), ('manager'), ('administrator')")


def downgrade():
    op.drop_table("inventory_movements")
    op.drop_table("order_status_history")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("inventory")
    op.drop_table("product_variants")
    op.drop_table("products")
    op.drop_table("brands")
    op.drop_table("categories")
    op.drop_table("users")
    op.drop_table("roles")
