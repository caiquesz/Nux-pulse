"""Tabelas operacionais: jobs de sync, alertas."""
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, DateTime, Date, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(32))  # backfill|daily|hourly|manual
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|done|error
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_start: Mapped[date | None] = mapped_column(Date)
    window_end: Mapped[date | None] = mapped_column(Date)
    rows_written: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(Text)


class Alert(Base, TimestampMixin):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    severity: Mapped[str] = mapped_column(String(16))  # info|warn|neg|pos
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    platform: Mapped[str | None] = mapped_column(String(16))
    object_id: Mapped[str | None] = mapped_column(String(48))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Portfolio-wide extensions (Fase 1 do Command Center)
    rule_code: Mapped[str | None] = mapped_column(String(40), index=True)
    category_code: Mapped[str | None] = mapped_column(String(40))
    scope: Mapped[str] = mapped_column(String(20), default="client", server_default="client")
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
