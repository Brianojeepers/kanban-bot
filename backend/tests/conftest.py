import os

os.environ.setdefault("SESSION_SECRET", "test-secret")

import pytest  # noqa: E402

from app import db  # noqa: E402
from app.rate_limit import chat_limiter, daily_chat_limiter, login_limiter, registration_limiter  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "pm.db"))
    # The test client only runs the startup lifespan inside a `with` block, so create the schema here.
    db.initialize()
    login_limiter.calls.clear()
    registration_limiter.calls.clear()
    chat_limiter.calls.clear()
    daily_chat_limiter.calls.clear()
