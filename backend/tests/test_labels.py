import json

from fastapi.testclient import TestClient

from app.main import app
from app import db
from tests.fake_openrouter import mock_provider

BOARD = "/api/boards/1"


def demo_client() -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": "user", "password": "password"})
    return signed_in


def test_cards_are_created_with_labels_sorted_and_without_case_duplicates() -> None:
    client = demo_client()

    board = client.post(f"{BOARD}/columns/col-backlog/cards", json={"title": "Tagged", "labels": [" ux ", "Backend", "UX"]}).json()

    card = board["cards"][board["columns"][0]["cardIds"][-1]]
    assert card["labels"] == ["Backend", "ux"]
    assert board["labels"] == ["Backend", "ux"]


def test_editing_labels_replaces_them_and_other_edits_keep_them() -> None:
    client = demo_client()
    client.patch(f"{BOARD}/cards/card-1", json={"labels": ["research", "q3"]})

    kept = client.patch(f"{BOARD}/cards/card-1", json={"priority": "high"}).json()["cards"]["card-1"]
    replaced = client.patch(f"{BOARD}/cards/card-1", json={"labels": ["q4"]}).json()
    cleared = client.patch(f"{BOARD}/cards/card-1", json={"labels": []}).json()

    assert kept["labels"] == ["q3", "research"]
    assert replaced["cards"]["card-1"]["labels"] == ["q4"]
    assert cleared["cards"]["card-1"]["labels"] == []
    assert cleared["labels"] == []


def test_board_labels_are_the_distinct_labels_across_its_cards() -> None:
    client = demo_client()
    client.patch(f"{BOARD}/cards/card-1", json={"labels": ["Design", "research"]})
    board = client.patch(f"{BOARD}/cards/card-2", json={"labels": ["design", "Alpha"]}).json()

    assert [label.lower() for label in board["labels"]] == ["alpha", "design", "research"]


def test_invalid_labels_are_rejected() -> None:
    client = demo_client()

    assert client.patch(f"{BOARD}/cards/card-1", json={"labels": ["a", "b", "c", "d", "e", "f"]}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1", json={"labels": ["x" * 31]}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1", json={"labels": ["  "]}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1", json={"labels": None}).status_code == 422


def test_deleting_a_card_or_its_board_deletes_its_labels() -> None:
    client = demo_client()
    client.patch(f"{BOARD}/cards/card-1", json={"labels": ["gone"]})
    client.delete(f"{BOARD}/cards/card-1")
    second = client.post("/api/boards", json={"name": "Second"}).json()
    client.post(f"/api/boards/{second['id']}/columns/{second['columns'][0]['id']}/cards", json={"title": "x", "labels": ["also gone"]})
    client.delete(f"/api/boards/{second['id']}")

    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM card_labels").fetchone()[0] == 0


def test_the_ai_can_label_cards(monkeypatch) -> None:
    client = demo_client()
    mock_provider(monkeypatch, {"response": "Done", "operations": [{"action": "edit_card", "card_id": "card-1", "labels": ["urgent"]}]})

    card = client.post(f"{BOARD}/chat", json={"message": "Tag it"}).json()["board"]["cards"]["card-1"]

    assert card["labels"] == ["urgent"]
    assert card["title"] == "Align roadmap themes"
