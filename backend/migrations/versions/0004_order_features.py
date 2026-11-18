"""Join the discount and payment schema revisions."""

revision = "0004_order_features"
down_revision = ("0003_discount_codes", "0003_payments")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
