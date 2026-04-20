"""Criptografia simétrica (Fernet) para secrets armazenados no DB (tokens)."""
import base64
import hashlib
from cryptography.fernet import Fernet

from app.core.config import settings


def _derive_key() -> bytes:
    """Deriva uma Fernet key de 32 bytes a partir do API_SECRET_KEY.

    Nota: uso interno. Para produção real, use uma ENCRYPTION_KEY dedicada em
    KMS/Vault e rotacione periodicamente.
    """
    digest = hashlib.sha256(settings.API_SECRET_KEY.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    return Fernet(_derive_key())


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt(ciphertext: bytes) -> str:
    return _fernet().decrypt(ciphertext).decode("utf-8")
