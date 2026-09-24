import hashlib
import hmac
import os


COOKIE_NAME = "pm_session"
USERNAME = "user"
PASSWORD = "password"
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET is not set. Add it to .env, for example the output of: python -c 'import secrets; print(secrets.token_hex(32))'")


def _signature(username: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), username.encode(), hashlib.sha256).hexdigest()


def create_session(username: str) -> str:
    return f"{username}.{_signature(username)}"


def is_valid_session(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    username, signature = token.split(".", maxsplit=1)
    return username == USERNAME and hmac.compare_digest(signature, _signature(username))