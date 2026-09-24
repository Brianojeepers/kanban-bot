import json
import os

import httpx

from app import board


SYSTEM_PROMPT = """You manage a Kanban board. Reply with a JSON object: {"response": "<message to the user>", "operations": [...]}.
Each operation is a flat object using exactly one of these shapes, with ids taken from the board:
{"action": "create_card", "column_id": "<column id>", "title": "<title>", "details": "<details>"}
{"action": "edit_card", "card_id": "<card id>", "title": "<title>", "details": "<details>"}
{"action": "move_card", "card_id": "<card id>", "column_id": "<column id>", "position": <0-based index in the destination column>}
{"action": "delete_card", "card_id": "<card id>"}
Use an empty operations array when the board should not change.
Write the response as short plain text for a chat bubble: no Markdown, and refer to cards and columns by title, never by id."""


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
    response = httpx.post("https://openrouter.ai/api/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=30)
    response.raise_for_status()
    result = json.loads(response.json()["choices"][0]["message"]["content"])
    if not isinstance(result.get("response"), str) or not isinstance(result.get("operations", []), list):
        raise ValueError("Invalid AI response")
    with board.connection() as database:
        for operation in result["operations"]:
            action = operation.get("action")
            if action == "create_card": board.create_card(database, operation["column_id"], operation["title"], operation.get("details", ""))
            elif action == "edit_card": board.update_card(database, operation["card_id"], operation["title"], operation.get("details", ""))
            elif action == "move_card": board.move_card(database, operation["card_id"], operation["column_id"], operation["position"])
            elif action == "delete_card": board.delete_card(database, operation["card_id"])
            else: raise ValueError("Invalid AI operation")
    board.add_message("user", message)
    board.add_message("assistant", result["response"])
    return {"response": result["response"], "board": board.board(), "messages": board.messages()}