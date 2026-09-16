import hashlib
import hmac
import os


COOKIE_NAME = "pm_session"
USERNAME = "user"
PASSWORD = "password"


def _signature(username: str) -> str:
    secret = os.environ.get("SESSION_SECRET", "local-development-secret")
    return hmac.new(secret.encode(), username.encode(), hashlib.sha256).hexdigest()


def create_session(username: str) -> str:
    return f"{username}.{_signature(username)}"


def is_valid_session(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    username, signature = token.split(".", maxsplit=1)
    return username == USERNAME and hmac.compare_digest(signature, _signature(username))