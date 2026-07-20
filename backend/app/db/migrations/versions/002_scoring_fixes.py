"""Scoring schema fixes: score_date Date type, UNIQUE constraint, model_version column.

Revision ID: 002
Revises: 001
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fix score_date column type (was DateTime, must be Date)
    op.execute(
        "ALTER TABLE risk_scores ALTER COLUMN score_date TYPE date " "USING score_date::date"
    )

    # Add model_version column if not present
    op.execute(
        "ALTER TABLE risk_scores ADD COLUMN IF NOT EXISTS model_version VARCHAR(20) "
        "NOT NULL DEFAULT '1.0.0'"
    )

    # Add updated_at column if not present
    op.execute(
        "ALTER TABLE risk_scores ADD COLUMN IF NOT EXISTS updated_at "
        "TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
    )

    # Remove duplicate rows before adding UNIQUE constraint
    # Keep the row with the highest overall_score for each (asset_id, score_date) pair
    op.execute(
        """
        DELETE FROM risk_scores rs1
        USING risk_scores rs2
        WHERE rs1.asset_id = rs2.asset_id
          AND rs1.score_date = rs2.score_date
          AND rs1.created_at < rs2.created_at
        """
    )

    # Add UNIQUE constraint
    op.execute(
        "ALTER TABLE risk_scores "
        "ADD CONSTRAINT uq_risk_score_asset_date UNIQUE (asset_id, score_date)"
    )

    # Add secondary index for leaderboard queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_risk_scores_date_score "
        "ON risk_scores (score_date, overall_score DESC)"
    )

    # Add failed_login_attempts and locked_until columns to users if not present
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS organization VARCHAR(255)")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)")

    # Add request_id and success columns to audit_logs
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(64)")
    op.execute(
        "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE risk_scores DROP CONSTRAINT IF EXISTS uq_risk_score_asset_date")
    op.execute("DROP INDEX IF EXISTS ix_risk_scores_date_score")
    op.execute(
        "ALTER TABLE risk_scores ALTER COLUMN score_date TYPE timestamp with time zone "
        "USING score_date::timestamp with time zone"
    )
