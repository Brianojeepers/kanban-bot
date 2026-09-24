import json
import os

import httpx

from app import board


def ask(message: str) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("OPENROUTER_API_KEY is not configured")
    payload = {
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "system", "content": "Return JSON with response (string) and operations (array). Operations may be create_card, edit_card, move_card, or delete_card."},
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