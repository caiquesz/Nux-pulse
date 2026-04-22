"""Schemas pra conversoes manuais."""
from datetime import date as _date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


ConvKind = Literal["purchase", "lead", "message"]


class ManualConversionCreate(BaseModel):
    date: _date
    kind: ConvKind
    count: int = 1
    revenue: Decimal | None = None
    campaign_id: str | None = None
    campaign_name: str | None = None
    notes: str | None = None
    created_by_id: int | None = None


class ManualConversionUpdate(BaseModel):
    date: _date | None = None
    kind: ConvKind | None = None
    count: int | None = None
    revenue: Decimal | None = None
    campaign_id: str | None = None
    campaign_name: str | None = None
    notes: str | None = None


class ManualConversionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    date: _date
    kind: str
    count: int
    revenue: Decimal | None
    campaign_id: str | None
    campaign_name: str | None
    notes: str | None
    created_by_id: int | None
    created_by_name: str | None = None
    created_at: datetime
