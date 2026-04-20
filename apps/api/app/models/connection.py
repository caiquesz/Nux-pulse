from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, LargeBinary, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.models.base import Base, TimestampMixin


class Platform(str, enum.Enum):
    meta = "meta"
    google = "google"


class ConnectionStatus(str, enum.Enum):
    active = "active"
    expired = "expired"
    error = "error"
    disabled = "disabled"


class AccountConnection(Base, TimestampMixin):
    """Credencial de acesso a uma conta de anúncios do cliente."""
    __tablename__ = "account_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    platform: Mapped[Platform] = mapped_column(SAEnum(Platform, name="platform_enum"))
    external_account_id: Mapped[str] = mapped_column(String(64))  # act_XXX | customers/XXX
    display_name: Mapped[str | None] = mapped_column(String(120))
    tokens_enc: Mapped[bytes | None] = mapped_column(LargeBinary)  # criptografado com Fernet
    status: Mapped[ConnectionStatus] = mapped_column(
        SAEnum(ConnectionStatus, name="connection_status_enum"), default=ConnectionStatus.active
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(1000))
    timezone_name: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str | None] = mapped_column(String(8))

    client = relationship("Client", back_populates="connections")
