import json

import httpx
from openai import AsyncOpenAI

from app import chat


def mock_provider(monkeypatch, reply, status: int = 200) -> list[dict]:
    """Answer every Chat Completions request with `reply` (a dict, or a raw content string)
    and return the request bodies the Agents SDK sends, in order."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    requests: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        if status != 200:
            return httpx.Response(status, json={"error": {"message": "Rate limited"}})
        content = reply if isinstance(reply, str) else json.dumps(reply)
        return httpx.Response(200, json={"id": "test", "object": "chat.completion", "created": 0, "model": chat.MODEL, "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]})

    def client(**kwargs) -> AsyncOpenAI:
        return AsyncOpenAI(**kwargs, max_retries=0, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    monkeypatch.setattr(chat, "AsyncOpenAI", client)
    return requests
