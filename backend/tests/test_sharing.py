import json

from fastapi.testclient import TestClient

from app.main import app
from app import chat, db


def register(username: str) -> TestClient:
    registered = TestClient(app)
    assert registered.post("/api/register", json={"username": username, "password": "long enough"}).status_code == 200
    return registered


def own_board(client: TestClient) -> dict:
    return client.get(f"/api/boards/{client.get('/api/boards').json()[0]['id']}").json()


def shared_board() -> tuple[TestClient, TestClient, dict]:
    """alice owns a board and has added bob as a member."""
    alice, bob = register("alice"), register("bob")
    board = own_board(alice)
    assert alice.post(f"/api/boards/{board['id']}/members", json={"username": "Bob"}).status_code == 200
    return alice, bob, board


def test_a_shared_board_lists_its_owner_and_members() -> None:
    alice, bob, board = shared_board()

    shared = alice.get(f"/api/boards/{board['id']}").json()

    assert (shared["owner"], shared["members"]) == ("alice", ["alice", "bob"])
    assert bob.get("/api/boards").json() == [
        {"id": own_board(bob)["id"], "name": "My first board", "owner": "bob"},
        {"id": board["id"], "name": "My first board", "owner": "alice"},
    ]


def test_members_can_work_on_the_board_and_its_chat(monkeypatch) -> None:
    alice, bob, board = shared_board()
    column = board["columns"][0]["id"]

    created = bob.post(f"/api/boards/{board['id']}/columns/{column}/cards", json={"title": "From bob"}).json()
    card_id = created["columns"][0]["cardIds"][0]
    bob.patch(f"/api/boards/{board['id']}/columns/{column}", json={"title": "Ideas"})
    bob.post(f"/api/boards/{board['id']}/cards/{card_id}/move", json={"column_id": board["columns"][1]["id"], "position": 0})

    after = alice.get(f"/api/boards/{board['id']}").json()
    assert after["columns"][0]["title"] == "Ideas"
    assert after["columns"][1]["cardIds"] == [card_id]

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": '{"response":"Hi","operations":[]}'}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())
    bob.post(f"/api/boards/{board['id']}/chat", json={"message": "Shared question"})
    assert alice.get(f"/api/boards/{board['id']}/messages").json()[0] == {"role": "user", "content": "Shared question", "author": "bob"}

    # Deleting bob's account keeps his message, without an author.
    bob.request("DELETE", "/api/account", json={"password": "long enough"})
    assert alice.get(f"/api/boards/{board['id']}/messages").json()[0]["author"] is None


def test_only_the_owner_can_rename_delete_or_share_the_board() -> None:
    alice, bob, board = shared_board()
    register("carol")
    alice.post("/api/boards", json={"name": "Second"})

    for response in [
        bob.patch(f"/api/boards/{board['id']}", json={"name": "Mine"}),
        bob.delete(f"/api/boards/{board['id']}"),
        bob.post(f"/api/boards/{board['id']}/members", json={"username": "carol"}),
    ]:
        assert (response.status_code, response.json()["detail"]) == (403, "Only the board's owner can do that")
    assert bob.delete(f"/api/boards/{board['id']}/members/alice").status_code == 403
    assert alice.delete(f"/api/boards/{board['id']}/members/alice").status_code == 404
    assert alice.get(f"/api/boards/{board['id']}").json()["members"] == ["alice", "bob"]


def test_sharing_reports_unknown_users_and_existing_access() -> None:
    alice, _, board = shared_board()

    unknown = alice.post(f"/api/boards/{board['id']}/members", json={"username": "nobody"})
    again = alice.post(f"/api/boards/{board['id']}/members", json={"username": "bob"})
    owner = alice.post(f"/api/boards/{board['id']}/members", json={"username": "alice"})

    assert (unknown.status_code, unknown.json()["detail"]) == (404, "There is no user called nobody")
    assert (again.status_code, again.json()["detail"]) == (409, "bob can already open this board")
    assert owner.status_code == 409


def test_cards_can_be_assigned_to_board_members_only() -> None:
    alice, _, board = shared_board()
    register("carol")
    column = board["columns"][0]["id"]
    base = f"/api/boards/{board['id']}"

    created = alice.post(f"{base}/columns/{column}/cards", json={"title": "Task", "assignee": "BOB"}).json()
    card_id = created["columns"][0]["cardIds"][0]
    assert created["cards"][card_id]["assignee"] == "bob"

    assert alice.patch(f"{base}/cards/{card_id}", json={"assignee": "alice"}).json()["cards"][card_id]["assignee"] == "alice"
    refused = alice.patch(f"{base}/cards/{card_id}", json={"assignee": "carol"})
    assert (refused.status_code, refused.json()["detail"]) == (404, "carol is not a member of this board")
    assert alice.post(f"{base}/columns/{column}/cards", json={"title": "x", "assignee": "carol"}).status_code == 404
    assert alice.patch(f"{base}/cards/{card_id}", json={"assignee": None}).json()["cards"][card_id]["assignee"] is None


def test_removing_a_member_revokes_access_and_unassigns_their_cards() -> None:
    alice, bob, board = shared_board()
    base = f"/api/boards/{board['id']}"
    column = board["columns"][0]["id"]
    card_id = alice.post(f"{base}/columns/{column}/cards", json={"title": "Task", "assignee": "bob"}).json()["columns"][0]["cardIds"][0]

    after = alice.delete(f"{base}/members/bob").json()

    assert after["members"] == ["alice"]
    assert after["cards"][card_id]["assignee"] is None
    assert bob.get(base).status_code == 404
    assert alice.delete(f"{base}/members/bob").status_code == 404


def test_a_member_can_leave_a_board() -> None:
    alice, bob, board = shared_board()

    assert bob.delete(f"/api/boards/{board['id']}/members/bob").status_code == 200

    assert [summary["owner"] for summary in bob.get("/api/boards").json()] == ["bob"]
    assert alice.get(f"/api/boards/{board['id']}").json()["members"] == ["alice"]


def test_deleting_a_shared_board_removes_access_for_members() -> None:
    alice, bob, board = shared_board()
    alice.post("/api/boards", json={"name": "Second"})

    assert alice.delete(f"/api/boards/{board['id']}").status_code == 200

    assert bob.get(f"/api/boards/{board['id']}").status_code == 404
    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM board_members").fetchone()[0] == 0


def test_deleting_an_account_removes_its_memberships_and_assignments() -> None:
    alice, bob, board = shared_board()
    base = f"/api/boards/{board['id']}"
    card_id = alice.post(f"{base}/columns/{board['columns'][0]['id']}/cards", json={"title": "Task", "assignee": "bob"}).json()["columns"][0]["cardIds"][0]

    bob.request("DELETE", "/api/account", json={"password": "long enough"})

    after = alice.get(base).json()
    assert after["members"] == ["alice"]
    assert after["cards"][card_id]["assignee"] is None


def test_the_ai_can_assign_cards_to_members_but_not_to_others(monkeypatch) -> None:
    alice, _, board = shared_board()
    register("carol")
    base = f"/api/boards/{board['id']}"
    card_id = alice.post(f"{base}/columns/{board['columns'][0]['id']}/cards", json={"title": "Task"}).json()["columns"][0]["cardIds"][0]
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    reply = {}

    class Response:
        def raise_for_status(self) -> None: pass
        def json(self) -> dict: return {"choices": [{"message": {"content": json.dumps(reply)}}]}

    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: Response())

    reply.update({"response": "Done", "operations": [{"action": "edit_card", "card_id": card_id, "assignee": "carol"}]})
    assert alice.post(f"{base}/chat", json={"message": "Give it to carol"}).status_code == 502
    reply.update({"response": "Done", "operations": [{"action": "edit_card", "card_id": card_id, "assignee": "bob"}]})
    assert alice.post(f"{base}/chat", json={"message": "Give it to bob"}).json()["board"]["cards"][card_id]["assignee"] == "bob"
