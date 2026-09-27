import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.auth import hash_password, new_session_key


DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
DEMO_CARDS = [
    ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    ("card-2", "col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ("card-3", "col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ("card-4", "col-in-progress", "Refine status language", "Standardize column labels and tone across the board."),
    ("card-5", "col-in-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ("card-6", "col-review", "QA micro-interactions", "Verify hover, focus, and loading states."),
    ("card-7", "col-done", "Ship marketing page", "Final copy approved and asset pack delivered."),
    ("card-8", "col-done", "Close onboarding sprint", "Document release notes and share internally."),
]

# Version 1 schema. Later versions are applied as migrations below, so new and existing databases take the same path.
SCHEMA = """
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS boards (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS columns (id TEXT PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id), title TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, column_id TEXT NOT NULL REFERENCES columns(id), title TEXT NOT NULL, details TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
"""

# Version 2: accounts with passwords, several boards per user, and card priority and due date.
# SQLite cannot drop the UNIQUE constraint on boards.user_id, so that table is rebuilt.
MIGRATION_2 = """
    BEGIN;
    ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN session_key TEXT NOT NULL DEFAULT '';
    CREATE TABLE boards_new (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL);
    INSERT INTO boards_new (id, user_id, name) SELECT id, user_id, 'Product roadmap' FROM boards;
    DROP TABLE boards;
    ALTER TABLE boards_new RENAME TO boards;
    CREATE INDEX boards_user_id ON boards (user_id);
    ALTER TABLE cards ADD COLUMN priority TEXT;
    ALTER TABLE cards ADD COLUMN due_date TEXT;
    PRAGMA user_version = 2;
    COMMIT;
"""

# Version 3: board sharing. The owner stays boards.user_id; other users with access are members.
MIGRATION_3 = """
    BEGIN;
    CREATE TABLE board_members (board_id INTEGER NOT NULL REFERENCES boards(id), user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY (board_id, user_id));
    CREATE INDEX board_members_user_id ON board_members (user_id);
    ALTER TABLE cards ADD COLUMN assignee_id INTEGER REFERENCES users(id);
    PRAGMA user_version = 3;
    COMMIT;
"""

# Version 4: who sent each chat message, now that several people can share a board's chat. Before sharing, every
# user message on a board came from its owner.
MIGRATION_4 = """
    BEGIN;
    ALTER TABLE messages ADD COLUMN user_id INTEGER REFERENCES users(id);
    UPDATE messages SET user_id = (SELECT user_id FROM boards WHERE boards.id = messages.board_id) WHERE role = 'user';
    PRAGMA user_version = 4;
    COMMIT;
"""

# Version 5: card comments and a per-board activity log.
MIGRATION_5 = """
    BEGIN;
    CREATE TABLE comments (id INTEGER PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id), user_id INTEGER REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX comments_card_id ON comments (card_id);
    CREATE TABLE activity (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id), user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX activity_board_id ON activity (board_id);
    PRAGMA user_version = 5;
    COMMIT;
"""

# Version 6: card labels. A card's labels are unique ignoring case.
MIGRATION_6 = """
    BEGIN;
    CREATE TABLE card_labels (card_id TEXT NOT NULL REFERENCES cards(id), label TEXT NOT NULL COLLATE NOCASE, PRIMARY KEY (card_id, label));
    PRAGMA user_version = 6;
    COMMIT;
"""

# Version 7: card checklists and archived cards. An archived card keeps its column but leaves the column's
# order (position -1), so active cards stay numbered 0..n-1.
MIGRATION_7 = """
    BEGIN;
    CREATE TABLE checklist_items (id INTEGER PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id), text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    CREATE INDEX checklist_items_card_id ON checklist_items (card_id);
    ALTER TABLE cards ADD COLUMN archived_at TEXT;
    PRAGMA user_version = 7;
    COMMIT;
"""


class NotFoundError(ValueError):
    pass


class ForbiddenError(ValueError):
    pass


class ConflictError(ValueError):
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
        # The boards rebuild needs foreign key checks off; the pragma only applies outside a transaction.
        database.execute("PRAGMA foreign_keys = OFF")
        database.executescript(SCHEMA)
        version = database.execute("PRAGMA user_version").fetchone()[0]
        if version < 1:
            # Earlier versions left gaps in card positions; renumber each column to 0..n-1 once.
            database.execute("""
                UPDATE cards SET position = ranked.new_position FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY position, id) - 1 AS new_position FROM cards
                ) AS ranked WHERE cards.id = ranked.id
            """)
            database.execute("PRAGMA user_version = 1")
            database.commit()
        if version < 2:
            database.executescript(MIGRATION_2)
            # Version 1 had only the fixed demo account, which signed in with the demo password.
            for user in database.execute("SELECT id FROM users WHERE password_hash = ''").fetchall():
                database.execute("UPDATE users SET password_hash = ?, session_key = ? WHERE id = ?", (hash_password(DEMO_PASSWORD), new_session_key(), user["id"]))
        if version < 3:
            database.executescript(MIGRATION_3)
        if version < 4:
            database.executescript(MIGRATION_4)
        if version < 5:
            database.executescript(MIGRATION_5)
        if version < 6:
            database.executescript(MIGRATION_6)
        if version < 7:
            database.executescript(MIGRATION_7)
        if not database.execute("SELECT 1 FROM users").fetchone():
            _seed_demo(database)


def _seed_demo(database: sqlite3.Connection) -> None:
    user_id = database.execute(
        "INSERT INTO users (username, password_hash, session_key) VALUES (?, ?, ?)", (DEMO_USERNAME, hash_password(DEMO_PASSWORD), new_session_key())
    ).lastrowid
    board_id = database.execute("INSERT INTO boards (user_id, name) VALUES (?, 'Product roadmap')", (user_id,)).lastrowid
    # Fixed ids are safe here: the demo board is seeded once, into an empty database.
    database.executemany(
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        [(f"col-{title.lower().replace(' ', '-')}", board_id, title, position) for position, title in enumerate(DEFAULT_COLUMNS)],
    )
    database.executemany(
        "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, (SELECT COUNT(*) FROM cards WHERE column_id = ?))",
        [(card_id, column_id, title, details, column_id) for card_id, column_id, title, details in DEMO_CARDS],
    )
