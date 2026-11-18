"""Add verified customer product reviews and manager moderation."""
from pathlib import Path

from alembic import op

revision = "0006_product_reviews"
down_revision = "0003_product_reviews"
branch_labels = None
depends_on = None


def upgrade():
    sql = (Path(__file__).parents[1] / "sql" / "0006_product_reviews.sql").read_text()
    op.execute(sql.replace("BEGIN;", "").replace("COMMIT;", ""))


def downgrade():
    op.drop_index("ix_product_reviews_public", table_name="product_reviews")
    # Preserve the established review table and records created by older
    # installs; only remove the new order association.
    op.drop_column("product_reviews", "order_id")
