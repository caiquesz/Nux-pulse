from logging.config import fileConfig
from sqlalchemy import create_engine, pool
from alembic import context

from app.core.config import settings
from app.models.base import Base
from app.models import client, connection, meta, google, unified, taxonomy, ops, project  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Alembic roda DDL — via pooler transaction-mode pode quebrar. Usa DIRECT_URL
# (porta 5432 no Supabase) quando disponível; senão, usa a DATABASE_URL.
# Passa a URL direto pro create_engine pra evitar configparser, que interpreta
# `%` como variável de interpolação (quebra com passwords URL-encoded).
_MIGRATION_URL = settings.DIRECT_URL or settings.DATABASE_URL


def run_migrations_offline() -> None:
    context.configure(
        url=_MIGRATION_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_MIGRATION_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
