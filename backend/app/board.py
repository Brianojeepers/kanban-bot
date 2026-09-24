import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from pydantic import StringConstraints


DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
DEFAULT_CARDS = [
    ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    ("card-2", "col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ("card-3", "col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ("card-4", "col-in-progress", "Refine status language", "Standardize column labels and tone across the board."),
    ("card-5", "col-in-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ("card-6", "col-review", "QA micro-interactions", "Verify hover, focus, and loading states."),
    ("card-7", "col-done", "Ship marketing page", "Final copy approved and asset pack delivered."),
    ("card-8", "col-done", "Close onboarding sprint", "Document release notes and share internally."),
]

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class NotFoundError(ValueError):
    pass


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    database_path = Path(os.environ.get("DATABASE_PATH", "/data/pm.db"))
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(database_path)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA foreign_keys = ON")
    try:
        with database:
            yield database
    finally:
        database.close()


def initialize() -> None:
    with connection() as database:
        database.executescript("""
            CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL);
            CREATE TABLE IF NOT EXISTS boards (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id));
            CREATE TABLE IF NOT EXISTS columns (id TEXT PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id), title TEXT NOT NULL, position INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, column_id TEXT NOT NULL REFERENCES columns(id), title TEXT NOT NULL, details TEXT NOT NULL, position INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)
        database.execute("INSERT OR IGNORE INTO users (username) VALUES ('user')")
        user_id = database.execute("SELECT id FROM users WHERE username = 'user'").fetchone()["id"]
        database.execute("INSERT OR IGNORE INTO boards (user_id) VALUES (?)", (user_id,))
        board_id = database.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()["id"]
        if not database.execute("SELECT 1 FROM columns WHERE board_id = ?", (board_id,)).fetchone():
            database.executemany(
                "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                [(f"col-{title.lower().replace(' ', '-')}", board_id, title, position) for position, title in enumerate(DEFAULT_COLUMNS)],
            )
            database.executemany(
                "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, (SELECT COUNT(*) FROM cards WHERE column_id = ?))",
                [(card_id, column_id, title, details, column_id) for card_id, column_id, title, details in DEFAULT_CARDS],
            )
        if database.execute("PRAGMA user_version").fetchone()[0] < 1:
            # Earlier versions left gaps in card positions; renumber each column to 0..n-1 once.
            database.execute("""
                UPDATE cards SET position = ranked.new_position FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY position, id) - 1 AS new_position FROM cards
                ) AS ranked WHERE cards.id = ranked.id
            """)
            database.execute("PRAGMA user_version = 1")


def _board_id(database: sqlite3.Connection, username: str) -> int:
    return database.execute("SELECT boards.id FROM boards JOIN users ON users.id = boards.user_id WHERE users.username = ?", (username,)).fetchone()["id"]


def _require_column(database: sqlite3.Connection, username: str, column_id: str) -> None:
    if not database.execute("SELECT 1 FROM columns WHERE id = ? AND board_id = ?", (column_id, _board_id(database, username))).fetchone():
        raise NotFoundError(f"Column {column_id} does not exist")


def _require_card(database: sqlite3.Connection, username: str, card_id: str) -> sqlite3.Row:
    card = database.execute(
        "SELECT cards.column_id, cards.title, cards.details, cards.position FROM cards JOIN columns ON columns.id = cards.column_id WHERE cards.id = ? AND columns.board_id = ?",
        (card_id, _board_id(database, username)),
    ).fetchone()
    if not card:
        raise NotFoundError(f"Card {card_id} does not exist")
    return card


def board(username: str) -> dict:
    initialize()
    with connection() as database:
        board_id = _board_id(database, username)
        columns = [dict(row) for row in database.execute("SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,))]
        cards = {row["id"]: {"id": row["id"], "title": row["title"], "details": row["details"]} for row in database.execute("SELECT cards.* FROM cards JOIN columns ON columns.id = cards.column_id WHERE columns.board_id = ? ORDER BY cards.position", (board_id,))}
        for column in columns:
            column["cardIds"] = [row["id"] for row in database.execute("SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column["id"],))]
        return {"columns": columns, "cards": cards}


def rename_column(database: sqlite3.Connection, username: str, column_id: str, title: str) -> None:
    _require_column(database, username, column_id)
    database.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


def create_card(database: sqlite3.Connection, username: str, column_id: str, title: str, details: str) -> None:
    _require_column(database, username, column_id)
    position = database.execute("SELECT COUNT(*) FROM cards WHERE column_id = ?", (column_id,)).fetchone()[0]
    database.execute("INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)", (f"card-{uuid4().hex}", column_id, title, details or "No details yet.", position))


def update_card(database: sqlite3.Connection, username: str, card_id: str, title: str, details: str) -> None:
    _require_card(database, username, card_id)
    database.execute("UPDATE cards SET title = ?, details = ? WHERE id = ?", (title, details, card_id))


def delete_card(database: sqlite3.Connection, username: str, card_id: str) -> None:
    card = _require_card(database, username, card_id)
    database.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    database.execute("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", (card["column_id"], card["position"]))


def move_card(database: sqlite3.Connection, username: str, card_id: str, column_id: str, position: int) -> None:
    card = _require_card(database, username, card_id)
    _require_column(database, username, column_id)

    source_column_id = card["column_id"]
    database.execute("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", (source_column_id, card["position"]))
    database.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    destination_count = database.execute("SELECT COUNT(*) FROM cards WHERE column_id = ?", (column_id,)).fetchone()[0]
    destination_position = max(0, min(position, destination_count))
    database.execute("UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?", (column_id, destination_position))
    database.execute("INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)", (card_id, column_id, card["title"], card["details"], destination_position))


def messages(username: str) -> list[dict[str, str]]:
    initialize()
    with connection() as database:
        rows = database.execute("SELECT role, content FROM messages WHERE board_id = ? ORDER BY created_at, id", (_board_id(database, username),)).fetchall()
    return [dict(row) for row in rows]


def add_message(username: str, role: str, content: str) -> None:
    initialize()
    with connection() as database:
        database.execute("INSERT INTO messages (board_id, role, content) VALUES (?, ?, ?)", (_board_id(database, username), role, content))
