import math
import threading
from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException


class RateLimiter:
    """Allows `limit` calls per key in any rolling `window` of seconds. In memory: the app runs one process."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self.calls: defaultdict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        """Raises 429 if `key` has used up its calls in the current window."""
        with self.lock:
            now = monotonic()
            calls = self.calls[key]
            while calls and calls[0] <= now - self.window:
                calls.popleft()
            if len(calls) >= self.limit:
                wait = math.ceil(self.window - (now - calls[0]))
                raise HTTPException(status_code=429, detail=f"Too many requests. Try again in {wait} seconds.", headers={"Retry-After": str(wait)})

    def record(self, key: str) -> None:
        with self.lock:
            self.calls[key].append(monotonic())


# Only failed sign-ins count, so signing in and out repeatedly is never blocked.
login_limiter = RateLimiter(limit=10, window=60)
chat_limiter = RateLimiter(limit=10, window=60)
