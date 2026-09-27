from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, StringConstraints

from app import accounts, board, chat
from app.accounts import User
from app.auth import COOKIE_NAME
from app.db import ConflictError, ForbiddenError, NotFoundError, connection, initialize
from app.rate_limit import chat_limiter, daily_chat_limiter, login_limiter, registration_limiter


STATIC_DIR = Path(__file__).parent.parent / "static"

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: accounts.Username
    password: accounts.Password


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: accounts.Password


class AccountDeleteRequest(BaseModel):
    password: str


class BoardRequest(BaseModel):
    name: board.BoardName


class MemberRequest(BaseModel):
    username: str


class ColumnRequest(BaseModel):
    title: board.Title


class CardRequest(BaseModel):
    title: board.Title
    details: board.Details = ""
    priority: board.Priority | None = None
    due_date: date | None = None
    assignee: str | None = None
    labels: board.Labels = []


class CardUpdateRequest(BaseModel):
    title: board.Title = ""
    details: board.Details = ""
    priority: board.Priority | None = None
    due_date: date | None = None
    assignee: str | None = None
    labels: board.Labels = []


class MoveRequest(BaseModel):
    column_id: str
    position: int


class CommentRequest(BaseModel):
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ChecklistItemRequest(BaseModel):
    text: board.Title


class ChecklistItemUpdateRequest(BaseModel):
    text: board.Title = ""
    done: bool = False


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


def require_session(pm_session: str | None = Cookie(default=None)) -> User:
    user = accounts.session_user(pm_session)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


SignedInUser = Annotated[User, Depends(require_session)]


def owned_board(board_id: int, user: SignedInUser) -> int:
    """The board in the path, if the user owns it or is a member."""
    with connection() as database:
        board.require_board(database, user.id, board_id)
    return board_id


OwnedBoard = Annotated[int, Depends(owned_board)]


@app.exception_handler(NotFoundError)
def not_found(_request: Request, error: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(ForbiddenError)
def forbidden(_request: Request, error: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(error)})


@app.exception_handler(ConflictError)
def conflict(_request: Request, error: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(error)})


def set_session(response: Response, token: str) -> None:
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax")


def client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/register")
def register(payload: RegisterRequest, request: Request, response: Response) -> dict[str, str]:
    registration_limiter.check(client_address(request))
    registration_limiter.record(client_address(request))
    set_session(response, accounts.register(payload.username, payload.password))
    return {"username": payload.username}


@app.post("/api/login")
def login(credentials: LoginRequest, request: Request, response: Response) -> dict[str, str]:
    client = client_address(request)
    login_limiter.check(client)
    token = accounts.sign_in(credentials.username, credentials.password)
    if not token:
        login_limiter.record(client)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_session(response, token)
    return {"username": accounts.session_user(token).username}


@app.get("/api/session")
def session(user: SignedInUser) -> dict[str, str]:
    return {"username": user.username}


@app.post("/api/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@app.post("/api/account/password")
def change_password(user: SignedInUser, payload: PasswordChangeRequest, response: Response) -> dict[str, str]:
    if not accounts.check_password(user.id, payload.current_password):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    set_session(response, accounts.change_password(user.id, payload.new_password))
    return {"status": "ok"}


@app.delete("/api/account")
def delete_account(user: SignedInUser, payload: AccountDeleteRequest, response: Response) -> dict[str, str]:
    if not accounts.check_password(user.id, payload.password):
        raise HTTPException(status_code=403, detail="Password is incorrect")
    accounts.delete_account(user.id)
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@app.get("/api/boards")
def list_boards(user: SignedInUser) -> list[dict]:
    return board.boards(user.id)


@app.get("/api/my-cards")
def my_cards(user: SignedInUser) -> list[dict]:
    return board.assigned_cards(user.id)


@app.post("/api/boards")
def add_board(user: SignedInUser, payload: BoardRequest) -> dict:
    with connection() as database:
        board_id = board.create_board(database, user.id, payload.name)
        board.record(database, board_id, user.id, "created the board")
    return board.board(board_id)


@app.get("/api/boards/{board_id}")
def get_board(board_id: OwnedBoard) -> dict:
    return board.board(board_id)


@app.patch("/api/boards/{board_id}")
def rename_board(user: SignedInUser, board_id: OwnedBoard, payload: BoardRequest) -> dict:
    with connection() as database:
        board.require_owner(database, user.id, board_id)
        board.record(database, board_id, user.id, board.rename_board(database, board_id, payload.name))
    return board.board(board_id)


@app.post("/api/boards/{board_id}/members")
def add_board_member(user: SignedInUser, board_id: OwnedBoard, payload: MemberRequest) -> dict:
    with connection() as database:
        board.require_owner(database, user.id, board_id)
        board.record(database, board_id, user.id, f"added {board.add_member(database, board_id, payload.username)} to the board")
    return board.board(board_id)


@app.delete("/api/boards/{board_id}/members/{username}")
def remove_board_member(user: SignedInUser, board_id: OwnedBoard, username: str) -> dict:
    """The owner can remove any member, and a member can remove themselves (leave the board)."""
    with connection() as database:
        leaving = username.lower() == user.username.lower()
        if not leaving:
            board.require_owner(database, user.id, board_id)
        removed = board.remove_member(database, board_id, username)
        board.record(database, board_id, user.id, "left the board" if leaving else f"removed {removed} from the board")
    return board.board(board_id)


@app.delete("/api/boards/{board_id}")
def delete_board(user: SignedInUser, board_id: OwnedBoard) -> list[dict]:
    with connection() as database:
        board.delete_board(database, user.id, board_id)
    return board.boards(user.id)


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_board_column(user: SignedInUser, board_id: OwnedBoard, column_id: str, payload: ColumnRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.rename_column(database, board_id, column_id, payload.title))
    return board.board(board_id)


@app.post("/api/boards/{board_id}/columns/{column_id}/cards")
def add_board_card(user: SignedInUser, board_id: OwnedBoard, column_id: str, payload: CardRequest) -> dict:
    with connection() as database:
        action = board.create_card(database, board_id, column_id, payload.title, payload.details, payload.priority, payload.due_date, payload.assignee, payload.labels)
        board.record(database, board_id, user.id, action)
    return board.board(board_id)


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def edit_board_card(user: SignedInUser, board_id: OwnedBoard, card_id: str, payload: CardUpdateRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.update_card(database, board_id, card_id, payload.model_dump(include=payload.model_fields_set)))
    return board.board(board_id)


@app.delete("/api/boards/{board_id}/cards/{card_id}")
def remove_board_card(user: SignedInUser, board_id: OwnedBoard, card_id: str) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.delete_card(database, board_id, card_id))
    return board.board(board_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_board_card(user: SignedInUser, board_id: OwnedBoard, card_id: str, payload: MoveRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.move_card(database, board_id, card_id, payload.column_id, payload.position))
    return board.board(board_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/archive")
def archive_board_card(user: SignedInUser, board_id: OwnedBoard, card_id: str) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.archive_card(database, board_id, card_id))
    return board.board(board_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/restore")
def restore_board_card(user: SignedInUser, board_id: OwnedBoard, card_id: str) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.restore_card(database, board_id, card_id))
    return board.board(board_id)


@app.get("/api/boards/{board_id}/archive")
def get_archived_cards(board_id: OwnedBoard) -> list[dict]:
    return board.archived_cards(board_id)


@app.delete("/api/boards/{board_id}/archive/{card_id}")
def delete_archived_card(user: SignedInUser, board_id: OwnedBoard, card_id: str) -> list[dict]:
    """Deletes an archived card for good."""
    with connection() as database:
        board.record(database, board_id, user.id, board.delete_card(database, board_id, card_id, archived=True))
    return board.archived_cards(board_id)


@app.get("/api/boards/{board_id}/cards/{card_id}/checklist")
def get_checklist(board_id: OwnedBoard, card_id: str) -> list[dict]:
    return board.checklist(board_id, card_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/checklist")
def add_checklist_item(user: SignedInUser, board_id: OwnedBoard, card_id: str, payload: ChecklistItemRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.add_checklist_item(database, board_id, card_id, payload.text))
    return {"items": board.checklist(board_id, card_id), "board": board.board(board_id)}


@app.patch("/api/boards/{board_id}/cards/{card_id}/checklist/{item_id}")
def update_checklist_item(user: SignedInUser, board_id: OwnedBoard, card_id: str, item_id: int, payload: ChecklistItemUpdateRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.update_checklist_item(database, board_id, card_id, item_id, payload.model_dump(include=payload.model_fields_set)))
    return {"items": board.checklist(board_id, card_id), "board": board.board(board_id)}


@app.delete("/api/boards/{board_id}/cards/{card_id}/checklist/{item_id}")
def delete_checklist_item(user: SignedInUser, board_id: OwnedBoard, card_id: str, item_id: int) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.delete_checklist_item(database, board_id, card_id, item_id))
    return {"items": board.checklist(board_id, card_id), "board": board.board(board_id)}


@app.get("/api/boards/{board_id}/cards/{card_id}/comments")
def get_comments(board_id: OwnedBoard, card_id: str) -> list[dict]:
    return board.comments(board_id, card_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/comments")
def add_card_comment(user: SignedInUser, board_id: OwnedBoard, card_id: str, payload: CommentRequest) -> dict:
    with connection() as database:
        board.record(database, board_id, user.id, board.add_comment(database, board_id, card_id, user.id, payload.content))
    return {"comments": board.comments(board_id, card_id), "board": board.board(board_id)}


@app.delete("/api/boards/{board_id}/cards/{card_id}/comments/{comment_id}")
def delete_card_comment(user: SignedInUser, board_id: OwnedBoard, card_id: str, comment_id: int) -> dict:
    with connection() as database:
        board.delete_comment(database, board_id, card_id, user.id, comment_id)
    return {"comments": board.comments(board_id, card_id), "board": board.board(board_id)}


@app.get("/api/boards/{board_id}/activity")
def get_activity(board_id: OwnedBoard) -> list[dict]:
    return board.activity(board_id)


@app.get("/api/boards/{board_id}/messages")
def get_messages(board_id: OwnedBoard) -> list[dict]:
    return board.messages(board_id)


@app.post("/api/boards/{board_id}/chat")
def send_chat(user: SignedInUser, board_id: OwnedBoard, payload: ChatRequest) -> dict:
    for limiter in (chat_limiter, daily_chat_limiter):
        limiter.check(user.username)
    for limiter in (chat_limiter, daily_chat_limiter):
        limiter.record(user.username)
    try:
        return chat.ask(board_id, user.id, payload.message)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
