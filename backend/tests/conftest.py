import os

import pytest

from app import board

os.environ.setdefault("SESSION_SECRET", "test-secret")


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "pm.db"))
    # The test client only runs the startup lifespan inside a `with` block, so create the schema here.
    board.initialize()
