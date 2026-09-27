import hashlib
import hmac
import os
import secrets


COOKIE_NAME = "pm_session"
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET is not set. Add it to .env, for example the output of: python -c 'import secrets; print(secrets.token_hex(32))'")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    return hmac.compare_digest(hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex(), digest)


def new_session_key() -> str:
    return secrets.token_hex(16)


def _signature(user_id: int, session_key: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), f"{user_id}.{session_key}".encode(), hashlib.sha256).hexdigest()


def create_session(user_id: int, session_key: str) -> str:
    """The token names the user; the signature covers their current session key, so rotating the key signs out every session."""
    return f"{user_id}.{_signature(user_id, session_key)}"


def session_user_id(token: str | None) -> int | None:
    if not token or "." not in token:
        return None
    user_id, _ = token.split(".", maxsplit=1)
    return int(user_id) if user_id.isdigit() else None


def session_is_valid(token: str, user_id: int, session_key: str) -> bool:
    return hmac.compare_digest(token, create_session(user_id, session_key))
