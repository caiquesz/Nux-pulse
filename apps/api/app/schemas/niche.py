from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class NicheCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=80)


class NicheRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    name: str
    created_at: datetime
