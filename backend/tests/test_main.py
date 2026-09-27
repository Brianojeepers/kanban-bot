import json
import os
import re
import sqlite3
import subprocess
import sys

import pytest

from fastapi.testclient import TestClient

from app.main import app
from app import board, chat, db
from app.rate_limit import daily_chat_limiter, describe_wait


client = TestClient(app)
# The seeded demo account's board.
BOARD = "/api/boards/1"


def signed_in_client() -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": "user", "password": "password"})
    return signed_in


def test_health_check_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_the_static_index_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<title>Project Management MVP</title>" in response.text


def test_startup_creates_the_database(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "fresh.db"))
    with TestClient(app) as started:
        started.post("/api/login", json={"username": "user", "password": "password"})
        assert started.post(f"{BOARD}/columns/col-done/cards", json={"title": "First write"}).status_code == 200


def test_login_creates_a_valid_session() -> None:
    response = client.post("/api/login", json={"username": "user", "password": "password"})

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/api/session").json() == {"username": "user"}


def test_login_rejects_invalid_credentials() -> None:
    response = TestClient(app).post("/api/login", json={"username": "user", "password": "wrong"})

    assert response.status_code == 401


def test_session_rejects_invalid_cookie() -> None:
    response = TestClient(app).get("/api/session", cookies={"pm_session": "invalid"})

    assert response.status_code == 401


def test_app_refuses_to_start_without_a_session_secret() -> None:
    environment = {key: value for key, value in os.environ.items() if key != "SESSION_SECRET"}
    result = subprocess.run([sys.executable, "-c", "import app.main"], env=environment, capture_output=True, text=True)

    assert result.returncode != 0
    assert "SESSION_SECRET is not set" in result.stderr


def test_logout_clears_the_session_cookie() -> None:
    response = client.post("/api/logout")

    assert response.status_code == 200
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_board_requires_an_authenticated_session() -> None:
    response = TestClient(app).get(BOARD)

    assert response.status_code == 401


def test_board_seeds_five_fixed_columns() -> None:
    response = signed_in_client().get(BOARD)

    assert response.status_code == 200
    assert [column["title"] for column in response.json()["columns"]] == [
        "Backlog", "Discovery", "In Progress", "Review", "Done"
    ]


def test_board_mutations_persist() -> None:
    board_client = signed_in_client()
    board = board_client.get(BOARD).json()
    backlog = board["columns"][0]["id"]

    board = board_client.patch(f"{BOARD}/columns/{backlog}", json={"title": "Ideas"}).json()
    assert board["columns"][0]["title"] == "Ideas"

    board = board_client.post(f"{BOARD}/columns/{backlog}/cards", json={"title": "Plan", "details": "Draft"}).json()
    card_id = next(card_id for card_id, card in board["cards"].items() if card["title"] == "Plan")
    assert board["cards"][card_id] == {"id": card_id, "title": "Plan", "details": "Draft", "priority": None, "dueDate": None, "assignee": None, "labels": [], "comments": 0, "checklist": {"done": 0, "total": 0}}

    board = board_client.patch(f"{BOARD}/cards/{card_id}", json={"title": "Ship", "details": "Ready"}).json()
    assert board["cards"][card_id]["title"] == "Ship"

    review = board["columns"][3]["id"]
    board = board_client.post(f"{BOARD}/cards/{card_id}/move", json={"column_id": review, "position": 0}).json()
    assert card_id in board["columns"][3]["cardIds"]

    board = board_client.delete(f"{BOARD}/cards/{card_id}").json()
    assert card_id not in board["cards"]


def test_oversized_or_blank_input_is_rejected_before_it_is_stored() -> None:
    board_client = signed_in_client()
    before = board_client.get(BOARD).json()

    assert board_client.patch(f"{BOARD}/columns/col-backlog", json={"title": "x" * 201}).status_code == 422
    assert board_client.post(f"{BOARD}/columns/col-backlog/cards", json={"title": "x" * 201}).status_code == 422
    assert board_client.post(f"{BOARD}/columns/col-backlog/cards", json={"title": "Note", "details": "x" * 2001}).status_code == 422
    assert board_client.patch(f"{BOARD}/cards/card-1", json={"title": "Note", "details": "x" * 2001}).status_code == 422
    assert board_client.post(f"{BOARD}/chat", json={"message": "   "}).status_code == 422
    assert board_client.post(f"{BOARD}/chat", json={"message": "x" * 2001}).status_code == 422
    assert board_client.get(BOARD).json() == before


def test_empty_card_details_use_the_default_text() -> None:
    board_client = signed_in_client()
    column_id = board_client.get(BOARD).json()["columns"][0]["id"]
    board = board_client.post(f"{BOARD}/columns/{column_id}/cards", json={"title": "Note"}).json()

    card_id = board["columns"][0]["cardIds"][-1]
    assert board["cards"][card_id]["details"] == "No details yet."


def test_moving_a_card_between_adjacent_columns_never_duplicates_it() -> None:
    board_client = signed_in_client()
    board = board_client.get(BOARD).json()
    backlog, discovery = board["columns"][:2]
    card_id = "card-1"

    moved = board_client.post(f"{BOARD}/cards/{card_id}/move", json={"column_id": discovery["id"], "position": 0}).json()
    assert card_id not in moved["columns"][0]["cardIds"]
    assert moved["columns"][1]["cardIds"].count(card_id) == 1
    assert list(moved["cards"]).count(card_id) == 1

    returned = board_client.post(f"{BOARD}/cards/{card_id}/move", json={"column_id": backlog["id"], "position": 0}).json()
    assert returned["columns"][0]["cardIds"].count(card_id) == 1
    assert card_id not in returned["columns"][1]["cardIds"]


def test_chat_persists_a_mocked_assistant_reply(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"I can help.","operations":[]}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post(f"{BOARD}/chat", json={"message": "What is next?"})

    assert response.status_code == 200
    assert response.json()["response"] == "I can help."
    assert signed_in_client().get(f"{BOARD}/messages").json()[-2:] == [
        {"role": "user", "content": "What is next?", "author": "user"},
        {"role": "assistant", "content": "I can help.", "author": None},
    ]


def test_chat_applies_a_valid_card_operation(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    column_id = signed_in_client().get(BOARD).json()["columns"][0]["id"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": f'{{"response":"Added it.","operations":[{{"action":"create_card","column_id":"{column_id}","title":"AI task"}}]}}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post(f"{BOARD}/chat", json={"message": "Add a task"})

    assert response.status_code == 200
    assert any(card["title"] == "AI task" for card in response.json()["board"]["cards"].values())


def test_chat_rejects_missing_key_and_invalid_operations(monkeypatch) -> None:
    response = signed_in_client().post(f"{BOARD}/chat", json={"message": "Hello"})
    assert response.status_code == 502

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"No","operations":[{"action":"bad"}]}'}}]}
    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    assert signed_in_client().post(f"{BOARD}/chat", json={"message": "Hello"}).status_code == 502


def test_chat_applies_no_operations_when_any_is_invalid(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board_client = signed_in_client()
    before = board_client.get(BOARD).json()
    column_id = before["columns"][0]["id"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": f'{{"response":"Done.","operations":[{{"action":"create_card","column_id":"{column_id}","title":"Partial"}},{{"action":"bad"}}]}}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())

    assert board_client.post(f"{BOARD}/chat", json={"message": "Add a task"}).status_code == 502
    assert board_client.get(BOARD).json() == before


def test_chat_accepts_every_operation_shape_in_the_system_prompt(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    examples = [line for line in chat.SYSTEM_PROMPT.splitlines() if line.startswith('{"action"')]
    filled = [re.sub(r"<0-based[^>]*>", "0", line).replace("<column id>", "col-done").replace("<card id>", "card-1").replace("<title>", "From prompt").replace("<details>", "").replace("<priority>", '"high"').replace("<due date>", '"2026-10-01"').replace("<assignee>", '"user"').replace("<labels>", '["ux"]') for line in examples]
    operations = [json.loads(line) for line in filled]
    assert [operation["action"] for operation in operations] == ["create_card", "edit_card", "move_card", "delete_card"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps({"response": "Done.", "operations": operations})}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post(f"{BOARD}/chat", json={"message": "Use every operation"})

    assert response.status_code == 200
    cards = response.json()["board"]["cards"]
    assert "card-1" not in cards
    created = [card for card in cards.values() if card["title"] == "From prompt"]
    assert len(created) == 1
    assert created[0]["priority"] == "high"
    assert created[0]["dueDate"] == "2026-10-01"
    assert created[0]["assignee"] == "user"
    assert created[0]["labels"] == ["ux"]


def test_deleted_demo_card_stays_deleted() -> None:
    board_client = signed_in_client()
    assert "card-1" in board_client.get(BOARD).json()["cards"]
    board_client.delete(f"{BOARD}/cards/card-1")

    assert "card-1" not in board_client.get(BOARD).json()["cards"]


def column_titles(board_data: dict, column_id: str) -> list[str]:
    column = next(column for column in board_data["columns"] if column["id"] == column_id)
    return [board_data["cards"][card_id]["title"] for card_id in column["cardIds"]]


def test_new_cards_are_added_to_the_bottom_of_seeded_columns() -> None:
    board_client = signed_in_client()
    for column in board_client.get(BOARD).json()["columns"]:
        updated = board_client.post(f"{BOARD}/columns/{column['id']}/cards", json={"title": f"New in {column['id']}"}).json()
        assert column_titles(updated, column["id"])[-1] == f"New in {column['id']}"


def test_card_order_stays_correct_after_deletes() -> None:
    board_client = signed_in_client()
    board_client.get(BOARD)
    for title in ["A", "B"]:
        board_client.post(f"{BOARD}/columns/col-done/cards", json={"title": title})
    board_client.delete(f"{BOARD}/cards/card-7")
    after_add = board_client.post(f"{BOARD}/columns/col-done/cards", json={"title": "C"}).json()
    assert column_titles(after_add, "col-done") == ["Close onboarding sprint", "A", "B", "C"]

    after_move = board_client.post(f"{BOARD}/cards/card-6/move", json={"column_id": "col-done", "position": 1}).json()
    assert column_titles(after_move, "col-done") == ["Close onboarding sprint", "QA micro-interactions", "A", "B", "C"]


def test_a_version_0_database_is_migrated_with_its_data(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "legacy.db"))
    legacy = sqlite3.connect(tmp_path / "legacy.db")
    legacy.executescript(db.SCHEMA + """
        INSERT INTO users (username) VALUES ('user');
        INSERT INTO boards (user_id) VALUES (1);
        INSERT INTO columns VALUES ('col-backlog', 1, 'Ideas', 0), ('col-done', 1, 'Done', 1);
        INSERT INTO cards VALUES ('card-a', 'col-backlog', 'First', 'x', 3), ('card-b', 'col-backlog', 'Second', 'y', 13);
        INSERT INTO messages (board_id, role, content) VALUES (1, 'user', 'Kept');
    """)
    legacy.close()

    db.initialize()
    db.initialize()

    with db.connection() as database:
        assert database.execute("PRAGMA user_version").fetchone()[0] == 7
        assert [row["position"] for row in database.execute("SELECT position FROM cards ORDER BY position")] == [0, 1]
    board_client = signed_in_client()
    assert board_client.get("/api/boards").json() == [{"id": 1, "name": "Product roadmap", "owner": "user"}]
    migrated = board_client.get(BOARD).json()
    assert migrated["columns"][0] == {"id": "col-backlog", "title": "Ideas", "cardIds": ["card-a", "card-b"]}
    assert migrated["cards"]["card-a"] == {"id": "card-a", "title": "First", "details": "x", "priority": None, "dueDate": None, "assignee": None, "labels": [], "comments": 0, "checklist": {"done": 0, "total": 0}}
    assert board_client.get(f"{BOARD}/messages").json() == [{"role": "user", "content": "Kept", "author": "user"}]
    assert board_client.post("/api/boards", json={"name": "Second"}).status_code == 200


MALFORMED_AI_REPLIES = {
    "unknown column": {"response": "ok", "operations": [{"action": "create_card", "column_id": "nope", "title": "x"}]},
    "missing title": {"response": "ok", "operations": [{"action": "create_card", "column_id": "col-done"}]},
    "null details": {"response": "ok", "operations": [{"action": "edit_card", "card_id": "card-1", "title": "x", "details": None}]},
    "reply is a list": [1],
    "operation is a string": {"response": "ok", "operations": ["create_card"]},
    "text position": {"response": "ok", "operations": [{"action": "move_card", "card_id": "card-1", "column_id": "col-done", "position": "top"}]},
    "unknown action": {"response": "ok", "operations": [{"action": "archive_card", "card_id": "card-1"}]},
    "made-up card id after create": {"response": "ok", "operations": [{"action": "create_card", "column_id": "col-done", "title": "Temp"}, {"action": "delete_card", "card_id": "card-temp-1"}]},
    "blank title": {"response": "ok", "operations": [{"action": "create_card", "column_id": "col-done", "title": "  "}]},
    "blank title in edit": {"response": "ok", "operations": [{"action": "edit_card", "card_id": "card-1", "title": " "}]},
    "unknown priority": {"response": "ok", "operations": [{"action": "create_card", "column_id": "col-done", "title": "x", "priority": "urgent"}]},
    "invalid due date": {"response": "ok", "operations": [{"action": "edit_card", "card_id": "card-1", "due_date": "next week"}]},
    "overlong title": {"response": "ok", "operations": [{"action": "create_card", "column_id": "col-done", "title": "x" * 201}]},
}


@pytest.mark.parametrize("reply", MALFORMED_AI_REPLIES.values(), ids=MALFORMED_AI_REPLIES.keys())
def test_chat_rejects_malformed_ai_replies_without_changing_the_board(monkeypatch, reply) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board_client = signed_in_client()
    before = board_client.get(BOARD).json()

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps(reply)}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = board_client.post(f"{BOARD}/chat", json={"message": "Do something"})

    assert response.status_code == 502
    assert "Please try again." in response.json()["detail"]
    assert board_client.get(BOARD).json() == before
    assert board_client.get(f"{BOARD}/messages").json() == []


def test_chat_reports_an_unexpected_provider_response(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"error": {"message": "Rate limited"}}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post(f"{BOARD}/chat", json={"message": "Hello"})

    assert response.status_code == 502
    assert response.json()["detail"] == "The AI service did not respond correctly. Please try again."


@pytest.mark.parametrize(("method", "path", "body"), [
    ("patch", f"{BOARD}/columns/nope", {"title": "x"}),
    ("post", f"{BOARD}/columns/nope/cards", {"title": "x"}),
    ("patch", f"{BOARD}/cards/nope", {"title": "x"}),
    ("delete", f"{BOARD}/cards/nope", None),
    ("post", f"{BOARD}/cards/nope/move", {"column_id": "col-done", "position": 0}),
    ("post", f"{BOARD}/cards/card-1/move", {"column_id": "nope", "position": 0}),
])
def test_unknown_ids_return_not_found_without_changing_the_board(method, path, body) -> None:
    board_client = signed_in_client()
    before = board_client.get(BOARD).json()

    response = board_client.request(method.upper(), path, json=body)

    assert response.status_code == 404
    assert "does not exist" in response.json()["detail"]
    assert board_client.get(BOARD).json() == before


@pytest.mark.parametrize(("method", "path"), [
    ("patch", f"{BOARD}/columns/col-done"),
    ("post", f"{BOARD}/columns/col-done/cards"),
    ("patch", f"{BOARD}/cards/card-1"),
])
@pytest.mark.parametrize("title", ["", "   "])
def test_empty_titles_are_rejected(method, path, title) -> None:
    board_client = signed_in_client()
    before = board_client.get(BOARD).json()

    assert board_client.request(method.upper(), path, json={"title": title}).status_code == 422
    assert board_client.get(BOARD).json() == before


def test_titles_are_saved_trimmed() -> None:
    board_client = signed_in_client()
    board_client.get(BOARD)
    updated = board_client.patch(f"{BOARD}/columns/col-done", json={"title": "  Shipped  "}).json()

    assert updated["columns"][4]["title"] == "Shipped"


def add_other_users_board() -> None:
    with db.connection() as database:
        user_id = database.execute("INSERT INTO users (username, password_hash, session_key) VALUES ('other', 'unused', 'unused')").lastrowid
        board_id = database.execute("INSERT INTO boards (user_id, name) VALUES (?, 'Theirs')", (user_id,)).lastrowid
        database.execute("INSERT INTO columns (id, board_id, title, position) VALUES ('other-col', ?, 'Theirs', 0)", (board_id,))
        database.execute("INSERT INTO cards (id, column_id, title, details, position) VALUES ('other-card', 'other-col', 'Private', 'Secret', 0)")
        database.execute("INSERT INTO messages (board_id, role, content) VALUES (?, 'user', 'Their message')", (board_id,))


def other_users_rows() -> tuple:
    with db.connection() as database:
        return (
            [tuple(row) for row in database.execute("SELECT * FROM columns WHERE id = 'other-col'")],
            [tuple(row) for row in database.execute("SELECT * FROM cards WHERE id = 'other-card'")],
        )


def test_signed_in_user_cannot_see_another_users_board_or_messages() -> None:
    board_client = signed_in_client()
    board_client.get(BOARD)
    add_other_users_board()

    own_board = board_client.get(BOARD).json()
    assert "other-card" not in own_board["cards"]
    assert "other-col" not in [column["id"] for column in own_board["columns"]]
    assert board_client.get(f"{BOARD}/messages").json() == []


@pytest.mark.parametrize(("method", "path", "body"), [
    ("patch", f"{BOARD}/columns/other-col", {"title": "Mine now"}),
    ("post", f"{BOARD}/columns/other-col/cards", {"title": "Planted"}),
    ("patch", f"{BOARD}/cards/other-card", {"title": "Changed"}),
    ("delete", f"{BOARD}/cards/other-card", None),
    ("post", f"{BOARD}/cards/other-card/move", {"column_id": "col-done", "position": 0}),
    ("post", f"{BOARD}/cards/card-1/move", {"column_id": "other-col", "position": 0}),
])
def test_signed_in_user_cannot_change_another_users_board(method, path, body) -> None:
    board_client = signed_in_client()
    own_before = board_client.get(BOARD).json()
    add_other_users_board()
    other_before = other_users_rows()

    assert board_client.request(method.upper(), path, json=body).status_code == 404
    assert other_users_rows() == other_before
    assert board_client.get(BOARD).json() == own_before


def test_ai_cannot_change_another_users_board(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board_client = signed_in_client()
    board_client.get(BOARD)
    add_other_users_board()
    other_before = other_users_rows()

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps({"response": "Done", "operations": [{"action": "delete_card", "card_id": "other-card"}]})}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())

    assert board_client.post(f"{BOARD}/chat", json={"message": "Delete other-card"}).status_code == 502
    assert other_users_rows() == other_before


def test_chat_sends_only_recent_history_to_the_model(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board_client = signed_in_client()
    board_client.get(BOARD)
    for number in range(30):
        board.add_message(1, "user", f"Old message {number}")
    sent = {}

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"Hi","operations":[]}'}}]}

    def capture(*args, **kwargs):
        sent.update(kwargs["json"])
        return Response()

    monkeypatch.setattr(chat.httpx, "post", capture)
    board_client.post(f"{BOARD}/chat", json={"message": "Latest"})

    history = sent["messages"][1:-1]
    assert len(history) == chat.HISTORY_LIMIT
    assert history[0]["content"] == "Old message 10"
    assert history[-1]["content"] == "Old message 29"
    assert sent["messages"][-1]["content"].endswith("Question: Latest")


def test_login_is_limited_per_client_and_recovers_after_the_window(monkeypatch) -> None:
    now = [1000.0]
    monkeypatch.setattr("app.rate_limit.monotonic", lambda: now[0])
    attempt = lambda: TestClient(app).post("/api/login", json={"username": "user", "password": "wrong"})

    assert [attempt().status_code for _ in range(10)] == [401] * 10
    blocked = attempt()
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    assert blocked.json()["detail"] == "Too many requests. Try again in 1 minute."

    now[0] += 60
    assert attempt().status_code == 401


def test_successful_logins_do_not_count_towards_the_limit() -> None:
    assert all(signed_in_client().get("/api/session").status_code == 200 for _ in range(15))


def test_chat_is_limited_per_user(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"Hi","operations":[]}'}}]}

    calls = []
    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: calls.append(1) or Response())
    board_client = signed_in_client()

    assert [board_client.post(f"{BOARD}/chat", json={"message": "Hi"}).status_code for _ in range(10)] == [200] * 10
    assert board_client.post(f"{BOARD}/chat", json={"message": "Hi"}).status_code == 429
    assert len(calls) == 10


def test_chat_has_a_daily_limit_that_rolls_over(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    now = [1000.0]
    monkeypatch.setattr("app.rate_limit.monotonic", lambda: now[0])
    monkeypatch.setattr(daily_chat_limiter, "limit", 3)

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"Hi","operations":[]}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    board_client = signed_in_client()
    send = lambda: board_client.post(f"{BOARD}/chat", json={"message": "Hi"})

    for _ in range(3):
        assert send().status_code == 200
        now[0] += 3600
    blocked = send()
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Too many requests. Try again in 21 hours."
    assert blocked.headers["retry-after"] == str(24 * 3600 - 3 * 3600)

    now[0] += 21 * 3600
    assert send().status_code == 200


@pytest.mark.parametrize(("seconds", "text"), [(1, "1 second"), (45, "45 seconds"), (60, "1 minute"), (61, "2 minutes"), (3600, "1 hour"), (75600, "21 hours")])
def test_wait_times_are_described_in_readable_units(seconds, text) -> None:
    assert describe_wait(seconds) == text
