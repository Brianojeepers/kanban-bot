import os

import pytest

os.environ.setdefault("SESSION_SECRET", "test-secret")


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "pm.db"))
