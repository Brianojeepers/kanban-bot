from dataclasses import dataclass
from typing import Annotated

from pydantic import StringConstraints

from app import board
from app.auth import create_session, hash_password, new_session_key, session_is_valid, session_user_id, verify_password
from app.db import ConflictError, connection


Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


@dataclass(frozen=True)
class User:
    id: int
    username: str


def register(username: str, password: str) -> str:
    """Creates the account with one empty board and returns a session token for it."""
    with connection() as database:
        if database.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone():
            raise ConflictError("That username is taken")
        session_key = new_session_key()
        user_id = database.execute("INSERT INTO users (username, password_hash, session_key) VALUES (?, ?, ?)", (username, hash_password(password), session_key)).lastrowid
        board.create_board(database, user_id, "My first board")
    return create_session(user_id, session_key)


def sign_in(username: str, password: str) -> str | None:
    with connection() as database:
        user = database.execute("SELECT id, password_hash, session_key FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        return None
    return create_session(user["id"], user["session_key"])


def session_user(token: str | None) -> User | None:
    user_id = session_user_id(token)
    if user_id is None:
        return None
    with connection() as database:
        user = database.execute("SELECT id, username, session_key FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not session_is_valid(token, user["id"], user["session_key"]):
        return None
    return User(user["id"], user["username"])


def check_password(user_id: int, password: str) -> bool:
    with connection() as database:
        stored = database.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()["password_hash"]
    return verify_password(password, stored)


def change_password(user_id: int, password: str) -> str:
    """Rotates the session key, which signs out every other session, and returns a new token for this one."""
    session_key = new_session_key()
    with connection() as database:
        database.execute("UPDATE users SET password_hash = ?, session_key = ? WHERE id = ?", (hash_password(password), session_key, user_id))
    return create_session(user_id, session_key)


def delete_account(user_id: int) -> None:
    with connection() as database:
        for row in database.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchall():
            board.purge_board(database, row["id"])
        database.execute("DELETE FROM board_members WHERE user_id = ?", (user_id,))
        database.execute("UPDATE cards SET assignee_id = NULL WHERE assignee_id = ?", (user_id,))
        for table in ("messages", "comments", "activity"):
            database.execute(f"UPDATE {table} SET user_id = NULL WHERE user_id = ?", (user_id,))
        database.execute("DELETE FROM users WHERE id = ?", (user_id,))
