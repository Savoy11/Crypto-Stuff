"""Rename enum types to the names the models declare.

Migration 001 created the five enum types under SQLAlchemy's default names
(class name lowercased: userrole, assettype, ...), but every model declares an
explicit name (user_role_enum, asset_type_enum, ...). asyncpg casts enum
parameters using the model's declared name, so any ORM INSERT touching one of
these columns failed with UndefinedObjectError — user creation (signup, test
fixtures) being the first casualty.

Revision ID: 003
Revises: 002
Create Date: 2026-07-28
"""
from __future__ import annotations

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

# (old default name, name declared by the model)
_RENAMES = [
    ("userrole", "user_role_enum"),
    ("assettype", "asset_type_enum"),
    ("riskband", "risk_band_enum"),
    ("alerttype", "alert_type_enum"),
    ("alertseverity", "alert_severity_enum"),
]


def _rename(old: str, new: str) -> None:
    # Guarded so the migration is safe on databases in either state.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '{old}')
               AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{new}') THEN
                ALTER TYPE {old} RENAME TO {new};
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    for old, new in _RENAMES:
        _rename(old, new)


def downgrade() -> None:
    for old, new in _RENAMES:
        _rename(new, old)
