from fastapi.testclient import TestClient

from app.main import app


def register(username: str) -> TestClient:
    registered = TestClient(app)
    assert registered.post("/api/register", json={"username": username, "password": "long enough"}).status_code == 200
    return registered


def test_my_cards_lists_assigned_cards_across_boards_by_urgency() -> None:
    alice, bob = register("alice"), register("bob")
    alices = alice.get("/api/boards").json()[0]["id"]
    bobs = bob.get("/api/boards").json()[0]["id"]
    bob.patch(f"/api/boards/{bobs}", json={"name": "Bob's"})
    bob.post(f"/api/boards/{bobs}/members", json={"username": "alice"})
    alice_columns = [column["id"] for column in alice.get(f"/api/boards/{alices}").json()["columns"]]
    bob_columns = [column["id"] for column in bob.get(f"/api/boards/{bobs}").json()["columns"]]

    def add(client: TestClient, board_id: int, column: str, **fields) -> None:
        assert client.post(f"/api/boards/{board_id}/columns/{column}/cards", json=fields).status_code == 200

    add(alice, alices, alice_columns[0], title="No date, high", assignee="alice", priority="high")
    add(alice, alices, alice_columns[0], title="No date, none", assignee="alice")
    add(alice, alices, alice_columns[1], title="Due later", assignee="alice", due_date="2026-12-01")
    add(bob, bobs, bob_columns[2], title="Due soon on Bob's", assignee="alice", due_date="2026-10-01", priority="low")
    add(bob, bobs, bob_columns[2], title="Due soon, urgent", assignee="alice", due_date="2026-10-01", priority="high")
    add(alice, alices, alice_columns[4], title="Finished", assignee="alice", due_date="2026-01-01")
    add(bob, bobs, bob_columns[0], title="Bob's own", assignee="bob")
    add(alice, alices, alice_columns[0], title="Unassigned")

    cards = alice.get("/api/my-cards").json()

    assert [card["title"] for card in cards] == ["Due soon, urgent", "Due soon on Bob's", "Due later", "No date, high", "No date, none", "Finished"]
    assert {key: value for key, value in cards[1].items() if key != "id"} == {
        "boardId": bobs, "boardName": "Bob's", "title": "Due soon on Bob's", "column": "In Progress", "done": False, "priority": "low", "dueDate": "2026-10-01",
    }
    assert cards[-1]["done"] is True
    assert [card["title"] for card in bob.get("/api/my-cards").json()] == ["Bob's own"]


def test_leaving_a_board_removes_its_cards_from_my_cards() -> None:
    alice, bob = register("alice"), register("bob")
    bobs = bob.get("/api/boards").json()[0]["id"]
    bob.post(f"/api/boards/{bobs}/members", json={"username": "alice"})
    column = bob.get(f"/api/boards/{bobs}").json()["columns"][0]["id"]
    bob.post(f"/api/boards/{bobs}/columns/{column}/cards", json={"title": "Hers", "assignee": "alice"})
    assert len(alice.get("/api/my-cards").json()) == 1

    alice.delete(f"/api/boards/{bobs}/members/alice")

    assert alice.get("/api/my-cards").json() == []


def test_my_cards_needs_a_session() -> None:
    assert TestClient(app).get("/api/my-cards").status_code == 401
