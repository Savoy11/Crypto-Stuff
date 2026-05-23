"""
ORM model registry — import all models here so Alembic can discover them.
"""
from app.models.base import Base
from app.models.asset import Asset, AssetType
from app.models.market_data import MarketData
from app.models.reserve_attestation import ReserveAttestation
from app.models.risk_score import RiskScore, RiskBand
from app.models.liquidity_metric import LiquidityMetric
from app.models.blockchain_metric import BlockchainMetric
from app.models.wallet_concentration import WalletConcentration
from app.models.alert import Alert, AlertType, AlertSeverity
from app.models.user import User, UserRole
from app.models.watchlist import Watchlist
from app.models.api_key import APIKey
from app.models.audit_log import AuditLog

__all__ = [
    "Base",
    "Asset",
    "AssetType",
    "MarketData",
    "ReserveAttestation",
    "RiskScore",
    "RiskBand",
    "LiquidityMetric",
    "BlockchainMetric",
    "WalletConcentration",
    "Alert",
    "AlertType",
    "AlertSeverity",
    "User",
    "UserRole",
    "Watchlist",
    "APIKey",
    "AuditLog",
]
