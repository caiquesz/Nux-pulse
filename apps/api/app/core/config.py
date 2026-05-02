from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# libpq (e por extensão o psycopg v3) não conhece estes parâmetros — eles são
# hints pra ferramentas que leem a URL por fora (Prisma, Drizzle, Supabase CLI).
# Se chegarem na string de conexão, libpq rejeita. Strippar é mais seguro que
# configurar connect_args — mantém config/env.py iguais.
_SUPABASE_HINT_PARAMS = {"pgbouncer", "schema", "connection_limit", "pool_timeout"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" (default, relaxa guards) | "production" (exige todas as envs de segurança).
    # Railway/Vercel devem setar ENV=production no deploy.
    ENV: str = "development"

    DATABASE_URL: str = "postgresql+psycopg://nux:nux_dev@localhost:5432/nux_pulse"
    # Supabase fornece duas URLs: `DATABASE_URL` (pooler) p/ runtime
    # e `DIRECT_URL` (direct) p/ migrations. Se não vier, usa a mesma.
    DIRECT_URL: str | None = None
    REDIS_URL: str = "redis://localhost:6379/0"

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_SECRET_KEY: str = "dev-secret-change-me"
    # ⚠️ CHAVE IMUTAVEL — usada pra criptografar tokens da Meta no banco.
    # Se mudar, TODOS os tokens existentes viram lixo (InvalidToken). NUNCA
    # rotacione sem migration que re-criptografa. Setar 1x e esquecer.
    # Gerar com: `openssl rand -hex 32`
    # Se vazia, falla pra derivar de API_SECRET_KEY (compat retro — perigo!).
    TOKEN_ENCRYPTION_KEY: str | None = None
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3010"

    # Secret compartilhado com o cron proxy (Vercel). Obrigatório em produção.
    CRON_SECRET: str | None = None

    # Secret compartilhado com o Trackcore (sistema externo de tracking server-side).
    # Trackcore envia X-Trackcore-Secret nos webhooks de evento.
    TRACKCORE_INTEGRATION_SECRET: str | None = None

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

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

        # Remove parâmetros de query que libpq/psycopg não conhecem
        # (Supabase costuma anexar `?pgbouncer=true` por padrão).
        parts = urlsplit(v)
        if parts.query:
            kept = [(k, val) for k, val in parse_qsl(parts.query, keep_blank_values=True)
                    if k not in _SUPABASE_HINT_PARAMS]
            v = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
