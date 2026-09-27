"""Initial advisory demo persistence schema.

Revision ID: 0001_demo_persistence
Revises:
"""

from alembic import op

from apps.api.db import Base

revision = "0001_demo_persistence"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    Base.metadata.create_all(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError("Destructive downgrade is intentionally disabled for audit data")
