from fastapi.testclient import TestClient

from app.main import app
from app import db


def register(username: str = "alice", password: str = "correct horse") -> TestClient:
    registered = TestClient(app)
    assert registered.post("/api/register", json={"username": username, "password": password}).status_code == 200
    return registered


def sign_in(username: str, password: str) -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": username, "password": password})
    return signed_in


def test_registering_signs_in_with_one_empty_board() -> None:
    alice = register()

    assert alice.get("/api/session").json() == {"username": "alice"}
    boards = alice.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["My first board"]
    board = alice.get(f"/api/boards/{boards[0]['id']}").json()
    assert [column["title"] for column in board["columns"]] == ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    assert board["cards"] == {}


def test_a_registered_user_can_sign_in_again_ignoring_username_case() -> None:
    register("Alice")

    response = TestClient(app).post("/api/login", json={"username": "alice", "password": "correct horse"})

    assert response.status_code == 200
    assert response.json() == {"username": "Alice"}


def test_usernames_are_unique_ignoring_case() -> None:
    register("alice")

    response = TestClient(app).post("/api/register", json={"username": "ALICE", "password": "another password"})

    assert response.status_code == 409
    assert response.json()["detail"] == "That username is taken"


def test_invalid_usernames_and_short_passwords_are_rejected() -> None:
    for username, password in [("al", "long enough"), ("has space", "long enough"), ("x" * 33, "long enough"), ("alice", "short")]:
        assert TestClient(app).post("/api/register", json={"username": username, "password": password}).status_code == 422


def test_registration_is_limited_per_client() -> None:
    statuses = [TestClient(app).post("/api/register", json={"username": f"user{number}", "password": "long enough"}).status_code for number in range(6)]

    assert statuses == [200] * 5 + [429]


def test_users_cannot_see_or_change_each_others_boards() -> None:
    alice, bob = register("alice"), register("bob")
    alice_board = alice.get("/api/boards").json()[0]["id"]
    column_id = alice.get(f"/api/boards/{alice_board}").json()["columns"][0]["id"]

    assert bob.get(f"/api/boards/{alice_board}").status_code == 404
    assert bob.patch(f"/api/boards/{alice_board}", json={"name": "Mine"}).status_code == 404
    assert bob.post(f"/api/boards/{alice_board}/columns/{column_id}/cards", json={"title": "Planted"}).status_code == 404
    assert bob.get(f"/api/boards/{alice_board}/messages").status_code == 404
    assert alice_board not in [board["id"] for board in bob.get("/api/boards").json()]
    assert alice.get(f"/api/boards/{alice_board}").json()["cards"] == {}


def test_a_forged_or_malformed_session_is_rejected() -> None:
    register("alice")

    for token in ["2.forged", "abc.def", "2", ""]:
        assert TestClient(app, cookies={"pm_session": token}).get("/api/session").status_code == 401


def test_changing_the_password_needs_the_current_one() -> None:
    alice = register()

    response = alice.post("/api/account/password", json={"current_password": "wrong", "new_password": "new password"})

    assert response.status_code == 403
    assert sign_in("alice", "correct horse").get("/api/session").status_code == 200


def test_changing_the_password_signs_out_other_sessions_but_keeps_this_one() -> None:
    alice = register()
    other_device = sign_in("alice", "correct horse")

    assert alice.post("/api/account/password", json={"current_password": "correct horse", "new_password": "new password"}).status_code == 200

    assert alice.get("/api/session").status_code == 200
    assert other_device.get("/api/session").status_code == 401
    assert sign_in("alice", "correct horse").get("/api/session").status_code == 401
    assert sign_in("alice", "new password").get("/api/session").status_code == 200


def test_the_new_password_must_be_long_enough() -> None:
    alice = register()

    assert alice.post("/api/account/password", json={"current_password": "correct horse", "new_password": "short"}).status_code == 422


def test_deleting_an_account_needs_the_password() -> None:
    alice = register()

    assert alice.request("DELETE", "/api/account", json={"password": "wrong"}).status_code == 403
    assert alice.get("/api/session").status_code == 200


def test_deleting_an_account_removes_its_data_and_frees_the_username() -> None:
    alice = register()
    board_id = alice.get("/api/boards").json()[0]["id"]
    alice.post("/api/boards", json={"name": "Second"})
    column_id = alice.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    alice.post(f"/api/boards/{board_id}/columns/{column_id}/cards", json={"title": "Doomed"})
    old_cookie = alice.cookies["pm_session"]

    response = alice.request("DELETE", "/api/account", json={"password": "correct horse"})

    assert response.status_code == 200
    assert "Max-Age=0" in response.headers["set-cookie"]
    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM users WHERE username = 'alice'").fetchone()[0] == 0
        assert database.execute("SELECT COUNT(*) FROM cards WHERE title = 'Doomed'").fetchone()[0] == 0
        assert database.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1
    register("alice", "a new password")
    assert TestClient(app, cookies={"pm_session": old_cookie}).get("/api/session").status_code == 401


def test_the_demo_account_is_not_recreated_once_other_users_exist() -> None:
    demo = sign_in("user", "password")
    register("alice")
    demo.request("DELETE", "/api/account", json={"password": "password"})

    db.initialize()

    assert sign_in("user", "password").get("/api/session").status_code == 401
