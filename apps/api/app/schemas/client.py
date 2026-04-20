from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class ClientBase(BaseModel):
    slug: str
    name: str
    logo_url: str | None = None
    accent_color: str | None = None
    monthly_budget: Decimal | None = None
    monthly_revenue_goal: Decimal | None = None


class ClientCreate(ClientBase):
    pass


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
