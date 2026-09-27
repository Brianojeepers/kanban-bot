# Code Review

Date: 2026-09-25. Commit reviewed: `9e557f3` (`main`).

## Scope and method

Reviewed the tracked application, tests, configuration, lifecycle scripts, Docker setup, and project documentation. The review covered:

- Backend authentication, API routes, board persistence, chat operations, and rate limiting
- Frontend authentication, board state, chat state, forms, drag-and-drop, and accessibility
- Docker, Compose, start/stop scripts, dependency configuration, and test gates
- Backend and frontend unit/component tests and Playwright coverage
- Agreement between `AGENTS.md`, `docs/PLAN.md`, and the implementation

Source findings marked **Confirmed** were verified by inspection and, where noted, by a focused test run. I did not modify application code or the live database. The untracked `opencode.jsonc` was left untouched.

## Verification

| Check | Result |
|---|---|
| Backend tests | 64 passed; 98.43% aggregate coverage |
| Frontend unit/component tests | 40 passed |
| Frontend lint | Passed |
| Frontend production build | Passed |
| `npm audit` | 0 known vulnerabilities |
| Playwright against the currently running container | Failed: the container served `backend/static/index.html`, not the current Next.js export |

The Playwright failure is a deployment-state issue, not a demonstrated source regression. The captured page contained “The frontend is not built here. The Docker image replaces this file with the Next.js export.” Rebuild and restart the application with `scripts/start.sh` before treating the E2E suite as a current-commit verification result.

## Assessment

The MVP is small, readable, and generally well structured. Authentication, per-user board ownership, fixed-column behavior, structured AI operations, optimistic drag updates, keyboard movement, and secret separation are implemented clearly. Automated backend and frontend tests are substantial, and dependency audit is currently clean.

I found no current high-severity defect for the stated local, single-user MVP. The main risks are response-order races, non-atomic chat persistence, rate-limit enforcement under concurrency, unbounded input, and test/deployment gates that do not fully match the documented quality standard.

## Findings summary

| ID | Severity | Area | Finding |
|---|---|---|---|
| M1 | Medium | Backend | Rate-limit check and record are separate, so concurrent requests can exceed limits |
| M2 | Medium | Frontend | Out-of-order board responses can overwrite newer state |
| M3 | Medium | Frontend | Delayed chat history can duplicate messages returned by a chat response |
| M4 | Medium | Backend | Board changes and conversation messages are not persisted atomically |
| M5 | Medium | Backend/API | User and model-controlled strings and operation counts are unbounded |
| M6 | Medium | Operations | Start scripts report success before confirming application readiness |
| M7 | Medium | Quality gates | Backend enforces only aggregate coverage and E2E coverage is narrower than the plan |
| L1 | Low | Auth | Sessions never expire and logout cannot revoke a copied cookie |
| L2 | Low | Frontend | Failed card create/edit operations discard user input |
| L3 | Low | Frontend | A failed column rename can remain displayed as though it were saved |
| L4 | Low | AI validation | The model response contract accepts extra fields and overly broad scalar values |
| L5 | Low | Accessibility | Column sections lack names; new-card fields rely on placeholders |
| L6 | Low | Documentation | Review and explainer documents contain stale statements |

## Medium findings

### M1. Concurrent requests can exceed the configured rate limits

**Confirmed by code inspection.**

- `backend/app/rate_limit.py:26-39` locks `check()` and `record()` independently.
- `backend/app/main.py:74-77` checks a failed login and records it later.
- `backend/app/main.py:140-145` checks both chat limiters, then records both in separate calls.

Multiple same-key requests can pass `check()` before any request calls `record()`. For chat, the gap also exists between the minute and daily checks. A burst can therefore exceed 10 failed logins, 10 chat requests per minute, or 100 chat requests per day.

**Impact:** brute-force and AI-cost controls are weaker than their documented guarantees.

**Recommendation:** replace the split operations with an atomic `consume(key)` method that prunes, checks, and records while holding one lock. Apply all applicable limits before provider work. Add a concurrent test that coordinates threads and proves only the configured number pass.

### M2. Out-of-order board responses can restore stale state

**Confirmed architectural race in `frontend/src/components/KanbanBoard.tsx:47-55`.**

Each mutation independently awaits a full `BoardData` response and passes it to `onBoardChange`. If mutation A and B overlap and B returns first, A can return later with an older snapshot and overwrite B's result in the UI. Both database writes may succeed, while the visible board temporarily loses one change.

The optimistic drag path in `frontend/src/components/KanbanBoard.tsx:68-75` adds another ordering path because its rollback snapshot is captured before the request completes.

**Impact:** the UI can show stale data until a refresh, even though the database is correct. AI chat updates from `AuthGate` can race with board mutations too.

**Recommendation:** serialize board mutations, or assign a request/version sequence and ignore stale responses. Apply the same coordination to chat board updates. Add a component test with deliberately reversed response order.

### M3. Chat history can duplicate messages when history resolves after chat

**Confirmed timing-dependent race in `frontend/src/components/ChatSidebar.tsx:15,35`.**

On mount, history is fetched asynchronously. A chat request can complete first and set `messages` to the authoritative server result. The older history request can then finish and prepend the same messages to current state. The user sees duplicate chat bubbles.

The current tests cover sending before history resolves, but not the inverse completion order.

**Impact:** persisted turns can appear more than once until a reload.

**Recommendation:** do not enable chat until initial history is loaded, or ignore the history result after a chat response has superseded it. Add a test where chat resolves first and history second.

### M4. AI board mutations and message persistence are not one transaction

**Confirmed in `backend/app/chat.py:79-90`.**

Validated board operations run in one SQLite transaction, which correctly prevents partial board operations. However, the user message and assistant message are written afterward through two independent connections and transactions. A failure after the board commit can leave board changes without either message; a failure on the second insert can leave only the user message.

**Impact:** the board and conversation can become inconsistent after a database error.

**Recommendation:** apply operations and insert both messages through one shared connection/transaction. Refactor message insertion to accept an existing connection and test a forced failure on the second message insert.

### M5. Request and model output sizes are unbounded

**Confirmed in `backend/app/main.py:28-49` and `backend/app/chat.py:25-53,65-70`.**

Login strings, card details, chat messages, assistant responses, and the number of AI operations have no practical maximum. The rate limiter limits request count, not payload size. Chat content is persisted and sent to OpenRouter, so oversized requests can increase memory use, database size, latency, and provider cost.

**Impact:** a local authenticated client—or the model itself—can create unexpectedly large database records or provider requests.

**Recommendation:** add sensible `max_length` constraints to request models, a practical maximum operation count, and an assistant response limit. Add a provider output-token limit and reject oversized client input before contacting OpenRouter.

### M6. Start scripts report success before readiness

**Confirmed in `scripts/start.sh:4-6` and `scripts/start.ps1:2-4`.**

Both scripts run `docker compose up --build --detach` and immediately print that the application is running. `compose.yaml:1-11` has no health check, and the scripts do not poll `/api/health`.

**Impact:** startup can report success even when initialization fails, `/data` is not writable, configuration is invalid, or the process exits immediately.

**Recommendation:** add a Compose healthcheck and a bounded readiness loop in both scripts. Exit non-zero with a useful message if the endpoint does not become ready. Keep the scripts non-interactive as required by `scripts/AGENTS.md`.

### M7. Quality gates do not fully enforce the documented standard

**Confirmed in `backend/pyproject.toml:22-27`, `docs/PLAN.md:16-20`, `frontend/playwright.config.ts:16-21`, and `frontend/tests/kanban.spec.ts:18-178`.**

- `coverage fail_under = 80` enforces one aggregate result; it does not independently enforce at least 80% statements, branches, functions, and lines.
- The plan claims browser coverage for column rename, same-column reorder, mobile layout, logout/protected access, and persisted chat history. The current Playwright file has no cases for those workflows and only runs a desktop Chromium project.
- The unauthenticated backend test checks only `GET /api/board`, so a future protected route can accidentally omit authentication without failing the suite.
- There is a required restart-persistence scenario in the plan, but no test starts a second application instance against the same database file.

**Impact:** the suite is strong overall, but several explicit acceptance criteria can regress without a failing check.

**Recommendation:** enforce each backend coverage metric separately, parametrize unauthorized tests over every protected route/method, add the restart-persistence test, and either add the missing browser cases or narrow the plan to the workflows actually covered.

## Low findings

### L1. Sessions never expire and logout cannot revoke copied cookies

`backend/app/auth.py:14-27` creates a deterministic, indefinitely valid signature. `backend/app/main.py:87-90` only asks the browser to delete the cookie. A copied token remains valid until `SESSION_SECRET` changes.

Include a signed expiry timestamp and enforce a bounded session lifetime. This is acceptable for a local MVP but should be fixed before longer-lived or remote use.

### L2. Failed card create and edit operations discard input

`frontend/src/components/NewCardForm.tsx:13-20` clears and closes the form before the API request succeeds. `frontend/src/components/KanbanCard.tsx:34` similarly exits edit mode immediately. If the mutation fails, the board error appears but the user's draft is lost.

Return a promise from the mutation callback and only close or reset the form after success. Add failure-path tests.

### L3. A failed column rename can remain visible as an unsaved title

`frontend/src/components/KanbanColumn.tsx:27-37` keeps `draftTitle` local. On failure, the authoritative `column.title` does not change, but the input can continue showing the rejected value. There is no callback result that tells the column to restore its draft.

Have rename return success/failure, or expose mutation status, and reset the draft to the server title on failure.

### L4. AI validation is looser than the exact-shape contract

The models in `backend/app/chat.py:25-53` ignore unknown fields. `response` may be blank, and Pydantic integer parsing accepts values such as numeric strings and booleans even though the prompt specifies a JSON integer position.

Use `extra="forbid"`, a bounded nonblank response, strict integer validation, and a maximum operation count. Add malformed-reply cases for each rule.

### L5. Accessibility improvements remain

- `frontend/src/components/KanbanColumn.tsx:41-64`: each `<section>` lacks an accessible name because the visible title is an input rather than a heading associated with the region.
- `frontend/src/components/NewCardForm.tsx:27-44`: card fields have placeholders but no persistent labels.
- `frontend/src/components/AuthGate.tsx:35-39`: logout replaces the board without moving focus to the login username field.

Add an associated heading/`aria-labelledby`, persistent form labels, and deliberate focus management after logout.

### L6. Documentation contains stale statements

- `docs/review.md:150-152` still lists rate limiting as future work even though it has been implemented.
- `docs/review.md:194-197` describes AI atomicity as a remaining next step even though operation rollback is implemented; conversation persistence is the narrower unresolved issue.
- `docs/explainer.md:190-195` says the server starts with `uv run --no-sync`, while `Dockerfile` now installs dependencies at build time and starts the installed Uvicorn executable directly.
- `docs/database-schema.json` does not state that fixed seed IDs prevent a second seeded board from being added without changing ID generation.

Reconcile these documents with the current implementation so future reviews do not repeat resolved work.

## Prioritized actions

1. Make rate-limit consumption atomic and add concurrency tests (M1).
2. Serialize or version frontend board updates and fix chat-history reconciliation (M2, M3).
3. Make AI board changes and both message inserts atomic (M4).
4. Bound request/model input and operation counts (M5, L4).
5. Add startup readiness checks (M6).
6. Bring test gates in line with `docs/PLAN.md` (M7).
7. Improve failure-state form behavior and accessibility (L2, L3, L5).
8. Update stale documentation (L6).

## What is already in good shape

- Secrets remain server-side and `.env` is ignored by Git and excluded from the Docker build context.
- The Compose port is bound to `127.0.0.1`, matching the localhost-only deployment.
- Board reads and mutations are scoped to the authenticated username.
- Unknown board IDs return not-found behavior and blank titles are rejected.
- AI operations are shape-validated and use the same board mutation layer as HTTP requests.
- The lockfiles are used for reproducible package versions, and `npm audit` currently reports no advisories.
- The frontend has a real loading state, drag rollback behavior, a dedicated move handle, and keyboard drag coordinates.
