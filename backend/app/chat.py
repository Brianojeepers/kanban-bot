import json
import os
from datetime import date
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from app import board
from app.db import NotFoundError, connection


SYSTEM_PROMPT = """You manage a Kanban board. Reply with a JSON object: {"response": "<message to the user>", "operations": [...]}.
Each operation is a flat object using exactly one of these shapes, with ids taken from the board:
{"action": "create_card", "column_id": "<column id>", "title": "<title>", "details": "<details>", "priority": <priority>, "due_date": <due date>, "assignee": <assignee>, "labels": <labels>}
{"action": "edit_card", "card_id": "<card id>", "title": "<title>", "details": "<details>", "priority": <priority>, "due_date": <due date>, "assignee": <assignee>, "labels": <labels>}
{"action": "move_card", "card_id": "<card id>", "column_id": "<column id>", "position": <0-based index in the destination column>}
{"action": "delete_card", "card_id": "<card id>"}
A priority is "low", "medium", "high" or null, and a due date is a "YYYY-MM-DD" string or null, an assignee is one of the board's members (a username) or null, and labels is a list of up to 5 short tags (reuse the board's existing labels where they fit). Today is {today}.
In edit_card, include only the fields that change; the others keep their current values.
Use an empty operations array when the board should not change.
A card created in this reply has no id yet, so never edit, move or delete it in the same reply; create it with its final title, details and column instead.
Write the response as short plain text for a chat bubble: no Markdown, and refer to cards and columns by title, never by id."""
# Only recent turns are sent: the board snapshot already carries the current state, and the
# full history would grow the cost of every request until it exceeded the model's context.
HISTORY_LIMIT = 20


class CreateCard(BaseModel):
    action: Literal["create_card"]
    column_id: str
    title: board.Title
    details: board.Details = ""
    priority: board.Priority | None = None
    due_date: date | None = None
    assignee: str | None = None
    labels: board.Labels = []


class EditCard(BaseModel):
    action: Literal["edit_card"]
    card_id: str
    title: board.Title = ""
    details: board.Details = ""
    priority: board.Priority | None = None
    due_date: date | None = None
    assignee: str | None = None
    labels: board.Labels = []

    def changes(self) -> dict:
        """Only the fields the model sent, so the ones it left out keep their values."""
        return self.model_dump(include=self.model_fields_set - {"action", "card_id"})


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


def ask(board_id: int, user_id: int, message: str) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("OPENROUTER_API_KEY is not configured")
    payload = {
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.replace("{today}", date.today().isoformat())},
            *({"role": turn["role"], "content": turn["content"]} for turn in board.messages(board_id)[-HISTORY_LIMIT:]),
            {"role": "user", "content": f"Board: {json.dumps(board.board(board_id))}\nQuestion: {message}"},
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
        with connection() as database:
            for operation in reply.operations:
                match operation:
                    case CreateCard(): action = board.create_card(database, board_id, operation.column_id, operation.title, operation.details, operation.priority, operation.due_date, operation.assignee, operation.labels)
                    case EditCard(): action = board.update_card(database, board_id, operation.card_id, operation.changes())
                    case MoveCard(): action = board.move_card(database, board_id, operation.card_id, operation.column_id, operation.position)
                    case DeleteCard(): action = board.delete_card(database, board_id, operation.card_id)
                board.record(database, board_id, user_id, action and f"{action} (via assistant)")
    except NotFoundError as error:
        raise ValueError("The AI referred to a card, column or member that does not exist. Please try again.") from error
    board.add_message(board_id, "user", message, user_id)
    board.add_message(board_id, "assistant", reply.response)
    return {"response": reply.response, "board": board.board(board_id), "messages": board.messages(board_id)}