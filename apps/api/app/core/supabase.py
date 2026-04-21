"""Integração com Supabase Storage.

Usamos a REST API direto (sem SDK) pra não pendurar mais uma dep. Requer
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no ambiente. Em dev sem Supabase
configurado, os endpoints de upload retornam 503 claro — nada quebra silencioso.
"""
from __future__ import annotations

import os
from urllib.parse import urlencode

import httpx


STORAGE_BUCKET_FILES = "client-files"


def _supabase_url() -> str | None:
    return os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")


def _service_key() -> str | None:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def supabase_admin_available() -> bool:
    return bool(_supabase_url() and _service_key())


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_service_key()}", "apikey": _service_key() or ""}


def upload_to_storage(bucket: str, path: str, content: bytes, content_type: str) -> None:
    """Upload (POST). Falha com HTTPException 502 se a API reclamar."""
    url = f"{_supabase_url()}/storage/v1/object/{bucket}/{path}"
    r = httpx.post(
        url, content=content, timeout=60,
        headers={**_headers(), "Content-Type": content_type, "x-upsert": "true"},
    )
    if r.status_code >= 400:
        from fastapi import HTTPException
        raise HTTPException(502, f"Supabase upload failed ({r.status_code}): {r.text[:200]}")


def delete_from_storage(bucket: str, path: str) -> None:
    url = f"{_supabase_url()}/storage/v1/object/{bucket}/{path}"
    r = httpx.delete(url, headers=_headers(), timeout=30)
    if r.status_code >= 400 and r.status_code != 404:
        raise RuntimeError(f"Supabase delete failed: {r.status_code} {r.text[:200]}")


def publicize_path(bucket: str, path: str) -> str:
    """Retorna URL pública. Se bucket for privado, gera signed URL de 1h."""
    base = _supabase_url() or ""
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def create_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str | None:
    """Pra buckets privados. Gera URL assinada."""
    if not supabase_admin_available():
        return None
    url = f"{_supabase_url()}/storage/v1/object/sign/{bucket}/{path}"
    r = httpx.post(url, headers=_headers(), json={"expiresIn": expires_in}, timeout=15)
    if r.status_code >= 400:
        return None
    data = r.json()
    signed = data.get("signedURL") or data.get("signedUrl")
    if not signed:
        return None
    return f"{_supabase_url()}/storage/v1{signed}"
