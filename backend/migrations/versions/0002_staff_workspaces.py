"""Add shop settings and processing order status."""
from alembic import op

revision = '0002_staff_workspaces'
down_revision = '0001_initial_erd'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE orders DROP CONSTRAINT ck_orders_status")
    op.execute("ALTER TABLE orders ADD CONSTRAINT ck_orders_status CHECK (status IN ('placed', 'processing', 'shipped', 'delivered'))")
    for column in ('old', 'new'):
        op.execute(f'ALTER TABLE order_status_history DROP CONSTRAINT ck_order_status_history_{column}_status')
        op.execute(f"ALTER TABLE order_status_history ADD CONSTRAINT ck_order_status_history_{column}_status CHECK ({column}_status IN ('placed', 'processing', 'shipped', 'delivered'))")
    op.execute('''CREATE TABLE shop_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1), store_name VARCHAR(160) NOT NULL,
        contact_email VARCHAR(254) NOT NULL
    )''')
    op.execute("INSERT INTO shop_settings VALUES (1, 'Court Supply', 'contact@courtsupply.com')")


def downgrade():
    # A rollback cannot represent processing; retain those orders as placed.
    op.execute("UPDATE orders SET status = 'placed' WHERE status = 'processing'")
    op.execute("UPDATE order_status_history SET old_status = 'placed' WHERE old_status = 'processing'")
    op.execute("UPDATE order_status_history SET new_status = 'placed' WHERE new_status = 'processing'")
    op.execute('ALTER TABLE orders DROP CONSTRAINT ck_orders_status')
    op.execute("ALTER TABLE orders ADD CONSTRAINT ck_orders_status CHECK (status IN ('placed', 'shipped', 'delivered'))")
    for column in ('old', 'new'):
        op.execute(f'ALTER TABLE order_status_history DROP CONSTRAINT ck_order_status_history_{column}_status')
        op.execute(f"ALTER TABLE order_status_history ADD CONSTRAINT ck_order_status_history_{column}_status CHECK ({column}_status IN ('placed', 'shipped', 'delivered'))")
    op.drop_table('shop_settings')
