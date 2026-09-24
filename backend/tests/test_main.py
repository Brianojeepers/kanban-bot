import json
import os
import re
import subprocess
import sys

from fastapi.testclient import TestClient

from app.main import app
from app import chat


client = TestClient(app)


def signed_in_client() -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": "user", "password": "password"})
    return signed_in


def test_health_check_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_the_smoke_test_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Project Management MVP" in response.text
    assert 'fetch("/api/health")' in response.text


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
    response = TestClient(app).get("/api/board")

    assert response.status_code == 401


def test_board_seeds_five_fixed_columns() -> None:
    response = signed_in_client().get("/api/board")

    assert response.status_code == 200
    assert [column["title"] for column in response.json()["columns"]] == [
        "Backlog", "Discovery", "In Progress", "Review", "Done"
    ]


def test_board_mutations_persist() -> None:
    board_client = signed_in_client()
    board = board_client.get("/api/board").json()
    backlog = board["columns"][0]["id"]

    board = board_client.patch(f"/api/columns/{backlog}", json={"title": "Ideas"}).json()
    assert board["columns"][0]["title"] == "Ideas"

    board = board_client.post(f"/api/columns/{backlog}/cards", json={"title": "Plan", "details": "Draft"}).json()
    card_id = next(card_id for card_id, card in board["cards"].items() if card["title"] == "Plan")
    assert board["cards"][card_id] == {"id": card_id, "title": "Plan", "details": "Draft"}

    board = board_client.patch(f"/api/cards/{card_id}", json={"title": "Ship", "details": "Ready"}).json()
    assert board["cards"][card_id]["title"] == "Ship"

    review = board["columns"][3]["id"]
    board = board_client.post(f"/api/cards/{card_id}/move", json={"column_id": review, "position": 0}).json()
    assert card_id in board["columns"][3]["cardIds"]

    board = board_client.delete(f"/api/cards/{card_id}").json()
    assert card_id not in board["cards"]


def test_empty_card_details_use_the_default_text() -> None:
    board_client = signed_in_client()
    column_id = board_client.get("/api/board").json()["columns"][0]["id"]
    board = board_client.post(f"/api/columns/{column_id}/cards", json={"title": "Note"}).json()

    card_id = board["columns"][0]["cardIds"][-1]
    assert board["cards"][card_id]["details"] == "No details yet."


def test_moving_a_card_between_adjacent_columns_never_duplicates_it() -> None:
    board_client = signed_in_client()
    board = board_client.get("/api/board").json()
    backlog, discovery = board["columns"][:2]
    card_id = "card-1"

    moved = board_client.post(f"/api/cards/{card_id}/move", json={"column_id": discovery["id"], "position": 0}).json()
    assert card_id not in moved["columns"][0]["cardIds"]
    assert moved["columns"][1]["cardIds"].count(card_id) == 1
    assert list(moved["cards"]).count(card_id) == 1

    returned = board_client.post(f"/api/cards/{card_id}/move", json={"column_id": backlog["id"], "position": 0}).json()
    assert returned["columns"][0]["cardIds"].count(card_id) == 1
    assert card_id not in returned["columns"][1]["cardIds"]


def test_chat_persists_a_mocked_assistant_reply(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"I can help.","operations":[]}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post("/api/chat", json={"message": "What is next?"})

    assert response.status_code == 200
    assert response.json()["response"] == "I can help."
    assert signed_in_client().get("/api/messages").json()[-2:] == [
        {"role": "user", "content": "What is next?"},
        {"role": "assistant", "content": "I can help."},
    ]


def test_chat_applies_a_valid_card_operation(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    column_id = signed_in_client().get("/api/board").json()["columns"][0]["id"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": f'{{"response":"Added it.","operations":[{{"action":"create_card","column_id":"{column_id}","title":"AI task"}}]}}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post("/api/chat", json={"message": "Add a task"})

    assert response.status_code == 200
    assert any(card["title"] == "AI task" for card in response.json()["board"]["cards"].values())


def test_chat_rejects_missing_key_and_invalid_operations(monkeypatch) -> None:
    response = signed_in_client().post("/api/chat", json={"message": "Hello"})
    assert response.status_code == 502

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"No","operations":[{"action":"bad"}]}'}}]}
    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    assert signed_in_client().post("/api/chat", json={"message": "Hello"}).status_code == 502


def test_chat_applies_no_operations_when_any_is_invalid(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    board_client = signed_in_client()
    before = board_client.get("/api/board").json()
    column_id = before["columns"][0]["id"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": f'{{"response":"Done.","operations":[{{"action":"create_card","column_id":"{column_id}","title":"Partial"}},{{"action":"bad"}}]}}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())

    assert board_client.post("/api/chat", json={"message": "Add a task"}).status_code == 502
    assert board_client.get("/api/board").json() == before


def test_chat_accepts_every_operation_shape_in_the_system_prompt(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    examples = [line for line in chat.SYSTEM_PROMPT.splitlines() if line.startswith('{"action"')]
    filled = [re.sub(r"<0-based[^>]*>", "0", line).replace("<column id>", "col-done").replace("<card id>", "card-1").replace("<title>", "From prompt").replace("<details>", "") for line in examples]
    operations = [json.loads(line) for line in filled]
    assert [operation["action"] for operation in operations] == ["create_card", "edit_card", "move_card", "delete_card"]

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps({"response": "Done.", "operations": operations})}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    response = signed_in_client().post("/api/chat", json={"message": "Use every operation"})

    assert response.status_code == 200
    cards = response.json()["board"]["cards"]
    assert "card-1" not in cards
    assert [card["title"] for card in cards.values()].count("From prompt") == 1


def test_deleted_demo_card_stays_deleted() -> None:
    board_client = signed_in_client()
    assert "card-1" in board_client.get("/api/board").json()["cards"]
    board_client.delete("/api/cards/card-1")

    assert "card-1" not in board_client.get("/api/board").json()["cards"]
