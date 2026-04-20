"""
Seed inicial: cria o cliente piloto e sua conexão Meta Ads.

Uso:
    python -m scripts.seed

Lê META_SYSTEM_USER_TOKEN do .env. Criptografa com Fernet antes de salvar.
Configurações do cliente piloto podem ser alteradas abaixo.
"""
from app.core.config import settings
from app.core.crypto import encrypt
from app.core.db import SessionLocal
from app.models.client import Client
from app.models.connection import AccountConnection, Platform


PILOT = {
    "slug": "segredos-de-minas",
    "name": "Segredos de Minas",
    "accent_color": "#8A5A3B",  # terracota, alinhado com a paleta NUX
    "monthly_budget": 10_000,   # R$ — ajustar depois em Config do cliente
    "monthly_revenue_goal": 50_000,
    "meta_account_id": "act_2221699994983146",
}


def main() -> None:
    db = SessionLocal()
    try:
        # 1) client
        c = db.query(Client).filter(Client.slug == PILOT["slug"]).first()
        if c is None:
            c = Client(
                slug=PILOT["slug"],
                name=PILOT["name"],
                accent_color=PILOT["accent_color"],
                monthly_budget=PILOT["monthly_budget"],
                monthly_revenue_goal=PILOT["monthly_revenue_goal"],
                is_active=True,
            )
            db.add(c); db.commit(); db.refresh(c)
            print(f"✓ Client created: {c.slug} (id={c.id})")
        else:
            print(f"• Client exists: {c.slug} (id={c.id}) — skipping")

        # 2) connection Meta
        if not settings.META_SYSTEM_USER_TOKEN:
            print("⚠ META_SYSTEM_USER_TOKEN not set in .env — skipping connection.")
            return

        existing = (
            db.query(AccountConnection)
            .filter(
                AccountConnection.client_id == c.id,
                AccountConnection.platform == Platform.meta,
                AccountConnection.external_account_id == PILOT["meta_account_id"],
            )
            .first()
        )
        if existing:
            existing.tokens_enc = encrypt(settings.META_SYSTEM_USER_TOKEN)
            db.add(existing); db.commit()
            print(f"• Connection exists (id={existing.id}) — token re-encrypted")
        else:
            conn = AccountConnection(
                client_id=c.id,
                platform=Platform.meta,
                external_account_id=PILOT["meta_account_id"],
                display_name="Segredos de Minas - 01",
                tokens_enc=encrypt(settings.META_SYSTEM_USER_TOKEN),
            )
            db.add(conn); db.commit(); db.refresh(conn)
            print(f"✓ Meta connection created (id={conn.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
