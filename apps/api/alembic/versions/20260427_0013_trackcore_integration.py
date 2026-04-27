"""trackcore integration — campos de atribuicao em manual_conversions

Estende `manual_conversions` pra receber eventos do Trackcore (sistema
externo: pixel + CAPI + WhatsApp) com atribuicao rica:

- external_event_id: idempotencia (UUID do Trackcore Event/Conversation)
- attribution_source: 'manual' (default existente) | 'trackcore' | outros
- UTMs (source/medium/campaign/content/term): atribuicao por URL/UTM
- meta_ad_id / meta_ad_name: atribuicao Meta direto (do click-to-WhatsApp)

Idempotente: dispatchs com mesmo external_event_id sao ignorados (UNIQUE).
Manual conversions existentes nao mexem (todos novos campos sao nullable).

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("manual_conversions", sa.Column("external_event_id", sa.String(64), nullable=True))
    op.add_column("manual_conversions", sa.Column("attribution_source", sa.String(40), nullable=False, server_default="manual"))
    op.add_column("manual_conversions", sa.Column("utm_source", sa.String(120), nullable=True))
    op.add_column("manual_conversions", sa.Column("utm_medium", sa.String(120), nullable=True))
    op.add_column("manual_conversions", sa.Column("utm_campaign", sa.String(200), nullable=True))
    op.add_column("manual_conversions", sa.Column("utm_content", sa.String(200), nullable=True))
    op.add_column("manual_conversions", sa.Column("utm_term", sa.String(200), nullable=True))
    op.add_column("manual_conversions", sa.Column("meta_ad_id", sa.String(64), nullable=True))
    op.add_column("manual_conversions", sa.Column("meta_ad_name", sa.String(200), nullable=True))

    op.create_unique_constraint(
        "uq_manual_conversions_external_event_id",
        "manual_conversions",
        ["external_event_id"],
    )
    op.create_index("ix_manual_conversions_attribution_source", "manual_conversions", ["attribution_source"])
    op.create_index("ix_manual_conversions_utm_campaign", "manual_conversions", ["utm_campaign"])
    op.create_index("ix_manual_conversions_meta_ad_id", "manual_conversions", ["meta_ad_id"])


def downgrade() -> None:
    op.drop_index("ix_manual_conversions_meta_ad_id", table_name="manual_conversions")
    op.drop_index("ix_manual_conversions_utm_campaign", table_name="manual_conversions")
    op.drop_index("ix_manual_conversions_attribution_source", table_name="manual_conversions")
    op.drop_constraint("uq_manual_conversions_external_event_id", "manual_conversions", type_="unique")
    op.drop_column("manual_conversions", "meta_ad_name")
    op.drop_column("manual_conversions", "meta_ad_id")
    op.drop_column("manual_conversions", "utm_term")
    op.drop_column("manual_conversions", "utm_content")
    op.drop_column("manual_conversions", "utm_campaign")
    op.drop_column("manual_conversions", "utm_medium")
    op.drop_column("manual_conversions", "utm_source")
    op.drop_column("manual_conversions", "attribution_source")
    op.drop_column("manual_conversions", "external_event_id")
