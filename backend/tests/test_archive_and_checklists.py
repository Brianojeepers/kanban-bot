from fastapi.testclient import TestClient

from app.main import app
from app import db

BOARD = "/api/boards/1"


def demo_client() -> TestClient:
    signed_in = TestClient(app)
    signed_in.post("/api/login", json={"username": "user", "password": "password"})
    return signed_in


def titles(board: dict, column_index: int) -> list[str]:
    return [board["cards"][card_id]["title"] for card_id in board["columns"][column_index]["cardIds"]]


def positions(column_id: str) -> list[int]:
    with db.connection() as database:
        return [row["position"] for row in database.execute("SELECT position FROM cards WHERE column_id = ? AND archived_at IS NULL ORDER BY position", (column_id,))]


def test_archiving_hides_a_card_and_restoring_puts_it_at_the_end_of_its_column() -> None:
    client = demo_client()

    archived = client.post(f"{BOARD}/cards/card-1/archive").json()
    assert "card-1" not in archived["cards"]
    assert titles(archived, 0) == ["Gather customer signals"]
    assert positions("col-backlog") == [0]
    listed = client.get(f"{BOARD}/archive").json()
    assert [(card["id"], card["title"], card["column"]) for card in listed] == [("card-1", "Align roadmap themes", "Backlog")]
    assert listed[0]["archivedAt"].endswith("Z")

    client.post(f"{BOARD}/columns/col-backlog/cards", json={"title": "Newer"})
    restored = client.post(f"{BOARD}/cards/card-1/restore").json()

    assert titles(restored, 0) == ["Gather customer signals", "Newer", "Align roadmap themes"]
    assert positions("col-backlog") == [0, 1, 2]
    assert client.get(f"{BOARD}/archive").json() == []


def test_archived_cards_cannot_be_changed_until_restored() -> None:
    client = demo_client()
    client.post(f"{BOARD}/cards/card-1/archive")

    for method, path, body in [
        ("patch", f"{BOARD}/cards/card-1", {"title": "x"}),
        ("post", f"{BOARD}/cards/card-1/move", {"column_id": "col-done", "position": 0}),
        ("delete", f"{BOARD}/cards/card-1", None),
        ("post", f"{BOARD}/cards/card-1/archive", None),
        ("get", f"{BOARD}/cards/card-1/comments", None),
        ("post", f"{BOARD}/cards/card-1/checklist", {"text": "x"}),
    ]:
        assert client.request(method.upper(), path, json=body).status_code == 404
    assert client.post(f"{BOARD}/cards/card-2/restore").status_code == 404


def test_new_and_moved_cards_ignore_archived_cards_in_the_column() -> None:
    client = demo_client()
    client.post(f"{BOARD}/cards/card-7/archive")

    client.post(f"{BOARD}/columns/col-done/cards", json={"title": "After archive"})
    moved = client.post(f"{BOARD}/cards/card-6/move", json={"column_id": "col-done", "position": 99}).json()

    assert titles(moved, 4) == ["Close onboarding sprint", "After archive", "QA micro-interactions"]
    assert positions("col-done") == [0, 1, 2]


def test_an_archived_card_can_be_deleted_for_good() -> None:
    client = demo_client()
    client.post(f"{BOARD}/cards/card-1/checklist", json={"text": "Step"})
    client.post(f"{BOARD}/cards/card-1/archive")

    remaining = client.delete(f"{BOARD}/archive/card-1").json()

    assert remaining == []
    assert positions("col-backlog") == [0]
    assert client.delete(f"{BOARD}/archive/card-2").status_code == 404
    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM checklist_items").fetchone()[0] == 0


def test_archived_cards_leave_my_cards_and_the_board_labels() -> None:
    client = demo_client()
    client.patch(f"{BOARD}/cards/card-1", json={"assignee": "user", "labels": ["gone"]})

    after = client.post(f"{BOARD}/cards/card-1/archive").json()

    assert after["labels"] == []
    assert client.get("/api/my-cards").json() == []


def test_checklist_items_are_added_ticked_edited_and_removed() -> None:
    client = demo_client()
    base = f"{BOARD}/cards/card-1/checklist"

    client.post(base, json={"text": "  Draft  "})
    added = client.post(base, json={"text": "Review"}).json()
    assert [(item["text"], item["done"]) for item in added["items"]] == [("Draft", False), ("Review", False)]
    assert added["board"]["cards"]["card-1"]["checklist"] == {"done": 0, "total": 2}

    first, second = (item["id"] for item in added["items"])
    ticked = client.patch(f"{base}/{first}", json={"done": True}).json()
    assert ticked["board"]["cards"]["card-1"]["checklist"] == {"done": 1, "total": 2}
    renamed = client.patch(f"{base}/{first}", json={"text": "Draft v2"}).json()
    assert renamed["items"][0] == {"id": first, "text": "Draft v2", "done": True}

    removed = client.delete(f"{base}/{second}").json()
    assert removed["items"] == [{"id": first, "text": "Draft v2", "done": True}]
    assert client.get(base).json() == removed["items"]


def test_checklist_items_need_text_and_must_belong_to_the_card() -> None:
    client = demo_client()
    item = client.post(f"{BOARD}/cards/card-1/checklist", json={"text": "Mine"}).json()["items"][0]["id"]

    assert client.post(f"{BOARD}/cards/card-1/checklist", json={"text": " "}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-1/checklist/{item}", json={"text": ""}).status_code == 422
    assert client.patch(f"{BOARD}/cards/card-2/checklist/{item}", json={"done": True}).status_code == 404
    assert client.delete(f"{BOARD}/cards/card-2/checklist/{item}").status_code == 404
    assert client.get(f"{BOARD}/cards/nope/checklist").status_code == 404


def test_checklist_and_archive_changes_are_logged() -> None:
    client = demo_client()
    item = client.post(f"{BOARD}/cards/card-1/checklist", json={"text": "Step"}).json()["items"][0]["id"]
    client.patch(f"{BOARD}/cards/card-1/checklist/{item}", json={"done": True})
    client.patch(f"{BOARD}/cards/card-1/checklist/{item}", json={"text": "Step one"})
    client.patch(f"{BOARD}/cards/card-1/checklist/{item}", json={"done": False})
    client.delete(f"{BOARD}/cards/card-1/checklist/{item}")
    client.post(f"{BOARD}/cards/card-1/archive")
    client.post(f"{BOARD}/cards/card-1/restore")
    client.post(f"{BOARD}/cards/card-1/archive")
    client.delete(f"{BOARD}/archive/card-1")

    assert [entry["action"] for entry in client.get(f"{BOARD}/activity").json()] == [
        'deleted "Align roadmap themes"',
        'archived "Align roadmap themes"',
        'restored "Align roadmap themes" to Backlog',
        'archived "Align roadmap themes"',
        'removed "Step one" from the checklist of "Align roadmap themes"',
        'unchecked "Step one" on "Align roadmap themes"',
        'checked "Step" on "Align roadmap themes"',
        'added "Step" to the checklist of "Align roadmap themes"',
    ]


def test_deleting_a_board_deletes_its_checklists() -> None:
    client = demo_client()
    second = client.post("/api/boards", json={"name": "Second"}).json()
    column = second["columns"][0]["id"]
    card_id = client.post(f"/api/boards/{second['id']}/columns/{column}/cards", json={"title": "x"}).json()["columns"][0]["cardIds"][0]
    client.post(f"/api/boards/{second['id']}/cards/{card_id}/checklist", json={"text": "Step"})

    client.delete(f"/api/boards/{second['id']}")

    with db.connection() as database:
        assert database.execute("SELECT COUNT(*) FROM checklist_items").fetchone()[0] == 0
