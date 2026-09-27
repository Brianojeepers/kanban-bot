# Code Review (Claude)

Scope: all source in `backend/`, `frontend/`, `scripts/`, `Dockerfile`, `compose.yaml`, and the architecture notes in `AGENTS.md`. The existing review documents in `docs/` were not read.

Baseline at the time of review (commit `9e557f3`):

- Backend: 64 tests pass, 98% coverage with branch coverage.
- Frontend: 40 Vitest tests pass, 93% statements / 86% branches. `npm run lint` is clean.
- `KanbanBoard.tsx` has the lowest coverage (72% statements, 50% branches). The uncovered lines are the drag handlers (`collisionDetection`, `handleDragStart`, `handleDragEnd`), which is where finding 1 is.

Findings are ordered by severity.

---

## High

### 1. A card cannot be dragged down within its column

`frontend/src/lib/kanban.ts:27-29`

```ts
const remainingCardIds = targetColumn.cardIds.filter((cardId) => cardId !== activeId);
const position = targetColumn.id === overId ? remainingCardIds.length : remainingCardIds.indexOf(overId);
if (targetColumn.id === sourceColumn.id && sourceColumn.cardIds.indexOf(activeId) === position) return null;
```

For a move within the same column, the position is the index of the hovered card after the dragged card has been removed. When moving down, that index is one less than the slot the sortable preview shows.

- Column `[A, B, C]`, drag A onto B (one step down): `remaining = [B, C]`, `indexOf(B) = 0`, which equals A's current index, so the function returns `null` and nothing happens. **With the pointer, a card cannot be moved down by one place.** The only other way is to drop on the column's empty area, which moves it to the end.
- Drag A onto C: the `verticalListSortingStrategy` preview shows `[B, C, A]`, but the drop gives position 1, so the result is `[B, A, C]`. The card lands one slot above where the preview showed it.
- Moving up and moving between columns are correct.

The unit test `kanban.test.ts:21` asserts the current behavior (`card-1` over `card-3` gives position 1), so the tests do not catch this. The Playwright tests only move cards between columns.

Fix: use the hovered card's index in the original list. For a move within a column this matches `arrayMove` and the preview. For a move between columns it is the same as today, because the dragged card is not in the target list.

```ts
const position = targetColumn.id === overId
  ? targetColumn.cardIds.filter((cardId) => cardId !== activeId).length
  : targetColumn.cardIds.indexOf(overId);
```

Then update the test to expect `[B, C, A]`-style results, and add a test for "one step down".

---

## Medium

### 2. An AI "edit" that leaves out `details` erases the card's details

`backend/app/chat.py:32-36`, `backend/app/main.py:37-39`

`EditCard.details` and `CardRequest.details` default to `""`, and `update_card` writes that value unconditionally. If the model returns `{"action": "edit_card", "card_id": "...", "title": "New name"}` for a request like "rename card X", the card's details are silently cleared. The prompt asks for every field, but models regularly leave out fields they are not changing. The HTTP `PATCH /api/cards/{id}` has the same semantics, although the frontend always sends both fields.

It is also inconsistent with creating a card, where empty details become `"No details yet."` (`board.py:114`) but editing can store `""`.

Fix: make `details` optional (`str | None = None`) on edit, and keep the existing value when it is `None` (`COALESCE(?, details)`).

### 3. Pressing Enter while a chat message is sending sends a second message

`frontend/src/components/ChatSidebar.tsx:45-47, 68`

The Send button is disabled while a message is sending, but `sendOnEnter` calls `form.requestSubmit()`. That submits the form whether or not the submit button is disabled. `send` does not check `isSending`. A second request then races the first:

- Each request uses up chat rate-limit quota and an OpenRouter call.
- Each call captures its own `history` snapshot. If one fails, `setMessages(history)` can remove the other's optimistic message, or bring back a stale list.
- The two replies can apply board operations based on the same stale board snapshot.

Fix: `if (!message || isSending) return;` at the top of `send`.

### 4. No size limits on chat messages or card text, which drive AI cost

`backend/app/main.py:37-48`, `backend/app/board.py:24`, `backend/app/chat.py:65`

`ChatRequest.message`, card `title` and `details`, and column titles have no maximum length. The rate limits count requests, not tokens. Every chat request sends the whole board as JSON plus 20 history messages, so:

- A single 1 MB chat message is accepted and forwarded to OpenRouter (it will fail or be expensive).
- Large card text makes every later chat request larger. Because the AI can create cards, a single reply can also add large cards.
- Oversized history messages are stored and resent in later requests until they fall out of the 20-message window.

Fix: add `max_length` constraints (for example 200 for titles, 2000 for details, 2000 for chat messages) with `StringConstraints` / `Field`, and matching `maxLength` on the inputs.

### 5. Read-then-write board mutations are not isolated

`backend/app/board.py:128-138` (also `delete_card`, `create_card`)

Python's `sqlite3` in its default mode opens a transaction only at the first write. `_require_card` (which reads `position`) and the `COUNT(*)` in `create_card` run before that. FastAPI runs sync endpoints in a thread pool, so two concurrent mutations (such as fast successive drags, or a drag while a chat reply is applying operations) can both read the same positions and then write one after the other. The result is duplicate or missing `position` values in a column. Nothing renumbers them afterwards, because the `user_version` migration runs only once.

The risk is small for one user, but it is exactly the class of bug the `user_version = 1` renumbering migration was added to clean up.

Fix: start the write transaction up front in `connection()`, for example `sqlite3.connect(path, isolation_level=None)` followed by `BEGIN IMMEDIATE`, or `database.execute("BEGIN IMMEDIATE")` before the yield.

---

## Low

### 6. The card edit form has no Cancel

`frontend/src/components/KanbanCard.tsx:34`

Once Edit is clicked, the Edit button is hidden and the form has only Save. The only way out is to save, which sends a PATCH even when nothing changed. Add a Cancel button (or Escape) that calls `setIsEditing(false)`. While editing, the Move handle is also still active.

### 7. A failed column rename leaves the unsaved title in the input

`frontend/src/components/KanbanColumn.tsx:34-38`, `frontend/src/components/KanbanBoard.tsx:77`

If `renameColumn` fails, `column.title` does not change, so the reset in `KanbanColumn` does not run. The input keeps the rejected title, so it looks saved apart from the error line. Also, Escape does not revert an edit in progress.

### 8. Sign-in and sign-out do not handle network errors

`frontend/src/components/AuthGate.tsx:19-39`

If `fetch("/api/login")` rejects (server stopped), the rejection is unhandled and the user sees nothing. If `fetch("/api/logout")` rejects, the user stays signed in and is not told why. Wrap both in `try/catch` and set `error`.

### 9. Sessions never expire and logout does not revoke them

`backend/app/auth.py:14-28`

The token is `user.<HMAC(user)>`: deterministic, with no expiry and no nonce. Every login issues the same token, and a copied cookie stays valid until `SESSION_SECRET` is changed. `logout` only asks the browser to delete the cookie. This is acceptable for a local-only MVP, but it should be fixed before multiple users are added: include an issued-at timestamp in the signed payload and reject tokens older than N days. The password check (`credentials.password != PASSWORD`) is also not constant-time; use `hmac.compare_digest` there too.

### 10. Rate-limit check and record are not atomic

`backend/app/main.py:140-143`, `backend/app/rate_limit.py:26-39`

`check` and `record` take the lock separately, and the chat route checks both limiters before recording either. N concurrent requests can all pass `check` before any `record`, so they go over the limit. Combining them into one `hit(key)` method that checks and appends under one lock is simpler and correct. Separately, `self.calls[key]` on a `defaultdict` creates an empty entry for every key that is checked, and the entry is never removed. That is unbounded growth keyed by client address, which is negligible while the app only listens on localhost.

In Docker with the default userland proxy, `request.client.host` is the bridge gateway address for every client, so the login limit is effectively global rather than per client. This is fine for localhost, but the "per client address" wording in `AGENTS.md` is not accurate there.

### 11. Chat responses return the full message history every time

`backend/app/chat.py:91`, `backend/app/main.py:133-135`

`/api/chat` and `/api/messages` return every stored message, with no limit. The payload grows for the lifetime of the database. Returning only the two new messages from `/api/chat` (the frontend already holds the rest), and limiting `/api/messages`, keeps it bounded.

### 12. OpenRouter timeout of 30s is tight for a reasoning model

`backend/app/chat.py:70`

`gpt-oss-120b` is a reasoning model, and replies with several operations can take longer than 30s. When that happens the user gets a 502, and the request has already been counted against both chat limits. Consider 60s, or setting `reasoning.effort` low in the payload.

### 13. Out-of-order responses can overwrite newer board state

`frontend/src/components/KanbanBoard.tsx:47-55, 68-75`

Each mutation replaces the whole board with its response. If two requests are in flight (two quick drags, or a drag during a chat reply), the one that finishes last wins, even if it reflects an older state. On failure, the move reverts to the `board` captured at drag time, which can discard a change that succeeded in the meantime. This is acceptable for an MVP. The simple fix is to discard responses from requests older than the latest one (a request counter in a ref).

---

## Documentation and consistency

- `AGENTS.md` says `initialize()` "runs on each read". It runs once, in the FastAPI `lifespan` (`main.py:20-22`), and in the test fixture. Update the sentence.
- `AGENTS.md` says stopping "keeps the `pm_data` volume". Compose prefixes the project name, so the actual volume is `pm_pm_data`, as the README says.
- `AGENTS.md` says the login limit is "per client address". See finding 10 for how that works inside Docker.
- The local backend venv runs Python 3.14 while the Docker image uses 3.13. `requires-python = ">=3.13"` allows both, but tests are not run on the version that ships. Consider pinning with `.python-version` (3.13).

## Simplifications

- `board.messages()` orders by `created_at, id`. `created_at` has one-second resolution and `id` is already monotonic, so `ORDER BY id` is enough.
- `board.board()` orders the card dict query by `position`, which has no effect (the dict is keyed by id, and order comes from the per-column queries). It also runs one query per column. A single `SELECT ... ORDER BY column_id, position` that is grouped in Python removes both.
- `KanbanBoard`'s `onLogout` prop is optional, but `AuthGate` always passes it. Make it required and drop the conditional render.
- `Dockerfile:27` runs `chown -R /data` as root on every start, to migrate volumes from an older image that ran as root. Once existing volumes have been migrated, `RUN mkdir /data && chown app:app /data` plus `USER app` removes the `sh -c` / `setpriv` wrapper.

## Tests

- Add unit tests for `KanbanBoard`'s `handleDragEnd` (optimistic move, then revert on failure). These are the least covered lines in the frontend and contain finding 1.
- Add a Playwright test that reorders cards within a column, both up and down. All current drag tests move between columns.
- `test_main.py` uses a module-level `client` whose cookie jar is shared between tests (`test_login_creates_a_valid_session`, `test_logout_clears_the_session_cookie`). That makes those tests depend on order. Use `signed_in_client()` or a fresh `TestClient` in each test.
- `test_session_rejects_invalid_cookie` passes `cookies=` per request, which Starlette has deprecated (warning in the test output). Set the cookie on the client instance instead.
- `test_startup_creates_the_database` checks only that one write succeeds. It could also check that the five columns were seeded in the fresh file.
- The E2E suite runs against the live Docker app and writes to the real `pm_pm_data` board. Cleanup relies on title regexes in `afterEach`. If a run fails partway, leftover cards can remain. Consider running E2E against a separate `DATABASE_PATH` or a throwaway volume.

## What is working well

- Board ownership is checked in every data function (`_require_column` / `_require_card` join through `board_id`), and there are HTTP and AI tests for access to another user's board.
- AI output is validated with a discriminated union, and every operation in a reply is applied in a single transaction, so an invalid reply changes nothing. Tests cover this for a wide range of malformed replies.
- One board service is shared by the HTTP routes and the AI operations, and every mutation returns the full board, which keeps the frontend state simple.
- The keyboard drag support (`columnKeyboardCoordinates`) and screen reader announcements by title are unusually thorough for an MVP.
- Security basics are in place: an HTTP-only cookie, the app refuses to start without a secret, it binds to localhost only, the server runs as a non-root user, and `.env` is excluded from the Docker build context.
