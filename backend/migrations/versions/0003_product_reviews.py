"""Compatibility marker for the previous local review migration.

Some existing databases already contain the product_reviews table and have
this revision recorded, although the original migration file was lost from
the checkout. Keep that marker in the graph so those databases can upgrade.
"""

revision = "0003_product_reviews"
down_revision = "0005_email_delivery"
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
