"""Models do engine de scoring (Command Center).

Veja `apps/api/app/services/scoring/` pra logica que popula essas tabelas
e PLANO_COMMAND_CENTER.md §4 pras formulas de cada categoria.
"""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ServiceCategory(Base):
    """Uma categoria do scoring (ex: media_performance, strategy_pacing).

    Peso editavel via DB — UI admin de pesos vem na Fase 4.
    """
    __tablename__ = "service_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    weight: Mapped[Decimal] = mapped_column(Numeric(4, 3))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ClientCategoryScore(Base):
    """Score de uma categoria pra um cliente num periodo (semana ISO).

    `components` (JSONB) guarda os sub-scores e inputs que geraram a nota
    pra debug/explicabilidade — ex: `{"ctr_score": 80, "cpc_score": 60, "roas_score": 90}`.
    """
    __tablename__ = "client_category_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("service_categories.id"))
    period_start: Mapped[date] = mapped_column(Date, index=True)
    score: Mapped[int] = mapped_column(SmallInteger)
    components: Mapped[dict | None] = mapped_column(JSONB)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("client_id", "category_id", "period_start", name="uq_client_cat_period"),
    )


class ClientScore(Base):
    """Score composto + tier do cliente num periodo (snapshot semanal).

    `delta_vs_prev` armazena o delta calculado contra o periodo anterior
    pra evitar JOIN redundante na home — usado por `tier_downgrade` e
    `score_drop_10` (ver alertas portfolio).
    """
    __tablename__ = "client_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date, index=True)
    score: Mapped[int | None] = mapped_column(SmallInteger)
    tier: Mapped[str | None] = mapped_column(String(1))
    delta_vs_prev: Mapped[int | None] = mapped_column(SmallInteger)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("client_id", "period_start", name="uq_client_period"),
    )


class NicheBenchmark(Base):
    """Benchmark de uma metrica num nicho (mediana + IQR).

    `source='industry'` vem do seed (Triple Whale / MHI 2026).
    `source='portfolio'` e calculado pela propria NUX quando o nicho tem
    >=3 clientes ativos (Fase 4).
    """
    __tablename__ = "niche_benchmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    niche_code: Mapped[str] = mapped_column(String(40), ForeignKey("niches.code", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(String(40))
    p25: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    p50: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    p75: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    source: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("niche_code", "metric", "source", name="uq_niche_metric_source"),
    )
