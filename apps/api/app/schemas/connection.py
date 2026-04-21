from pydantic import BaseModel, ConfigDict


class MetaConnectionCreate(BaseModel):
    external_account_id: str     # act_XXXXXXX
    display_name: str | None = None
    system_user_token: str       # criptografado antes de salvar


class GoogleConnectionCreate(BaseModel):
    customer_id: str              # Google Ads customer id (ex: 1234567890, sem dashes)
    display_name: str | None = None
    developer_token: str          # MCC developer token
    oauth_client_id: str
    oauth_client_secret: str
    refresh_token: str
    login_customer_id: str | None = None  # MCC id quando aplicável


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
