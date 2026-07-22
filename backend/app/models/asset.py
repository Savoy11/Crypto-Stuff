"""
Asset model — represents a digital asset (stablecoin, tokenized asset, CBDC, DeFi token).
"""
from __future__ import annotations

import enum

from sqlalchemy import Boolean, Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AssetType(str, enum.Enum):
    stablecoin = "stablecoin"
    tokenized = "tokenized"
    cbdc = "cbdc"
    defi = "defi"


class Asset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "assets"

    symbol: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type: Mapped[AssetType] = mapped_column(
        Enum(AssetType, name="asset_type_enum"),
        nullable=False,
        index=True,
    )
    blockchain: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    contract_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    coingecko_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    defillama_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    asset_metadata: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
    )

    # ── Relationships ────────────────────────────────────────────────────────
    market_data: Mapped[list[MarketData]] = relationship(  # noqa: F821
        "MarketData", back_populates="asset", lazy="noload"
    )
    risk_scores: Mapped[list[RiskScore]] = relationship(  # noqa: F821
        "RiskScore", back_populates="asset", lazy="noload"
    )
    reserve_attestations: Mapped[list[ReserveAttestation]] = relationship(  # noqa: F821
        "ReserveAttestation", back_populates="asset", lazy="noload"
    )
    liquidity_metrics: Mapped[list[LiquidityMetric]] = relationship(  # noqa: F821
        "LiquidityMetric", back_populates="asset", lazy="noload"
    )
    blockchain_metrics: Mapped[list[BlockchainMetric]] = relationship(  # noqa: F821
        "BlockchainMetric", back_populates="asset", lazy="noload"
    )
    wallet_concentrations: Mapped[list[WalletConcentration]] = relationship(  # noqa: F821
        "WalletConcentration", back_populates="asset", lazy="noload"
    )
    alerts: Mapped[list[Alert]] = relationship(  # noqa: F821
        "Alert", back_populates="asset", lazy="noload"
    )

    def __repr__(self) -> str:
        return f"<Asset {self.symbol} ({self.asset_type})>"
