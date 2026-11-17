"""Separate payment state and durable confirmation email queue."""
from pathlib import Path
from alembic import op

revision = '0003_payments'
down_revision = '0002_staff_workspaces'
branch_labels = None
depends_on = None


def upgrade():
    sql = (Path(__file__).parents[1] / 'sql' / '0004_payments.sql').read_text()
    op.execute(sql.replace('BEGIN;', '').replace('COMMIT;', ''))


def downgrade():
    op.drop_table('email_outbox')
    op.drop_table('payment_events')
    for name in ('paid_at', 'checkout_url', 'stripe_session_id', 'payment_status'):
        op.drop_column('orders', name)
