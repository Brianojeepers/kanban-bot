from pathlib import Path

import httpx
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.auth import COOKIE_NAME, PASSWORD, USERNAME, create_session, is_valid_session
from app import board
from app import chat


STATIC_DIR = Path(__file__).parent.parent / "static"

app = FastAPI(title="Project Management MVP")


class LoginRequest(BaseModel):
    username: str
    password: str


class ColumnRequest(BaseModel):
    title: str


class CardRequest(BaseModel):
    title: str
    details: str = ""


class MoveRequest(BaseModel):
    column_id: str
    position: int


class ChatRequest(BaseModel):
    message: str


def require_session(pm_session: str | None = Cookie(default=None)) -> None:
    if not is_valid_session(pm_session):
        raise HTTPException(status_code=401, detail="Not signed in")


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
def session(pm_session: str | None = Cookie(default=None)) -> dict[str, str]:
    require_session(pm_session)
    return {"username": USERNAME}


@app.post("/api/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@app.get("/api/board", dependencies=[Depends(require_session)])
def get_board() -> dict:
    return board.board()


@app.patch("/api/columns/{column_id}", dependencies=[Depends(require_session)])
def rename_board_column(column_id: str, payload: ColumnRequest) -> dict:
    return board.rename_column(column_id, payload.title)


@app.post("/api/columns/{column_id}/cards", dependencies=[Depends(require_session)])
def add_board_card(column_id: str, payload: CardRequest) -> dict:
    return board.create_card(column_id, payload.title, payload.details)


@app.patch("/api/cards/{card_id}", dependencies=[Depends(require_session)])
def edit_board_card(card_id: str, payload: CardRequest) -> dict:
    return board.update_card(card_id, payload.title, payload.details)


@app.delete("/api/cards/{card_id}", dependencies=[Depends(require_session)])
def remove_board_card(card_id: str) -> dict:
    return board.delete_card(card_id)


@app.post("/api/cards/{card_id}/move", dependencies=[Depends(require_session)])
def move_board_card(card_id: str, payload: MoveRequest) -> dict:
    return board.move_card(card_id, payload.column_id, payload.position)


@app.get("/api/messages", dependencies=[Depends(require_session)])
def get_messages() -> list[dict[str, str]]:
    return board.messages()


@app.post("/api/chat", dependencies=[Depends(require_session)])
def send_chat(payload: ChatRequest) -> dict:
    try:
        return chat.ask(payload.message)
    except (ValueError, httpx.HTTPError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/")
def serve_frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
