# Code Review

Date: 2026-09-24. Commit reviewed: `22f75bc` (`main`).

## Scope and method

Every tracked source, test, config, script and document was read: `backend/app`, `backend/tests`, `frontend/src`, `frontend/tests`, `Dockerfile`, `compose.yaml`, `scripts/`, `docs/`, the `AGENTS.md` files, `review.md` and `explainer.md`.

Each finding below marked **Reproduced** was confirmed by running it, not just by reading code. The checks used a scratch SQLite database with FastAPI's test client, the Docker app driven through Playwright, `next dev`, `npm audit` and `pip-audit`. The live database was backed up before the checks and restored afterwards.

State at review time:

| Check | Result |
|---|---|
| Backend tests | 17 passed, 97.25% coverage |
| Frontend unit tests | 19 passed, 88.64% statements, 83.76% branches |
| Lint | Clean |
| E2E against Docker | 4 passed |
| `pip-audit` (backend) | No known vulnerabilities |
| `npm audit` (frontend) | 20 advisories (3 critical, 12 high); see M8 |

Overall the MVP works end to end and the code is small and readable. The most important problems are:
- **Security:** anyone on the local network can forge a login.
- **Data loss:** renaming a column loses characters.
- **Card order:** new cards go to the top of demo columns.
- **AI chat:** malformed AI replies cause unhandled 500 errors.
- **Local dev:** the dev workflow described in the docs cannot work.

## Findings summary

| ID | Severity | Area | Finding |
|---|---|---|---|
| H1 | High | Security | Session cookie can be forged with the public default secret, and the app listens on all network interfaces |
| H2 | High | Frontend | Column rename sends one request per keystroke and loses characters |
| H3 | High | Backend | New cards are inserted at the top of seeded columns, not the bottom |
| H4 | High | Backend | Malformed AI replies cause unhandled 500 errors |
| M1 | Medium | Build | Docker build ignores `uv.lock`, and there is no `.dockerignore` |
| M2 | Medium | Backend | Board queries ignore the signed-in user; messages are not scoped to a board |
| M3 | Medium | Backend | Unknown IDs silently succeed or cause a 500; empty titles accepted |
| M4 | Medium | Tooling | `npm run dev` and the default E2E run cannot reach the API |
| M5 | Medium | Backend | Full chat history is sent to the model on every request, without limit |
| M6 | Medium | Frontend | Hardcoded demo board is shown before loading and after load failures |
| M7 | Medium | Accessibility | Cards cannot be moved with the keyboard; nested interactive elements |
| M8 | Medium | Dependencies | Outdated `next` and `vitest` with known advisories |
| L1 | Low | Security | Sessions never expire and logout does not revoke them |
| L2 | Low | Frontend | Board remounts after every chat reply, discarding open forms |
| L3 | Low | Frontend | Missing error handling on several fetches; errors never clear |
| L4 | Low | Backend | Schema setup runs on every read, but not before writes |
| L5 | Low | Code health | Dead code (`moveCard`, `createId`) and documentation drift |
| L6 | Low | Code health | Leftover smoke-test page and redundant `/` route |
| L7 | Low | Frontend | Drag preview size and missing optimistic update |
| L8 | Low | Build | Container runs as root |
| L9 | Low | Docs | Stale root documents and missing root README |
| L10 | Low | Tests | Gaps in test coverage of real behaviour |

## High

### H1. Session cookie can be forged, and the app is exposed on the network

**Reproduced.**
- `backend/app/auth.py:12` falls back to the secret `local-development-secret` when `SESSION_SECRET` is unset. The root `.env` only defines `OPENROUTER_API_KEY`, so the running app uses that public fallback.
- The session token is `user.` followed by `HMAC(secret, "user")`, so anyone who has read the repository can compute a valid cookie.
- `compose.yaml:6` publishes `"8000:8000"`, which binds to all interfaces (`docker compose port app 8000` shows `0.0.0.0:8000`).

Evidence:
- A cookie computed from the default secret, with no login, got `GET /api/board` 200 from the Docker app.
- `GET /api/health` on the machine's LAN address returned 200.

Impact: anyone on the same network can read and change the board and use `/api/chat`, which spends money on the OpenRouter key.

Actions:
1. Bind to localhost only: `ports: ["127.0.0.1:8000:8000"]`.
2. Remove the fallback secret. Read `SESSION_SECRET` from the environment and fail at startup if it is missing. Add it to `.env` and document it next to `OPENROUTER_API_KEY`.

### H2. Column rename sends a request per keystroke and loses characters

**Reproduced.**
- `KanbanColumn.tsx:44-46` binds the input's `value` to `column.title` from server state.
- `onChange` calls `onRename`, which awaits the `PATCH` and only then updates state (`KanbanBoard.tsx:80-82`).
- Every keystroke is a request, and the input only shows what the last completed response returned.

Evidence (Playwright, typing " and shipped" onto "Done"):
- No added latency: 12 requests for 12 characters.
- A 150ms API delay: the input showed, and the database saved, `Doneahd`.

A failed request also leaves the input impossible to edit, and clearing the field saves an empty title.

Action: keep a local draft in `KanbanColumn` and send one rename on blur or Enter. Skip the request if the trimmed title is empty or unchanged. Add a unit test that types several characters and asserts one call with the full title.

### H3. New cards go to the top of seeded columns

**Reproduced.**
- The seed at `board.py:54-57` numbers card positions across all columns (0 to 7) instead of within each column. For example, `card-3` is the only card in Discovery but has position 2.
- `create_card` (`board.py:75-77`) sets the new position to the column's card count.

Evidence: on a fresh database, adding "NEW" to Discovery produced `['NEW', 'Prototype analytics view']` instead of appending it.

The same applies to In Progress, Review and Done. Moves also shift positions around the gaps.

Actions:
1. Seed positions per column.
2. Make `create_card` use `COALESCE(MAX(position) + 1, 0)` instead of `COUNT(*)`, which does not depend on positions having no gaps.
3. Existing databases already contain these gaps. Renumber each column's positions once, e.g. with `ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY position) - 1`.
4. Add a backend test: create a card in a seeded column and assert it is last.

### H4. Malformed AI replies cause unhandled 500 errors

**Reproduced.** `chat.ask` (`chat.py:34-44`) only checks that `response` is a string and `operations` is a list. `send_chat` (`main.py:117-122`) only catches `ValueError` and `httpx.HTTPError`. With a mocked model reply, every one of these cases returned an unhandled **500**:
- a `create_card` for an unknown column (`sqlite3.IntegrityError`)
- a missing `title` (`KeyError`)
- `details: null` (NOT NULL `IntegrityError`)
- a reply that is a JSON list
- an operation that is a string
- a non-numeric `position`

The transaction does roll back, so no partial writes happen. `PLAN.md` Part 9 requires "Validate all model output before changing data".

Actions:
1. Define the reply as a Pydantic model: `response: str` plus `operations` as a discriminated union on `action`, with typed fields for each of the four shapes. Validate before applying anything.
2. Catch `pydantic.ValidationError`, `KeyError`, `json.JSONDecodeError` and `sqlite3.IntegrityError`, and map them to 502 with a clear message.
3. Include the model's reason in the chat error bubble instead of the generic "Unable to send message."
4. Extend `test_chat_rejects_missing_key_and_invalid_operations` with the cases above.

## Medium

### M1. Docker build ignores `uv.lock`, and there is no `.dockerignore`

**Confirmed from files.**
- `Dockerfile:15-16` copies only `pyproject.toml` before `uv sync`, so `uv.lock` is never used. Each build resolves the newest versions allowed by the `>=` ranges, so builds are not reproducible.
- There is no `.dockerignore`, so the whole repository is sent as build context. That includes `.env`, `.git`, `backend/.venv` (36 MB) and `frontend/node_modules` (484 MB).
- `COPY frontend ./` at `Dockerfile:8` then copies the host's macOS `node_modules` over the Linux ones that `npm ci` just installed. The build only works because the Linux-only packages are not overwritten.

Actions:
1. Copy `uv.lock` alongside `pyproject.toml` and run `uv sync --locked --no-dev --no-install-project`.
2. Add a `.dockerignore` listing `.git`, `.env`, `**/node_modules`, `**/.venv`, `frontend/.next`, `frontend/out`, `frontend/coverage`, `frontend/test-results` and `**/__pycache__`.

### M2. Board queries ignore the signed-in user

**Confirmed from code.**
- `require_session` validates the cookie but does not pass the username on.
- Every query in `board.py` hardcodes `users.username = 'user'` (lines 63, 114).
- `messages()` (`board.py:107`) selects all messages, not just the board's.
- `update_card`, `delete_card`, `rename_column` and `move_card` accept any ID without checking it belongs to the user's board.

This contradicts `backend/AGENTS.md`: "Every board operation must use the authenticated user identity." It is harmless with one user, but it becomes a data leak as soon as a second user exists.

Action: have `require_session` return the username and pass it, or the resolved `board_id`, into every `board.py` function. Scope the `SELECT`, `UPDATE` and `DELETE` statements by board. Filter `messages` by `board_id`.

### M3. Unknown IDs and empty titles are not rejected

**Reproduced.**
- `PATCH /api/cards/nope`, `DELETE /api/cards/nope` and `PATCH /api/columns/nope` all return 200 and do nothing.
- `POST /api/columns/nope/cards` returns an unhandled 500 (foreign key `IntegrityError`).
- An empty column title and an empty card title are both accepted with 200.

Actions:
1. Check `cursor.rowcount` in the board functions and return 404 for missing rows. Convert `IntegrityError` to 404.
2. Add `Field(min_length=1)` to `title` in `ColumnRequest` and `CardRequest`, applied after stripping whitespace.
3. Add tests for each case.

### M4. `npm run dev` and the default E2E run cannot reach the API

**Reproduced.**
- `next dev` serves the page, but `GET /api/session` and `POST /api/login` return 404, because nothing proxies `/api` to FastAPI (`next.config.ts` has no rewrites).
- `playwright.config.ts:15-20` starts `next dev` when `PLAYWRIGHT_BASE_URL` is unset, so `npm run test:e2e` as documented fails at sign-in.
- `frontend/README.md` and `AGENTS.md` describe both as working.

Actions:
1. Default `baseURL` in `playwright.config.ts` to `http://localhost:8000` and drop the `webServer` block, so E2E always targets the Docker app.
2. For UI work, either add a development-only rewrite of `/api/:path*` to `http://localhost:8000`, or document that `npm run dev` needs the backend running and a proxy.
3. Update `frontend/README.md` and `AGENTS.md` to match.

### M5. Unlimited chat history is sent to the model

**Confirmed from code.** `chat.py:27` sends `board.messages()` in full, plus the whole board, on every request. As the history grows, cost and latency grow with it, and requests will eventually exceed the model's context window and fail. Every failure then looks like a generic chat error.

Action: send only the most recent messages, e.g. the last 20. The board snapshot already carries the current state.

### M6. Hardcoded demo board shown before loading and after failures

**Confirmed from code.**
- `KanbanBoard.tsx:24` starts from `initialData` (`lib/kanban.ts:18-72`) and replaces it when `/api/board` returns. Users therefore briefly see the demo cards.
- If the load fails, they keep seeing fake data under an error message.
- `initialData` uses `col-progress`, but the backend ID is `col-in-progress`, so any interaction before the load finishes targets a column that doesn't exist.

Action: start with `null`, render a loading state, and move `initialData` into the test files as a fixture.

### M7. Cards cannot be moved with the keyboard

**Confirmed from code and the Playwright accessibility snapshot.**
- `KanbanBoard.tsx:32-36` registers only `PointerSensor`, so keyboard users cannot move cards.
- The dnd-kit attributes turn each card `<article>` into `role="button"`, and it contains the Edit and Remove buttons. The snapshot shows a button nested inside a button, which screen readers handle poorly.

Actions:
1. Add `KeyboardSensor` with `sortableKeyboardCoordinates`.
2. Move the drag listeners to a dedicated drag handle, so the card itself is not a button.

### M8. Outdated `next` and `vitest` with known advisories

**Reproduced with `npm audit`.** There are 20 advisories: 3 critical (`next@16.1.6`, `vitest`, `@vitest/coverage-v8`), 12 high and 4 moderate. All have fixes, e.g. `next@16.3.6`.

The Next.js server is not used at runtime, because the site is a static export served by FastAPI. The Next.js advisories (rewrites smuggling, image cache) therefore affect build and dev tooling rather than the running app. `AGENTS.md` still asks for the latest library versions.

Action: upgrade `next` and `eslint-config-next` to the latest 16.x, and `vitest` and `@vitest/coverage-v8` to the latest. Run `npm audit fix`, then rerun all tests.

## Low

### L1. Sessions never expire and logout does not revoke them

**Reproduced.** The token is the same for ever (`auth.py:16-17`). A cookie captured before logout still returned 200 afterwards, because `/api/logout` only asks the browser to delete it.

Action: sign an expiry time into the token, reject expired tokens, and set `max_age` on the cookie. Rotating `SESSION_SECRET` invalidates all sessions.

### L2. Board remounts after every chat reply

**Confirmed from code.** `AuthGate.tsx:37` changes the `key` on `KanbanBoard` after each reply. That remounts the board, which:
- refetches the board, although `/api/chat` already returns it
- discards any open add-card or edit form
- clears any error

This happens even when the reply made no changes.

Action: lift the board state into `AuthGate`, or pass the returned board down, and update it only when it has changed.

### L3. Missing error handling on some fetches

**Confirmed from code.**
- `AuthGate.tsx:13` has no `catch`. A network error leaves `isSignedIn` as `null`, which renders a blank page.
- The `ChatSidebar.tsx` history fetch has no `catch`.
- `KanbanBoard`'s `error` is never cleared after a later operation succeeds.

Action: handle rejections and show a message, and clear `error` when an operation succeeds.

### L4. Schema setup runs on every read, but not before writes

**Reproduced during earlier work.**
- `board()`, `messages()` and `add_message()` call `initialize()`, which runs the `CREATE TABLE` script on every request.
- The mutation endpoints don't call it, so a write to a fresh database returns 500 ("no such table: cards").

Action: run `initialize()` once in a FastAPI `lifespan` handler at startup, and remove the per-call invocations.

### L5. Dead code and documentation drift

**Confirmed with grep.**
- `moveCard` and `createId` in `lib/kanban.ts:74-168` are not used by the app; `KanbanBoard` computes moves itself.
- `moveCard` is still unit-tested, which inflates the coverage figures.
- `frontend/AGENTS.md` still calls `moveCard` "the source of truth for same-column ordering".

Action: delete both functions and their tests, and update `frontend/AGENTS.md`.

### L6. Leftover smoke-test page and redundant route

**Confirmed from code.**
- `backend/static/index.html` is the Part 2 smoke-test page, and the Docker build replaces it.
- `test_root_serves_the_smoke_test_page` asserts on that page, so it tests something users never see.
- `main.py:125-127` defines `GET /` although the `StaticFiles(html=True)` mount at line 130 already serves `index.html`.

Action: remove the explicit `/` route. Replace the smoke page with a minimal placeholder, or build the frontend before backend tests, and update the test to match.

### L7. Drag preview size and missing optimistic update

**Observed while fixing the E2E test.**
- The drag preview is fixed at 260px wide (`KanbanBoard.tsx:163`), but columns render cards about 163px wide, so the preview doesn't match the card.
- There is no optimistic update: the dropped card animates back to where it started, then jumps once the API responds.

Action: size the preview to the card's measured width, and apply `moveCard`-style local state before the request (roll back if it fails). This would also give the existing helper a use.

### L8. Container runs as root

The runtime stage has no `USER`. For a local tool the risk is small, but it is a one-line change.

Action: add a non-root user that owns `/app` and `/data`.

### L9. Stale root documents and missing root README

- `review.md` and `explainer.md` sit at the repository root, while `AGENTS.md` says planning documents belong in `docs/`.
- `review.md` still lists "The AI operation loop is not atomic", which has since been fixed (see below).
- There is no root `README.md`, and `frontend/README.md` gives the incorrect instructions from M4.

Action:
1. Move both files into `docs/` and update or remove the fixed item.
2. Add a minimal root `README.md`: prerequisites, `.env` keys (`OPENROUTER_API_KEY`, `SESSION_SECRET`), start and stop scripts, and test commands.
3. Document resetting local data with `docker volume rm pm_pm_data`.

### L10. Test coverage gaps

The coverage figures are high, but several real behaviours are untested:
- column rename while typing (H2)
- card order after creating a card (H3)
- malformed AI replies (H4)
- unknown IDs and empty titles (M3)
- keyboard interaction (M7)
- E2E for sign-in failure, card edit and delete, and chat (the chat can use a Playwright route mock so it stays free and deterministic)

Action: add a test with each fix above, as listed in its action.

## Status of the earlier `review.md`

| Item | Status |
|---|---|
| AI operation loop not atomic | Fixed. Operations run in one transaction, covered by `test_chat_applies_no_operations_when_any_is_invalid` |
| Session secret insecure default | Still open. Now shown to be exploitable in the current setup (H1) |
| Hardcoded credentials | Open by design for the MVP |
| No rate limiting on login and chat | Open. Lower priority once H1 is fixed |
| No CSRF token beyond `SameSite=Lax` | Open. Acceptable for localhost |
| No migrations, backups, CI, logging | Open. Relevant only beyond local use |
| Leftover test data from E2E runs | Fixed. The E2E suite now deletes its cards after each test |

## Action plan

In priority order. Each step should add the tests named in its finding and keep all suites green.

1. **Secure the local deployment (H1).** Bind to `127.0.0.1`, require `SESSION_SECRET`, and add it to `.env`.
2. **Fix column rename (H2).** Keep a local draft, save on blur or Enter, and ignore empty titles.
3. **Fix card positions (H3).** Seed per column, use `MAX(position) + 1`, and renumber existing data once.
4. **Validate AI replies (H4).** Use a Pydantic model for the reply and map every failure to 502 with a clear message.
5. **Validate the API (M3).** Return 404 for unknown IDs and require non-empty titles.
6. **Make builds reproducible (M1).** Use `uv sync --locked` and add a `.dockerignore`.
7. **Fix the dev and E2E workflow (M4).** E2E targets Docker by default, and the docs match.
8. **Upgrade dependencies (M8).** Then rerun everything.
9. **Scope data to the user (M2).** Do this before any second user exists.
10. **Bound chat history (M5).**
11. **Frontend robustness (M6, L2, L3).** Add a loading state instead of demo data, and handle fetch errors.
12. **Accessibility (M7).** Add a keyboard sensor and a drag handle.
13. **Clean-up (L4-L9).** Initialize at startup, remove dead code and the smoke page, run as non-root, and tidy the docs.

## Resolution

Every item above was fixed on 2026-09-24. Each fix has tests that fail without it, and was checked in the running Docker app.

| ID | Commit | Notes |
|---|---|---|
| H1 | `3a81ef5` | A forged cookie now gets 401. The port is bound to `127.0.0.1` and the app refuses to start without `SESSION_SECRET`. |
| H2 | `3c481fb` | One rename request when editing finishes. The original case now saves "Done and shipped" instead of "Doneahd". |
| H3 | `978f3aa` | Positions are kept at 0..n-1 per column. Existing databases are renumbered once, keeping each column's order. |
| H4 | `6b036bd` | AI replies are validated with Pydantic before anything is applied. Failures return a readable 502. |
| M1 | `be93d5e` | Builds use `uv sync --locked` and a `.dockerignore`. |
| M2 | `8fe5b44` | Every board function takes the signed-in username. IDs from another board return 404. |
| M3 | `6ab9c02` | Unknown IDs return 404 and blank titles 422. Also fixed: the model made up IDs for cards created in the same reply. |
| M4 | `b6c249c` | `npm run dev` proxies `/api`, and E2E targets the Docker app by default. |
| M5 | `23d6530` | Only the 20 most recent messages are sent to the model. |
| M6, L2, L3 | `039bd7e` | Loading state instead of demo data. The board updates in place after chat replies. Fetch errors are handled. |
| M7 | `47f7687` | Move handle, keyboard dragging between columns, and announcements by title. |
| M8, L5 | `f2eea23` | `npm audit` is at 0. The upgrade exposed untyped test files and an untested drag handler, both fixed. Dead code removed. |
| L4, L6 | `3e2b33b` | Schema is created once at startup. The redundant `/` route and the smoke page are removed. |
| L7 | `cb5eed0` | Drops show immediately and roll back on failure. The preview matches the card size. |
| L8 | `ed3713c` | The server runs as a non-root user. |
| L9 | This commit | Docs moved into `docs/`, stale statements corrected, root README added. |
| L10 | `8fc315d` plus the tests in each commit above | E2E now covers sign-in failure, edit and delete, and chat. |

Corrections to the review itself:
- **M1** said 484 MB of `node_modules` was sent as build context. BuildKit transfers the context incrementally, so the size sent varied. What was confirmed is that macOS native packages ended up in the Linux build stage.
- **L8** called running as non-root a one-line change. It isn't: existing volumes were created by the root-run image, so a plain `USER` switch would have left the database unwritable. The fix hands `/data` to the app user at startup.

Still open, by design for the local MVP (see `review.md`): hardcoded credentials, no rate limiting, no CI, backups or monitoring. Before a second account is added, the seed needs board-specific column and card IDs.
