from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.auth import COOKIE_NAME, PASSWORD, USERNAME, create_session, session_username
from app import board
from app import chat


STATIC_DIR = Path(__file__).parent.parent / "static"

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    board.initialize()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


class LoginRequest(BaseModel):
    username: str
    password: str


class ColumnRequest(BaseModel):
    title: board.Title


class CardRequest(BaseModel):
    title: board.Title
    details: str = ""


class MoveRequest(BaseModel):
    column_id: str
    position: int


class ChatRequest(BaseModel):
    message: str


def require_session(pm_session: str | None = Cookie(default=None)) -> str:
    username = session_username(pm_session)
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


SignedInUser = Annotated[str, Depends(require_session)]


@app.exception_handler(board.NotFoundError)
def not_found(_request: Request, error: board.NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/login")
def login(credentials: LoginRequest, response: Response) -> dict[str, str]:
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    response.set_cookie(COOKIE_NAME, create_session(USERNAME), httponly=True, samesite="lax")
    return {"username": USERNAME}


@app.get("/api/session")
def session(username: SignedInUser) -> dict[str, str]:
    return {"username": username}


@app.post("/api/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@app.get("/api/board")
def get_board(username: SignedInUser) -> dict:
    return board.board(username)


@app.patch("/api/columns/{column_id}")
def rename_board_column(username: SignedInUser, column_id: str, payload: ColumnRequest) -> dict:
    with board.connection() as database:
        board.rename_column(database, username, column_id, payload.title)
    return board.board(username)


@app.post("/api/columns/{column_id}/cards")
def add_board_card(username: SignedInUser, column_id: str, payload: CardRequest) -> dict:
    with board.connection() as database:
        board.create_card(database, username, column_id, payload.title, payload.details)
    return board.board(username)


@app.patch("/api/cards/{card_id}")
def edit_board_card(username: SignedInUser, card_id: str, payload: CardRequest) -> dict:
    with board.connection() as database:
        board.update_card(database, username, card_id, payload.title, payload.details)
    return board.board(username)


@app.delete("/api/cards/{card_id}")
def remove_board_card(username: SignedInUser, card_id: str) -> dict:
    with board.connection() as database:
        board.delete_card(database, username, card_id)
    return board.board(username)


@app.post("/api/cards/{card_id}/move")
def move_board_card(username: SignedInUser, card_id: str, payload: MoveRequest) -> dict:
    with board.connection() as database:
        board.move_card(database, username, card_id, payload.column_id, payload.position)
    return board.board(username)


@app.get("/api/messages")
def get_messages(username: SignedInUser) -> list[dict[str, str]]:
    return board.messages(username)


@app.post("/api/chat")
def send_chat(username: SignedInUser, payload: ChatRequest) -> dict:
    try:
        return chat.ask(username, payload.message)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
