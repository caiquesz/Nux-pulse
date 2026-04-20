from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.core.config import settings
from app.models.base import Base
from app.models import client, connection, meta, google, unified, taxonomy, ops  # noqa: F401

config = context.config
# Alembic roda DDL — via pooler transaction-mode pode quebrar. Usa DIRECT_URL
# (porta 5432 no Supabase) quando disponível; senão, usa a DATABASE_URL.
_MIGRATION_URL = settings.DIRECT_URL or _MIGRATION_URL
config.set_main_option("sqlalchemy.url", _MIGRATION_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
