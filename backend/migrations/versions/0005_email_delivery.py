"""Track delivery attempts for queued payment confirmation emails."""
from pathlib import Path

from alembic import op

revision = "0005_email_delivery"
down_revision = "0004_order_features"
branch_labels = None
depends_on = None


def upgrade():
    sql = (Path(__file__).parents[1] / "sql" / "0005_email_delivery.sql").read_text()
    op.execute(sql.replace("BEGIN;", "").replace("COMMIT;", ""))


def downgrade():
    op.drop_index("ix_email_outbox_ready", table_name="email_outbox")
    op.drop_column("email_outbox", "next_attempt_at")
    op.drop_column("email_outbox", "attempt_count")
