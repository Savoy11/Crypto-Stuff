"""Initial schema: all tables, indexes, and TimescaleDB hypertables.

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # ENUMS
    # ------------------------------------------------------------------ #
    asset_type_enum = postgresql.ENUM(
        "stablecoin", "tokenized", "cbdc", "defi", name="assettype", create_type=True
    )
    risk_band_enum = postgresql.ENUM(
        "low", "moderate", "elevated", "high", "critical", name="riskband", create_type=True
    )
    alert_type_enum = postgresql.ENUM(
        "depeg", "reserve_deterioration", "liquidity_collapse",
        "abnormal_volume", "wallet_concentration", "smart_contract",
        "general", name="alerttype", create_type=True
    )
    alert_severity_enum = postgresql.ENUM(
        "info", "warning", "critical", name="alertseverity", create_type=True
    )
    user_role_enum = postgresql.ENUM(
        "viewer", "analyst", "admin", name="userrole", create_type=True
    )

    for e in (asset_type_enum, risk_band_enum, alert_type_enum, alert_severity_enum, user_role_enum):
        e.create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------ #
    # users
    # ------------------------------------------------------------------ #
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("viewer", "analyst", "admin", name="userrole"), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mfa_secret", sa.String(64), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ------------------------------------------------------------------ #
    # assets
    # ------------------------------------------------------------------ #
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("asset_type", sa.Enum("stablecoin", "tokenized", "cbdc", "defi", name="assettype"), nullable=False),
        sa.Column("blockchain", sa.String(64), nullable=False),
        sa.Column("contract_address", sa.String(128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("coingecko_id", sa.String(128), nullable=True),
        sa.Column("defillama_id", sa.String(128), nullable=True),
        sa.Column("peg_currency", sa.String(8), nullable=False, server_default="USD"),
        sa.Column("peg_value", sa.Numeric(20, 8), nullable=False, server_default="1.0"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_assets_symbol", "assets", ["symbol"])
    op.create_index("ix_assets_asset_type", "assets", ["asset_type"])
    op.create_index("ix_assets_is_active", "assets", ["is_active"])

    # ------------------------------------------------------------------ #
    # market_data (TimescaleDB hypertable)
    # ------------------------------------------------------------------ #
    op.create_table(
        "market_data",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price_usd", sa.Numeric(30, 10), nullable=False),
        sa.Column("market_cap", sa.Numeric(30, 2), nullable=True),
        sa.Column("volume_24h", sa.Numeric(30, 2), nullable=True),
        sa.Column("peg_deviation_pct", sa.Numeric(10, 6), nullable=True),
        sa.Column("peg_deviation_bps", sa.Numeric(10, 4), nullable=True),
        sa.Column("liquidity_depth_1pct", sa.Numeric(30, 2), nullable=True),
        sa.Column("liquidity_depth_2pct", sa.Numeric(30, 2), nullable=True),
        sa.Column("source", sa.String(64), nullable=False, server_default="coingecko"),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_market_data_asset_timestamp", "market_data", ["asset_id", "timestamp"])
    # Convert to hypertable (requires TimescaleDB extension)
    op.execute("SELECT create_hypertable('market_data', 'timestamp', if_not_exists => TRUE);")

    # ------------------------------------------------------------------ #
    # reserve_attestations
    # ------------------------------------------------------------------ #
    op.create_table(
        "reserve_attestations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attestation_date", sa.Date(), nullable=False),
        sa.Column("attester", sa.String(255), nullable=False),
        sa.Column("total_reserves_usd", sa.Numeric(30, 2), nullable=False),
        sa.Column("reserve_composition", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("collateralization_ratio", sa.Numeric(10, 6), nullable=False),
        sa.Column("report_url", sa.String(2048), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_reserve_attestations_asset_date", "reserve_attestations", ["asset_id", "attestation_date"])

    # ------------------------------------------------------------------ #
    # risk_scores
    # ------------------------------------------------------------------ #
    op.create_table(
        "risk_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("overall_score", sa.Numeric(5, 2), nullable=False),
        sa.Column("reserve_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("peg_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("network_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("security_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("risk_band", sa.Enum("low", "moderate", "elevated", "high", "critical", name="riskband"), nullable=False),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=False, server_default="1.0"),
        sa.Column("percentile_rank", sa.Numeric(5, 2), nullable=True),
        sa.Column("score_breakdown", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("data_completeness", sa.Numeric(5, 4), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_risk_scores_asset_date", "risk_scores", ["asset_id", "score_date"])

    # ------------------------------------------------------------------ #
    # liquidity_metrics (hypertable)
    # ------------------------------------------------------------------ #
    op.create_table(
        "liquidity_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dex_liquidity_usd", sa.Numeric(30, 2), nullable=True),
        sa.Column("cex_liquidity_usd", sa.Numeric(30, 2), nullable=True),
        sa.Column("bid_ask_spread_bps", sa.Numeric(10, 4), nullable=True),
        sa.Column("slippage_1pct", sa.Numeric(10, 6), nullable=True),
        sa.Column("slippage_2pct", sa.Numeric(10, 6), nullable=True),
        sa.Column("top_venues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_liquidity_metrics_asset_timestamp", "liquidity_metrics", ["asset_id", "timestamp"])
    op.execute("SELECT create_hypertable('liquidity_metrics', 'timestamp', if_not_exists => TRUE);")

    # ------------------------------------------------------------------ #
    # blockchain_metrics (hypertable)
    # ------------------------------------------------------------------ #
    op.create_table(
        "blockchain_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_supply", sa.Numeric(30, 8), nullable=True),
        sa.Column("circulating_supply", sa.Numeric(30, 8), nullable=True),
        sa.Column("holder_count", sa.BigInteger(), nullable=True),
        sa.Column("active_addresses_24h", sa.BigInteger(), nullable=True),
        sa.Column("transfer_volume_24h", sa.Numeric(30, 2), nullable=True),
        sa.Column("avg_transfer_size", sa.Numeric(30, 8), nullable=True),
        sa.Column("velocity", sa.Numeric(10, 6), nullable=True),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_blockchain_metrics_asset_timestamp", "blockchain_metrics", ["asset_id", "timestamp"])
    op.execute("SELECT create_hypertable('blockchain_metrics', 'timestamp', if_not_exists => TRUE);")

    # ------------------------------------------------------------------ #
    # wallet_concentration (hypertable)
    # ------------------------------------------------------------------ #
    op.create_table(
        "wallet_concentration",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("top_10_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("top_50_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("top_100_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("gini_coefficient", sa.Numeric(5, 4), nullable=True),
        sa.Column("hhi_score", sa.Numeric(10, 4), nullable=True),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_wallet_concentration_asset_timestamp", "wallet_concentration", ["asset_id", "timestamp"])
    op.execute("SELECT create_hypertable('wallet_concentration', 'timestamp', if_not_exists => TRUE);")

    # ------------------------------------------------------------------ #
    # alerts
    # ------------------------------------------------------------------ #
    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("alert_type", sa.Enum("depeg", "reserve_deterioration", "liquidity_collapse", "abnormal_volume", "wallet_concentration", "smart_contract", "general", name="alerttype"), nullable=False),
        sa.Column("severity", sa.Enum("info", "warning", "critical", name="alertseverity"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("threshold_value", sa.Numeric(30, 8), nullable=True),
        sa.Column("actual_value", sa.Numeric(30, 8), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_alerts_asset_id", "alerts", ["asset_id"])
    op.create_index("ix_alerts_severity", "alerts", ["severity"])
    op.create_index("ix_alerts_triggered_at", "alerts", ["triggered_at"])

    # ------------------------------------------------------------------ #
    # watchlists
    # ------------------------------------------------------------------ #
    op.create_table(
        "watchlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("asset_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"])

    # ------------------------------------------------------------------ #
    # api_keys
    # ------------------------------------------------------------------ #
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default='["read"]'),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])

    # ------------------------------------------------------------------ #
    # audit_logs
    # ------------------------------------------------------------------ #
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=True),
        sa.Column("resource_id", sa.String(128), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    for table in [
        "audit_logs", "api_keys", "watchlists", "alerts",
        "wallet_concentration", "blockchain_metrics", "liquidity_metrics",
        "risk_scores", "reserve_attestations", "market_data", "assets", "users",
    ]:
        op.drop_table(table)

    for enum_name in ["alertseverity", "alerttype", "userrole", "riskband", "assettype"]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
