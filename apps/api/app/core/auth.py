"""Autenticação minimalista por API key compartilhada.

Para ferramenta interna de agência (eu + equipe) — protege contra bots
e acesso casual à URL pública. Não é auth de usuário final: qualquer um
com acesso ao DevTools do app vê a chave. Quando vier login real (OAuth/
session), esta dependency é substituída sem mexer nos routers.

Uso:
    from app.core.auth import require_api_key
    app.include_router(
        clients.router,
        dependencies=[Depends(require_api_key)],
    )
"""
from fastapi import Header, HTTPException, status

from app.core.config import settings


async def require_api_key(x_api_key: str | None = Header(None, alias="X-API-Key")) -> None:
    """Compara X-API-Key header com settings.API_SECRET_KEY (constant-time).

    - Se API_SECRET_KEY for o default 'dev-secret-change-me' ou vazio:
      libera (dev local sem precisar de header). Em produção o deploy
      força uma chave real.
    - Senão, exige header e faz compare seguro.
    """
    configured = settings.API_SECRET_KEY
    if not configured or configured == "dev-secret-change-me":
        return  # modo dev: sem gate

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # compare-and-swap constant-time
    import hmac
    if not hmac.compare_digest(x_api_key, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key.")
