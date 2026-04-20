from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://nux:nux_dev@localhost:5432/nux_pulse"
    # Supabase fornece duas URLs: `DATABASE_URL` (pooler) p/ runtime
    # e `DIRECT_URL` (direct) p/ migrations. Se não vier, usa a mesma.
    DIRECT_URL: str | None = None
    REDIS_URL: str = "redis://localhost:6379/0"

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_SECRET_KEY: str = "dev-secret-change-me"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3010"

    META_APP_ID: str | None = None
    META_APP_SECRET: str | None = None
    META_SYSTEM_USER_TOKEN: str | None = None

    GOOGLE_ADS_DEVELOPER_TOKEN: str | None = None
    GOOGLE_ADS_CLIENT_ID: str | None = None
    GOOGLE_ADS_CLIENT_SECRET: str | None = None
    GOOGLE_ADS_REFRESH_TOKEN: str | None = None
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: str | None = None

    @field_validator("DATABASE_URL", "DIRECT_URL", mode="before")
    @classmethod
    def _normalize_db_url(cls, v: str | None) -> str | None:
        # Supabase entrega "postgresql://...", mas SQLAlchemy precisa do driver
        # explícito pra escolher psycopg v3. Normaliza sem exigir que o usuário
        # lembre do "+psycopg" ao colar a URL no painel.
        if not v:
            return v
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
