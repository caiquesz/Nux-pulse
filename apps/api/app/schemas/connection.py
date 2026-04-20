from pydantic import BaseModel, ConfigDict


class MetaConnectionCreate(BaseModel):
    external_account_id: str     # act_XXXXXXX
    display_name: str | None = None
    system_user_token: str       # criptografado antes de salvar


class ConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    platform: str
    external_account_id: str
    display_name: str | None
    status: str
    last_sync_at: str | None = None
    last_error: str | None = None
