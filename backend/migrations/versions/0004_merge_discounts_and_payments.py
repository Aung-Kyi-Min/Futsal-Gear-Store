"""Merge the discount and payment migration branches."""

revision = "0004_discounts_and_payments"
down_revision = ("0003_discount_codes", "0003_payments")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
