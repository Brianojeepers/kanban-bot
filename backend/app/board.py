import sqlite3
from datetime import date
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field, StringConstraints

from app.db import DEFAULT_COLUMNS, ConflictError, ForbiddenError, NotFoundError, connection


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(max_length=2000)]
BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Priority = Literal["low", "medium", "high"]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Labels = Annotated[list[Label], Field(max_length=5)]
CARD_FIELDS = ("title", "details", "priority", "due_date", "assignee_id")
ISO8601_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def boards(user_id: int) -> list[dict]:
    """The user's own boards first, then the boards shared with them."""
    with connection() as database:
        return [dict(row) for row in database.execute(
            """SELECT boards.id, boards.name, users.username AS owner FROM boards JOIN users ON users.id = boards.user_id
               WHERE boards.user_id = ? OR boards.id IN (SELECT board_id FROM board_members WHERE user_id = ?)
               ORDER BY boards.user_id != ?, boards.id""",
            (user_id, user_id, user_id),
        )]


def require_board(database: sqlite3.Connection, user_id: int, board_id: int) -> None:
    """Every board read and change goes through a board id checked here: only its owner and members get past, and to
    anyone else the board reads as not found."""
    if not database.execute(
        "SELECT 1 FROM boards WHERE id = ? AND (user_id = ? OR id IN (SELECT board_id FROM board_members WHERE user_id = ?))", (board_id, user_id, user_id)
    ).fetchone():
        raise NotFoundError(f"Board {board_id} does not exist")


def require_owner(database: sqlite3.Connection, user_id: int, board_id: int) -> None:
    if not database.execute("SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)).fetchone():
        raise ForbiddenError("Only the board's owner can do that")


def _member_id(database: sqlite3.Connection, board_id: int, username: str) -> int:
    """The id of the board's owner or member with this username."""
    row = database.execute(
        """SELECT users.id FROM users WHERE username = ? COLLATE NOCASE AND (
               users.id = (SELECT user_id FROM boards WHERE id = ?) OR users.id IN (SELECT user_id FROM board_members WHERE board_id = ?))""",
        (username, board_id, board_id),
    ).fetchone()
    if not row:
        raise NotFoundError(f"{username} is not a member of this board")
    return row["id"]


def add_member(database: sqlite3.Connection, board_id: int, username: str) -> str:
    """Shares the board with the user and returns their username as stored."""
    user = database.execute("SELECT id, username FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
    if not user:
        raise NotFoundError(f"There is no user called {username}")
    if database.execute(
        "SELECT 1 FROM boards WHERE id = ? AND (user_id = ? OR id IN (SELECT board_id FROM board_members WHERE user_id = ?))", (board_id, user["id"], user["id"])
    ).fetchone():
        raise ConflictError(f"{username} can already open this board")
    database.execute("INSERT INTO board_members (board_id, user_id) VALUES (?, ?)", (board_id, user["id"]))
    return user["username"]


def remove_member(database: sqlite3.Connection, board_id: int, username: str) -> str:
    """Removes a member (never the owner), unassigns their cards on this board, and returns their username as stored."""
    row = database.execute(
        "SELECT user_id, username FROM board_members JOIN users ON users.id = board_members.user_id WHERE board_id = ? AND username = ? COLLATE NOCASE", (board_id, username)
    ).fetchone()
    if not row:
        raise NotFoundError(f"{username} is not a member of this board")
    database.execute("DELETE FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, row["user_id"]))
    database.execute("UPDATE cards SET assignee_id = NULL WHERE assignee_id = ? AND column_id IN (SELECT id FROM columns WHERE board_id = ?)", (row["user_id"], board_id))
    return row["username"]


def create_board(database: sqlite3.Connection, user_id: int, name: str) -> int:
    board_id = database.execute("INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_id, name)).lastrowid
    database.executemany(
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        [(f"col-{uuid4().hex}", board_id, title, position) for position, title in enumerate(DEFAULT_COLUMNS)],
    )
    return board_id


def rename_board(database: sqlite3.Connection, board_id: int, name: str) -> str:
    database.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
    return f'renamed the board to "{name}"'


def delete_board(database: sqlite3.Connection, user_id: int, board_id: int) -> None:
    require_owner(database, user_id, board_id)
    if database.execute("SELECT COUNT(*) FROM boards WHERE user_id = ?", (user_id,)).fetchone()[0] == 1:
        raise ConflictError("You need at least one board of your own")
    purge_board(database, board_id)


def purge_board(database: sqlite3.Connection, board_id: int) -> None:
    database.execute("DELETE FROM card_labels WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ?)", (board_id,))
    database.execute("DELETE FROM checklist_items WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ?)", (board_id,))
    database.execute("DELETE FROM comments WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ?)", (board_id,))
    database.execute("DELETE FROM activity WHERE board_id = ?", (board_id,))
    database.execute("DELETE FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)", (board_id,))
    database.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
    database.execute("DELETE FROM messages WHERE board_id = ?", (board_id,))
    database.execute("DELETE FROM board_members WHERE board_id = ?", (board_id,))
    database.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def _require_column(database: sqlite3.Connection, board_id: int, column_id: str) -> str:
    """The column's title, if it is on the board."""
    column = database.execute("SELECT title FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)).fetchone()
    if not column:
        raise NotFoundError(f"Column {column_id} does not exist")
    return column["title"]


def _require_card(database: sqlite3.Connection, board_id: int, card_id: str, archived: bool | None = False) -> sqlite3.Row:
    """The card, if it is on the board and active (or archived, or either when `archived` is None)."""
    card = database.execute(
        "SELECT cards.* FROM cards JOIN columns ON columns.id = cards.column_id WHERE cards.id = ? AND columns.board_id = ? AND (? IS NULL OR (cards.archived_at IS NOT NULL) = ?)",
        (card_id, board_id, archived, archived),
    ).fetchone()
    if not card:
        raise NotFoundError(f"Card {card_id} does not exist")
    return card


def board(board_id: int) -> dict:
    with connection() as database:
        board_row = database.execute("SELECT boards.name, users.username AS owner FROM boards JOIN users ON users.id = boards.user_id WHERE boards.id = ?", (board_id,)).fetchone()
        members = [row["username"] for row in database.execute(
            "SELECT username FROM users JOIN board_members ON board_members.user_id = users.id WHERE board_id = ? ORDER BY username COLLATE NOCASE", (board_id,)
        )]
        columns = [dict(row) for row in database.execute("SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,))]
        rows = database.execute(
            """SELECT cards.*, users.username AS assignee FROM cards JOIN columns ON columns.id = cards.column_id LEFT JOIN users ON users.id = cards.assignee_id
               WHERE columns.board_id = ? AND cards.archived_at IS NULL ORDER BY cards.position""",
            (board_id,),
        ).fetchall()
        for column in columns:
            column["cardIds"] = [row["id"] for row in rows if row["column_id"] == column["id"]]
        labels: dict[str, list[str]] = {}
        for row in database.execute(
            "SELECT card_id, label FROM card_labels WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ? AND archived_at IS NULL) ORDER BY label COLLATE NOCASE",
            (board_id,),
        ):
            labels.setdefault(row["card_id"], []).append(row["label"])
        checklists = {row["card_id"]: {"done": row["done"], "total": row["total"]} for row in database.execute(
            "SELECT card_id, SUM(done) AS done, COUNT(*) AS total FROM checklist_items WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ?) GROUP BY card_id",
            (board_id,),
        )}
        comment_counts = dict(database.execute(
            "SELECT card_id, COUNT(*) FROM comments WHERE card_id IN (SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id WHERE board_id = ?) GROUP BY card_id", (board_id,)
        ).fetchall())
        cards = {
            row["id"]: {
                "id": row["id"], "title": row["title"], "details": row["details"], "priority": row["priority"], "dueDate": row["due_date"],
                "assignee": row["assignee"], "labels": labels.get(row["id"], []), "comments": comment_counts.get(row["id"], 0),
                "checklist": checklists.get(row["id"], {"done": 0, "total": 0}),
            }
            for row in rows
        }
        # The owner comes first in members, so every member list names everyone who can open the board.
        board_labels = sorted({label.lower(): label for card_labels in labels.values() for label in card_labels}.values(), key=str.lower)
        return {
            "id": board_id, "name": board_row["name"], "owner": board_row["owner"], "members": [board_row["owner"], *members],
            "labels": board_labels, "columns": columns, "cards": cards,
        }


def rename_column(database: sqlite3.Connection, board_id: int, column_id: str, title: str) -> str:
    old_title = _require_column(database, board_id, column_id)
    database.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    return f'renamed column "{old_title}" to "{title}"'


def create_card(
    database: sqlite3.Connection, board_id: int, column_id: str, title: str, details: str,
    priority: Priority | None = None, due_date: date | None = None, assignee: str | None = None, labels: list[str] = (),
) -> str:
    column_title = _require_column(database, board_id, column_id)
    assignee_id = assignee and _member_id(database, board_id, assignee)
    position = _active_count(database, column_id)
    card_id = f"card-{uuid4().hex}"
    database.execute(
        "INSERT INTO cards (id, column_id, title, details, position, priority, due_date, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (card_id, column_id, title, details or "No details yet.", position, priority, due_date and due_date.isoformat(), assignee_id),
    )
    _set_labels(database, card_id, labels)
    return f'added "{title}" to {column_title}'


def update_card(database: sqlite3.Connection, board_id: int, card_id: str, changes: dict) -> str:
    """Changes only the given fields, so a partial edit never erases the others. The assignee is a member's username.
    Returns an empty description when nothing was given to change."""
    card = _require_card(database, board_id, card_id)
    if "assignee" in changes:
        changes = {**changes, "assignee_id": changes["assignee"] and _member_id(database, board_id, changes["assignee"])}
    fields = [field for field in CARD_FIELDS if field in changes]
    if not fields and "labels" not in changes:
        return ""
    if fields:
        values = [changes[field].isoformat() if isinstance(changes[field], date) else changes[field] for field in fields]
        database.execute(f"UPDATE cards SET {', '.join(f'{field} = ?' for field in fields)} WHERE id = ?", (*values, card_id))
    if "labels" in changes:
        database.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
        _set_labels(database, card_id, changes["labels"])
    return f'edited "{changes.get("title") or card["title"]}"'


def _set_labels(database: sqlite3.Connection, card_id: str, labels: list[str]) -> None:
    """Adds the labels, keeping the first spelling of any that differ only in case."""
    database.executemany("INSERT OR IGNORE INTO card_labels (card_id, label) VALUES (?, ?)", [(card_id, label) for label in labels])


def _active_count(database: sqlite3.Connection, column_id: str, excluding: str = "") -> int:
    return database.execute("SELECT COUNT(*) FROM cards WHERE column_id = ? AND archived_at IS NULL AND id != ?", (column_id, excluding)).fetchone()[0]


def delete_card(database: sqlite3.Connection, board_id: int, card_id: str, archived: bool | None = False) -> str:
    """Deletes an active card, or with `archived=None` one that may be archived, for good."""
    card = _require_card(database, board_id, card_id, archived)
    for table in ("comments", "card_labels", "checklist_items"):
        database.execute(f"DELETE FROM {table} WHERE card_id = ?", (card_id,))
    database.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    if card["archived_at"] is None:
        database.execute("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", (card["column_id"], card["position"]))
    return f'deleted "{card["title"]}"'


def archive_card(database: sqlite3.Connection, board_id: int, card_id: str) -> str:
    card = _require_card(database, board_id, card_id)
    database.execute("UPDATE cards SET archived_at = CURRENT_TIMESTAMP, position = -1 WHERE id = ?", (card_id,))
    database.execute("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", (card["column_id"], card["position"]))
    return f'archived "{card["title"]}"'


def restore_card(database: sqlite3.Connection, board_id: int, card_id: str) -> str:
    """Puts an archived card back at the end of its column."""
    card = _require_card(database, board_id, card_id, archived=True)
    database.execute("UPDATE cards SET archived_at = NULL, position = ? WHERE id = ?", (_active_count(database, card["column_id"]), card_id))
    column_title = database.execute("SELECT title FROM columns WHERE id = ?", (card["column_id"],)).fetchone()["title"]
    return f'restored "{card["title"]}" to {column_title}'


def archived_cards(board_id: int) -> list[dict]:
    """The board's archived cards, most recently archived first."""
    with connection() as database:
        rows = database.execute(
            """SELECT cards.id, cards.title, columns.title AS "column", strftime('%Y-%m-%dT%H:%M:%SZ', cards.archived_at) AS archivedAt
               FROM cards JOIN columns ON columns.id = cards.column_id WHERE columns.board_id = ? AND cards.archived_at IS NOT NULL
               ORDER BY cards.archived_at DESC, cards.rowid DESC""",
            (board_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def move_card(database: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int) -> str:
    card = _require_card(database, board_id, card_id)
    column_title = _require_column(database, board_id, column_id)

    database.execute("UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", (card["column_id"], card["position"]))
    destination_count = _active_count(database, column_id, excluding=card_id)
    destination_position = max(0, min(position, destination_count))
    database.execute("UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND id != ?", (column_id, destination_position, card_id))
    database.execute("UPDATE cards SET column_id = ?, position = ? WHERE id = ?", (column_id, destination_position, card_id))
    return f'reordered "{card["title"]}" in {column_title}' if column_id == card["column_id"] else f'moved "{card["title"]}" to {column_title}'


def messages(board_id: int) -> list[dict]:
    """The board's chat, each user message with its author's username (None once their account is deleted)."""
    with connection() as database:
        rows = database.execute(
            "SELECT role, content, username AS author FROM messages LEFT JOIN users ON users.id = messages.user_id WHERE board_id = ? ORDER BY created_at, messages.id",
            (board_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_message(board_id: int, role: str, content: str, user_id: int | None = None) -> None:
    with connection() as database:
        database.execute("INSERT INTO messages (board_id, role, content, user_id) VALUES (?, ?, ?, ?)", (board_id, role, content, user_id))


def comments(board_id: int, card_id: str) -> list[dict]:
    with connection() as database:
        _require_card(database, board_id, card_id)
        rows = database.execute(
            """SELECT comments.id, username AS author, content, strftime('%Y-%m-%dT%H:%M:%SZ', comments.created_at) AS createdAt
               FROM comments LEFT JOIN users ON users.id = comments.user_id WHERE card_id = ? ORDER BY comments.id""",
            (card_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_comment(database: sqlite3.Connection, board_id: int, card_id: str, user_id: int, content: str) -> str:
    card = _require_card(database, board_id, card_id)
    database.execute("INSERT INTO comments (card_id, user_id, content) VALUES (?, ?, ?)", (card_id, user_id, content))
    return f'commented on "{card["title"]}"'


def delete_comment(database: sqlite3.Connection, board_id: int, card_id: str, user_id: int, comment_id: int) -> None:
    """Only a comment's author can delete it."""
    _require_card(database, board_id, card_id)
    comment = database.execute("SELECT user_id FROM comments WHERE id = ? AND card_id = ?", (comment_id, card_id)).fetchone()
    if not comment:
        raise NotFoundError(f"Comment {comment_id} does not exist")
    if comment["user_id"] != user_id:
        raise ForbiddenError("You can only delete your own comments")
    database.execute("DELETE FROM comments WHERE id = ?", (comment_id,))


def record(database: sqlite3.Connection, board_id: int, user_id: int, action: str) -> None:
    """Adds an entry to the board's activity log; an empty action (nothing changed) is not recorded."""
    if action:
        database.execute("INSERT INTO activity (board_id, user_id, action) VALUES (?, ?, ?)", (board_id, user_id, action))


def activity(board_id: int, limit: int = 50) -> list[dict]:
    """The most recent entries first, each with its actor's username (None once their account is deleted)."""
    with connection() as database:
        rows = database.execute(
            """SELECT activity.id, username AS actor, action, strftime('%Y-%m-%dT%H:%M:%SZ', activity.created_at) AS createdAt
               FROM activity LEFT JOIN users ON users.id = activity.user_id WHERE board_id = ? ORDER BY activity.id DESC LIMIT ?""",
            (board_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def assigned_cards(user_id: int) -> list[dict]:
    """The user's assigned cards across all boards, due soonest and most urgent first; done cards (in a board's
    last column) come after the open ones. An assignee can always open the card's board: removing a member
    unassigns their cards."""
    with connection() as database:
        rows = database.execute(
            f"""SELECT boards.id AS boardId, boards.name AS boardName, cards.id, cards.title, columns.title AS "column",
                       columns.position = {len(DEFAULT_COLUMNS) - 1} AS done, cards.priority, cards.due_date AS dueDate
                FROM cards JOIN columns ON columns.id = cards.column_id JOIN boards ON boards.id = columns.board_id
                WHERE cards.assignee_id = ? AND cards.archived_at IS NULL
                ORDER BY done, cards.due_date IS NULL, cards.due_date,
                         CASE cards.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, boards.id, cards.position""",
            (user_id,),
        ).fetchall()
    return [{**dict(row), "done": bool(row["done"])} for row in rows]


def checklist(board_id: int, card_id: str) -> list[dict]:
    with connection() as database:
        _require_card(database, board_id, card_id)
        rows = database.execute("SELECT id, text, done FROM checklist_items WHERE card_id = ? ORDER BY position, id", (card_id,)).fetchall()
    return [{**dict(row), "done": bool(row["done"])} for row in rows]


def add_checklist_item(database: sqlite3.Connection, board_id: int, card_id: str, text: str) -> str:
    card = _require_card(database, board_id, card_id)
    database.execute(
        "INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM checklist_items WHERE card_id = ?))",
        (card_id, text, card_id),
    )
    return f'added "{text}" to the checklist of "{card["title"]}"'


def _require_item(database: sqlite3.Connection, board_id: int, card_id: str, item_id: int) -> tuple[sqlite3.Row, sqlite3.Row]:
    card = _require_card(database, board_id, card_id)
    item = database.execute("SELECT * FROM checklist_items WHERE id = ? AND card_id = ?", (item_id, card_id)).fetchone()
    if not item:
        raise NotFoundError(f"Checklist item {item_id} does not exist")
    return card, item


def update_checklist_item(database: sqlite3.Connection, board_id: int, card_id: str, item_id: int, changes: dict) -> str:
    """Changes the item's text and/or done state; ticking or unticking is what the activity log records."""
    card, item = _require_item(database, board_id, card_id, item_id)
    text = changes.get("text", item["text"])
    done = changes.get("done", bool(item["done"]))
    database.execute("UPDATE checklist_items SET text = ?, done = ? WHERE id = ?", (text, done, item_id))
    if done != bool(item["done"]):
        return f'{"checked" if done else "unchecked"} "{text}" on "{card["title"]}"'
    return ""


def delete_checklist_item(database: sqlite3.Connection, board_id: int, card_id: str, item_id: int) -> str:
    card, item = _require_item(database, board_id, card_id, item_id)
    database.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))
    return f'removed "{item["text"]}" from the checklist of "{card["title"]}"'
