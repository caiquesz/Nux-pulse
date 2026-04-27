from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class ClientBase(BaseModel):
    slug: str
    name: str
    logo_url: str | None = None
    accent_color: str | None = None
    monthly_budget: Decimal | None = None
    monthly_revenue_goal: Decimal | None = None
    niche_code: str | None = None
    segment: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    accent_color: str | None = None
    monthly_budget: Decimal | None = None
    monthly_revenue_goal: Decimal | None = None
    is_active: bool | None = None
    niche_code: str | None = None
    segment: str | None = None


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    onboarded_at: datetime | None = None
    tier_current: str | None = None
    score_current: int | None = None
    score_updated_at: datetime | None = None
