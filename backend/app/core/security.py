"""Password and token primitives.

`hash_password` returns a bcrypt hash. `verify_password` accepts either bcrypt or the
legacy SHA-256 hex format produced by the frontend pre-hash flow, so existing rows keep
working while we migrate. Callers should rehash to bcrypt on the next successful login
(see `app/api/users.py`).
"""
from __future__ import annotations

import hashlib
import re
import secrets

import bcrypt


_BCRYPT_PREFIX = re.compile(r"^\$2[abxy]\$")


def hash_password(plain_or_sha256: str) -> str:
    """Hash a password with bcrypt. Input may be a SHA-256 hex digest (the frontend
    pre-hashes for legacy reasons) — bcrypt happily wraps it."""
    return bcrypt.hashpw(plain_or_sha256.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(submitted: str, stored: str | None) -> bool:
    if not stored:
        return False
    if _BCRYPT_PREFIX.match(stored):
        try:
            return bcrypt.checkpw(submitted.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    # Legacy SHA-256 hex (still acceptable during grace period; remove in PR-4).
    return submitted == stored


def is_legacy_sha256(stored: str | None) -> bool:
    """True if `stored` is a 64-char hex string (SHA-256) rather than a bcrypt hash."""
    if not stored or _BCRYPT_PREFIX.match(stored):
        return False
    return len(stored) == 64 and all(c in "0123456789abcdef" for c in stored.lower())


def generate_api_token() -> str:
    """Cryptographically random 32-byte URL-safe token (~43 chars)."""
    return secrets.token_urlsafe(32)


def hash_api_token(raw: str) -> str:
    """SHA-256 hex of the raw token — what we store in `tcms_api_tokens.token_hash`.

    We use a plain hash (not bcrypt) because:
    1. The raw token is already high-entropy random, so a slow hash buys nothing.
    2. Token lookup runs on every authenticated request — needs to be cheap.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
