import json
import os
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from app import board


SYSTEM_PROMPT = """You manage a Kanban board. Reply with a JSON object: {"response": "<message to the user>", "operations": [...]}.
Each operation is a flat object using exactly one of these shapes, with ids taken from the board:
{"action": "create_card", "column_id": "<column id>", "title": "<title>", "details": "<details>"}
{"action": "edit_card", "card_id": "<card id>", "title": "<title>", "details": "<details>"}
{"action": "move_card", "card_id": "<card id>", "column_id": "<column id>", "position": <0-based index in the destination column>}
{"action": "delete_card", "card_id": "<card id>"}
Use an empty operations array when the board should not change.
A card created in this reply has no id yet, so never edit, move or delete it in the same reply; create it with its final title, details and column instead.
Write the response as short plain text for a chat bubble: no Markdown, and refer to cards and columns by title, never by id."""


class CreateCard(BaseModel):
    action: Literal["create_card"]
    column_id: str
    title: board.Title
    details: str = ""


class EditCard(BaseModel):
    action: Literal["edit_card"]
    card_id: str
    title: board.Title
    details: str = ""


class MoveCard(BaseModel):
    action: Literal["move_card"]
    card_id: str
    column_id: str
    position: int


class DeleteCard(BaseModel):
    action: Literal["delete_card"]
    card_id: str


class Reply(BaseModel):
    response: str
    operations: list[Annotated[CreateCard | EditCard | MoveCard | DeleteCard, Field(discriminator="action")]] = []


def ask(message: str) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("OPENROUTER_API_KEY is not configured")
    payload = {
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *board.messages(),
            {"role": "user", "content": f"Board: {json.dumps(board.board())}\nQuestion: {message}"},
        ],
        "response_format": {"type": "json_object"},
    }
    try:
        response = httpx.post("https://openrouter.ai/api/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=30)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
        raise ValueError("The AI service did not respond correctly. Please try again.") from error
    try:
        reply = Reply.model_validate_json(content)
    except ValidationError as error:
        raise ValueError("The AI returned an invalid reply. Please try again.") from error
    try:
        with board.connection() as database:
            for operation in reply.operations:
                match operation:
                    case CreateCard(): board.create_card(database, operation.column_id, operation.title, operation.details)
                    case EditCard(): board.update_card(database, operation.card_id, operation.title, operation.details)
                    case MoveCard(): board.move_card(database, operation.card_id, operation.column_id, operation.position)
                    case DeleteCard(): board.delete_card(database, operation.card_id)
    except board.NotFoundError as error:
        raise ValueError("The AI referred to a card or column that does not exist. Please try again.") from error
    board.add_message("user", message)
    board.add_message("assistant", reply.response)
    return {"response": reply.response, "board": board.board(), "messages": board.messages()}