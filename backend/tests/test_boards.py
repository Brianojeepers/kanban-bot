import json

from fastapi.testclient import TestClient

from app.main import app
from app import chat


def demo_client() -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": "user", "password": "password"})
    return signed_in


def mock_reply(monkeypatch, reply: dict) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps(reply)}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())


def test_boards_are_listed_in_creation_order() -> None:
    client = demo_client()

    created = client.post("/api/boards", json={"name": "  Launch plan  "}).json()

    assert created["name"] == "Launch plan"
    assert created["cards"] == {}
    assert client.get("/api/boards").json() == [{"id": 1, "name": "Product roadmap", "owner": "user"}, {"id": created["id"], "name": "Launch plan", "owner": "user"}]


def test_each_board_has_its_own_columns() -> None:
    client = demo_client()
    first = client.get("/api/boards/1").json()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    third = client.post("/api/boards", json={"name": "Third"}).json()

    ids = [column["id"] for board in (first, second, third) for column in board["columns"]]
    assert len(set(ids)) == 15


def test_a_card_can_only_be_changed_through_its_own_board() -> None:
    client = demo_client()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    second_column = second["columns"][0]["id"]

    assert client.patch(f"/api/boards/{second['id']}/cards/card-1", json={"title": "Moved"}).status_code == 404
    assert client.post(f"/api/boards/{second['id']}/cards/card-1/move", json={"column_id": second_column, "position": 0}).status_code == 404
    assert client.post("/api/boards/1/cards/card-1/move", json={"column_id": second_column, "position": 0}).status_code == 404
    assert client.post(f"/api/boards/1/columns/{second_column}/cards", json={"title": "Wrong board"}).status_code == 404
    assert client.get(f"/api/boards/{second['id']}").json()["cards"] == {}


def test_a_board_can_be_renamed() -> None:
    client = demo_client()

    assert client.patch("/api/boards/1", json={"name": "Roadmap 2027"}).json()["name"] == "Roadmap 2027"
    assert client.get("/api/boards").json()[0]["name"] == "Roadmap 2027"
    assert client.patch("/api/boards/1", json={"name": "  "}).status_code == 422
    assert client.patch("/api/boards/1", json={"name": "x" * 101}).status_code == 422


def test_deleting_a_board_removes_its_cards_and_messages(monkeypatch) -> None:
    client = demo_client()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    client.post(f"/api/boards/{second['id']}/columns/{second['columns'][0]['id']}/cards", json={"title": "Temp"})
    mock_reply(monkeypatch, {"response": "Hi", "operations": []})
    client.post(f"/api/boards/{second['id']}/chat", json={"message": "Hello"})

    remaining = client.delete(f"/api/boards/{second['id']}").json()

    assert remaining == [{"id": 1, "name": "Product roadmap", "owner": "user"}]
    assert client.get(f"/api/boards/{second['id']}").status_code == 404
    assert "card-1" in client.get("/api/boards/1").json()["cards"]


def test_the_last_board_cannot_be_deleted() -> None:
    client = demo_client()

    response = client.delete("/api/boards/1")

    assert response.status_code == 409
    assert response.json()["detail"] == "You need at least one board of your own"
    assert client.get("/api/boards/1").status_code == 200


def test_board_endpoints_require_a_session() -> None:
    anonymous = TestClient(app)

    assert anonymous.get("/api/boards").status_code == 401
    assert anonymous.post("/api/boards", json={"name": "x"}).status_code == 401
    assert anonymous.get("/api/boards/1").status_code == 401


def test_chat_history_is_kept_per_board(monkeypatch) -> None:
    client = demo_client()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    mock_reply(monkeypatch, {"response": "Hi", "operations": []})

    client.post(f"/api/boards/{second['id']}/chat", json={"message": "Only here"})

    assert client.get("/api/boards/1/messages").json() == []
    assert client.get(f"/api/boards/{second['id']}/messages").json()[0]["content"] == "Only here"


def test_the_ai_can_only_change_the_board_it_is_asked_about(monkeypatch) -> None:
    client = demo_client()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    before = client.get("/api/boards/1").json()
    mock_reply(monkeypatch, {"response": "Done", "operations": [{"action": "delete_card", "card_id": "card-1"}]})

    assert client.post(f"/api/boards/{second['id']}/chat", json={"message": "Delete it"}).status_code == 502
    assert client.get("/api/boards/1").json() == before


def test_cards_store_priority_and_due_date() -> None:
    client = demo_client()

    board = client.post("/api/boards/1/columns/col-backlog/cards", json={"title": "Dated", "priority": "high", "due_date": "2026-11-30"}).json()

    card = board["cards"][board["columns"][0]["cardIds"][-1]]
    assert card["priority"] == "high"
    assert card["dueDate"] == "2026-11-30"


def test_a_card_edit_changes_only_the_fields_it_sends() -> None:
    client = demo_client()

    card = client.patch("/api/boards/1/cards/card-1", json={"priority": "low"}).json()["cards"]["card-1"]
    assert card == {"id": "card-1", "title": "Align roadmap themes", "details": "Draft quarterly themes with impact statements and metrics.", "priority": "low", "dueDate": None, "assignee": None, "labels": [], "comments": 0, "checklist": {"done": 0, "total": 0}}

    card = client.patch("/api/boards/1/cards/card-1", json={"due_date": "2026-12-01", "details": ""}).json()["cards"]["card-1"]
    assert (card["title"], card["details"], card["priority"], card["dueDate"]) == ("Align roadmap themes", "", "low", "2026-12-01")

    card = client.patch("/api/boards/1/cards/card-1", json={"priority": None, "due_date": None}).json()["cards"]["card-1"]
    assert (card["priority"], card["dueDate"]) == (None, None)

    assert client.patch("/api/boards/1/cards/card-1", json={}).json()["cards"]["card-1"] == card


def test_invalid_priority_and_due_date_are_rejected() -> None:
    client = demo_client()

    assert client.patch("/api/boards/1/cards/card-1", json={"priority": "urgent"}).status_code == 422
    assert client.patch("/api/boards/1/cards/card-1", json={"due_date": "tomorrow"}).status_code == 422
    assert client.post("/api/boards/1/columns/col-backlog/cards", json={"title": "x", "due_date": "2026-02-30"}).status_code == 422


def test_the_ai_can_set_priority_and_due_date_and_leaves_other_fields_alone(monkeypatch) -> None:
    client = demo_client()
    mock_reply(monkeypatch, {"response": "Done", "operations": [{"action": "edit_card", "card_id": "card-1", "priority": "high", "due_date": "2026-10-15"}]})

    card = client.post("/api/boards/1/chat", json={"message": "Make it urgent"}).json()["board"]["cards"]["card-1"]

    assert card == {"id": "card-1", "title": "Align roadmap themes", "details": "Draft quarterly themes with impact statements and metrics.", "priority": "high", "dueDate": "2026-10-15", "assignee": None, "labels": [], "comments": 0, "checklist": {"done": 0, "total": 0}}


def test_the_prompt_tells_the_model_todays_date(monkeypatch) -> None:
    client = demo_client()
    mock_reply(monkeypatch, {"response": "Hi", "operations": []})
    sent = {}
    original = chat.httpx.post
    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: sent.update(kwargs["json"]) or original(*args, **kwargs))

    client.post("/api/boards/1/chat", json={"message": "When?"})

    assert "Today is 20" in sent["messages"][0]["content"]
    assert "{today}" not in sent["messages"][0]["content"]
