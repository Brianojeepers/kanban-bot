import json

from fastapi.testclient import TestClient

from app.main import app
from app import chat, db


def register(username: str) -> TestClient:
    registered = TestClient(app)
    assert registered.post("/api/register", json={"username": username, "password": "long enough"}).status_code == 200
    return registered


def shared_board_with_card() -> tuple[TestClient, TestClient, str, str]:
    """alice owns a board shared with bob, with one card, "Task", in its first column."""
    alice, bob = register("alice"), register("bob")
    board_id = alice.get("/api/boards").json()[0]["id"]
    alice.post(f"/api/boards/{board_id}/members", json={"username": "bob"})
    base = f"/api/boards/{board_id}"
    column = alice.get(base).json()["columns"][0]["id"]
    card_id = alice.post(f"{base}/columns/{column}/cards", json={"title": "Task"}).json()["columns"][0]["cardIds"][0]
    return alice, bob, base, card_id


def test_members_comment_on_cards_and_see_the_count() -> None:
    alice, bob, base, card_id = shared_board_with_card()

    first = alice.post(f"{base}/cards/{card_id}/comments", json={"content": "  Started on this  "}).json()
    second = bob.post(f"{base}/cards/{card_id}/comments", json={"content": "Thanks!"}).json()

    assert [(comment["author"], comment["content"]) for comment in second["comments"]] == [("alice", "Started on this"), ("bob", "Thanks!")]
    assert first["board"]["cards"][card_id]["comments"] == 1
    assert second["board"]["cards"][card_id]["comments"] == 2
    assert second["comments"][0]["createdAt"].endswith("Z")
    assert bob.get(f"{base}/cards/{card_id}/comments").json() == second["comments"]


def test_comments_must_have_text_and_belong_to_a_card_on_the_board() -> None:
    alice, _, base, card_id = shared_board_with_card()

    assert alice.post(f"{base}/cards/{card_id}/comments", json={"content": "   "}).status_code == 422
    assert alice.post(f"{base}/cards/{card_id}/comments", json={"content": "x" * 2001}).status_code == 422
    assert alice.post(f"{base}/cards/card-1/comments", json={"content": "Elsewhere"}).status_code == 404
    assert alice.get(f"{base}/cards/card-1/comments").status_code == 404
    outsider = register("carol")
    assert outsider.get(f"{base}/cards/{card_id}/comments").status_code == 404


def test_only_the_author_can_delete_a_comment() -> None:
    alice, bob, base, card_id = shared_board_with_card()
    comment_id = alice.post(f"{base}/cards/{card_id}/comments", json={"content": "Mine"}).json()["comments"][0]["id"]

    refused = bob.delete(f"{base}/cards/{card_id}/comments/{comment_id}")
    deleted = alice.delete(f"{base}/cards/{card_id}/comments/{comment_id}").json()

    assert (refused.status_code, refused.json()["detail"]) == (403, "You can only delete your own comments")
    assert deleted["comments"] == []
    assert deleted["board"]["cards"][card_id]["comments"] == 0
    assert alice.delete(f"{base}/cards/{card_id}/comments/{comment_id}").status_code == 404


def test_deleting_a_card_or_board_deletes_its_comments() -> None:
    alice, _, base, card_id = shared_board_with_card()
    alice.post(f"{base}/cards/{card_id}/comments", json={"content": "Gone soon"})
    alice.delete(f"{base}/cards/{card_id}")
    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0

    column = alice.get(base).json()["columns"][0]["id"]
    card_id = alice.post(f"{base}/columns/{column}/cards", json={"title": "Again"}).json()["columns"][0]["cardIds"][0]
    alice.post(f"{base}/cards/{card_id}/comments", json={"content": "Gone with the board"})
    alice.post("/api/boards", json={"name": "Keep"})
    alice.delete(base)
    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
        assert database.execute("SELECT COUNT(*) FROM activity WHERE board_id = ?", (int(base.rsplit("/", 1)[1]),)).fetchone()[0] == 0


def test_the_activity_log_records_who_did_what_newest_first() -> None:
    alice, bob, base, card_id = shared_board_with_card()
    board = alice.get(base).json()
    first, second = board["columns"][0], board["columns"][1]

    bob.patch(f"{base}/cards/{card_id}", json={"priority": "high"})
    bob.patch(f"{base}/cards/{card_id}", json={})
    bob.post(f"{base}/cards/{card_id}/move", json={"column_id": second["id"], "position": 0})
    bob.post(f"{base}/cards/{card_id}/move", json={"column_id": second["id"], "position": 0})
    alice.patch(f"{base}/columns/{first['id']}", json={"title": "Ideas"})
    bob.post(f"{base}/cards/{card_id}/comments", json={"content": "Done"})
    alice.patch(base, json={"name": "Renamed"})
    bob.delete(f"{base}/cards/{card_id}")
    bob.delete(f"{base}/members/bob")

    entries = [(entry["actor"], entry["action"]) for entry in alice.get(f"{base}/activity").json()]
    assert entries == [
        ("bob", "left the board"),
        ("bob", 'deleted "Task"'),
        ("alice", 'renamed the board to "Renamed"'),
        ("bob", 'commented on "Task"'),
        ("alice", 'renamed column "Backlog" to "Ideas"'),
        ("bob", 'reordered "Task" in Discovery'),
        ("bob", 'moved "Task" to Discovery'),
        ("bob", 'edited "Task"'),
        ("alice", 'added "Task" to Backlog'),
        ("alice", "added bob to the board"),
    ]


def test_new_boards_start_their_log_and_members_removed_by_the_owner_are_named() -> None:
    alice, _, base, _ = shared_board_with_card()
    created = alice.post("/api/boards", json={"name": "Fresh"}).json()

    alice.delete(f"{base}/members/BOB")

    assert [entry["action"] for entry in alice.get(f"/api/boards/{created['id']}/activity").json()] == ["created the board"]
    assert alice.get(f"{base}/activity").json()[0]["action"] == "removed bob from the board"


def test_the_log_keeps_the_latest_fifty_entries() -> None:
    alice, _, base, card_id = shared_board_with_card()
    for number in range(60):
        alice.post(f"{base}/cards/{card_id}/comments", json={"content": f"Comment {number}"})

    entries = alice.get(f"{base}/activity").json()

    assert len(entries) == 50
    assert entries[0]["id"] > entries[-1]["id"]


def test_ai_changes_are_logged_as_made_through_the_assistant(monkeypatch) -> None:
    alice, _, base, card_id = shared_board_with_card()
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    reply = {"response": "Done", "operations": [{"action": "edit_card", "card_id": card_id, "priority": "low"}, {"action": "edit_card", "card_id": card_id}]}

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps(reply)}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    alice.post(f"{base}/chat", json={"message": "Lower it"})

    assert [(entry["actor"], entry["action"]) for entry in alice.get(f"{base}/activity").json()[:2]] == [
        ("alice", 'edited "Task" (via assistant)'),
        ("alice", 'added "Task" to Backlog'),
    ]


def test_a_deleted_accounts_comments_and_activity_stay_without_a_name() -> None:
    alice, bob, base, card_id = shared_board_with_card()
    bob.post(f"{base}/cards/{card_id}/comments", json={"content": "Bye"})

    bob.request("DELETE", "/api/account", json={"password": "long enough"})

    assert alice.get(f"{base}/cards/{card_id}/comments").json()[0]["author"] is None
    assert alice.get(f"{base}/activity").json()[0]["actor"] is None
