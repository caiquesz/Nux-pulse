"""Criptografia simétrica (Fernet) para secrets armazenados no DB (tokens).

# IMPORTANTE — chave NUNCA pode mudar
A chave usada aqui criptografa tokens da Meta/Google armazenados em
`AccountConnection.tokens_enc`. Se mudar, **todos os tokens viram lixo**
(InvalidToken) e o usuario precisa reconectar TODAS as contas.

## Configuracao recomendada (producao):
1. Gerar chave forte uma unica vez:  `openssl rand -hex 32`
2. Setar `TOKEN_ENCRYPTION_KEY=<a-chave>` no Railway/Vercel
3. **NUNCA mudar essa env var.** Tratar como sagrada.
4. `API_SECRET_KEY` pode rotacionar livremente (so afeta auth da API).

## Compat retro (modo legado):
Se `TOKEN_ENCRYPTION_KEY` nao tiver setada, deriva de `API_SECRET_KEY`
(comportamento antigo). Funciona, mas e PERIGOSO porque qualquer rotacao
de `API_SECRET_KEY` quebra os tokens. O codigo loga warning forte nesse
modo pra forçar migracao.

## Suporte a chaves antigas (rotacao planejada):
Pra migrar de uma chave pra outra sem perder tokens existentes, no futuro
podemos adicionar `TOKEN_ENCRYPTION_KEYS_OLD` (CSV) e tentar decriptar
com cada uma em ordem. Por enquanto: 1 chave so.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_log = logging.getLogger("nux.crypto")
_legacy_warned = False


def _derive_key_from_secret(secret: str) -> bytes:
    """Deriva uma Fernet key (32 bytes base64) a partir de uma string."""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _active_key() -> bytes:
    """Retorna a chave Fernet ativa.

    Prioridade:
      1. TOKEN_ENCRYPTION_KEY (chave dedicada, recomendado)
      2. API_SECRET_KEY (legacy fallback — loga warning)
    """
    global _legacy_warned
    dedicated = settings.TOKEN_ENCRYPTION_KEY
    if dedicated:
        return _derive_key_from_secret(dedicated)

    # Fallback legacy: deriva de API_SECRET_KEY. Se essa env var rotacionar,
    # tokens viram lixo. Avisa uma vez por processo.
    if not _legacy_warned:
        _log.warning(
            "[crypto] TOKEN_ENCRYPTION_KEY nao setada — derivando de "
            "API_SECRET_KEY (LEGACY). Rotacionar API_SECRET_KEY vai quebrar "
            "tokens armazenados. Setar TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32> "
            "e reconectar contas pra migrar pro modo seguro."
        )
        _legacy_warned = True
    return _derive_key_from_secret(settings.API_SECRET_KEY)


def _fernet() -> Fernet:
    return Fernet(_active_key())


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt(ciphertext: bytes) -> str:
    """Decripta token. Raises InvalidToken se chave mudou ou ciphertext corrompido.

    Quando essa exception sobe, o caller (sync.py) ja trata gravando SyncJob
    com status=error e mensagem clara pro usuario reconectar.
    """
    return _fernet().decrypt(ciphertext).decode("utf-8")


# Re-export pra callers tipados
__all__ = ["encrypt", "decrypt", "InvalidToken"]
