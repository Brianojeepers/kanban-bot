# Project Management App Plan

Parts 1 to 10 built the MVP. Parts 11 to 18 extended it into a multi-user project management app. Each part lists what was done; the MVP parts also list their tests and approval gates.

## Agreed Decisions

- Run the combined application at `http://localhost:8000`.
- Start scripts build the Docker image and start the application. Stop scripts stop the application without deleting data.
- Persist SQLite in a Docker volume at `/data/pm.db`. Schema changes are numbered migrations applied on startup (`PRAGMA user_version`, currently 7); `docs/database-schema.json` documents the current schema.
- Use SQLite for runtime data. Store the proposed schema and example records as JSON documentation in `docs/`, not as the application database.
- Users register with a username and password (scrypt-hashed) and sign in with a signed, HTTP-only session cookie. A demo account, `user` / `password`, is seeded into an empty database. (The MVP accepted only that fixed account; Part 11 replaced it.)
- Each user has one or more boards and can share them with other users as members.
- Keep exactly five columns in a fixed order on every board; users and AI can rename them but cannot add, delete, or reorder them.
- Cards have a title and details, and optionally a priority, due date, assignee, labels and checklist; they can be commented on and archived. (The MVP had title and details only; Parts 12 to 17 added the rest.)
- Persist each board's chat history in SQLite across browser and container restarts.
- Apply validated AI mutations immediately, return a summary in chat, and refresh the board.
- Keep `OPENROUTER_API_KEY` server-side in `.env` and Docker configuration. Use `openai/gpt-oss-120b` through OpenRouter.

## Quality Standard

- Frontend and backend each require at least 80% statement, branch, function, and line unit-test coverage.
- Each feature also requires integration coverage at its external boundary: browser workflows for frontend and HTTP/database/provider-client workflows for backend.
- Automated tests must mock OpenRouter. The live `2+2` check is manual and opt-in.

## Part 1: Planning

- [x] Review root requirements and existing frontend implementation.
- [x] Record product and technical decisions.
- [x] Create this phased plan with test criteria and approval gates.
- [x] Create `frontend/AGENTS.md` describing the current frontend.
- [x] Obtain user approval of this completed plan before starting Part 2.

Success criteria:

- The plan covers every requirement in the root `AGENTS.md`.
- The frontend guide identifies the demo's current local-only state and its planned backend boundary.
- No Docker, backend, authentication, database, or AI implementation is performed in Part 1.

## Part 2: Docker and Backend Scaffold

- [x] Create a FastAPI application in `backend/`, managed with `uv`.
- [x] Add Docker and Docker Compose configuration that runs the smoke-test application on port 8000.
- [x] Configure the named volume mounted at `/data`.
- [x] Serve a small static HTML smoke-test page at `/`.
- [x] Add a backend health/example endpoint and call it from that page.
- [x] Add start and stop scripts for macOS, Linux, and Windows under `scripts/`.

Tests and success criteria:

- A clean checkout builds and starts with the documented script.
- `/` and the example endpoint respond at `http://localhost:8000`.
- The smoke-test page displays the API response.
- Stop scripts preserve the named SQLite volume.

## Part 3: Serve the Existing Frontend

- [x] Configure Next.js static export for FastAPI to serve.
- [x] Replace the smoke-test page with the existing Kanban demo at `/`.
- [x] Preserve five columns, renaming, card create/delete, and drag-and-drop behavior.
- [x] Add frontend unit coverage to meet the quality standard.
- [x] Add browser integration coverage for board rendering, rename, create, delete, cross-column movement, same-column reorder, keyboard focus, and a mobile layout smoke test.

Tests and success criteria:

- Unit coverage meets the shared 80% threshold.
- Browser tests pass against the Docker-served application, with no Next.js dev server required.

## Part 4: MVP Sign-In

- [x] Add a login view at `/` for unauthenticated visitors.
- [x] Add login, logout, and current-session endpoints.
- [x] Accept only the MVP credentials `user` / `password`.
- [x] Set and clear a signed, HTTP-only session cookie.
- [x] Protect Kanban endpoints and board rendering with the session.

Tests and success criteria:

- Backend unit and integration tests cover accepted and rejected credentials, session lookup, logout, and unauthorized API access.
- Browser tests cover login, rejection, protected board access, and logout.
- Neither signing secrets nor the OpenRouter key reach browser code.

## Part 5: Data Model Approval

- [x] Propose tables, keys, constraints, and ownership for future multi-user support.
- [x] Document the schema, relationships, and example records as JSON in `docs/`.
- [x] Document initialization, migration approach, and Docker-volume persistence.
- [x] Obtain user approval before implementing persistence.

Success criteria:

- The design supports users, one board per user, five fixed ordered columns, cards, ordering, and persisted chat history.
- Every planned frontend and AI mutation has a representation in the proposed schema.

## Part 6: Persistent Kanban API

- [x] Create the SQLite database and tables when absent.
- [x] Create the MVP user's board on first use.
- [x] Add authenticated endpoints to read the board and rename columns, create, edit, move, and delete cards.
- [x] Scope all reads and mutations to the signed-in user and preserve card order.
- [x] Meet the backend coverage standard with isolated SQLite tests and FastAPI test-client integration tests.

Tests and success criteria:

- Database initialization and every API mutation are covered.
- Tests prove users cannot read or change another user's data.
- Board changes survive an application restart using the same Docker volume.

## Part 7: Connect Frontend to API

- [x] Replace local initial state with authenticated API loading and mutations.
- [x] Add loading and request-error states.
- [x] Preserve rename, edit, create, delete, and drag-and-drop interactions.
- [x] Reconcile board state after successful mutations.

Tests and success criteria:

- Frontend unit tests cover API loading, success, and failure states.
- Browser integration tests prove mutations remain after reload.
- Frontend coverage continues to meet the shared threshold.

## Part 8: OpenRouter Connectivity

- [x] Add a server-only OpenRouter client using `OPENROUTER_API_KEY` and `openai/gpt-oss-120b`.
- [x] Add a focused service for model requests and provider errors.
- [x] Implement an opt-in, manual `2+2` connectivity check.
- [x] Mock provider responses and failures in automated tests.

Tests and success criteria:

- Backend coverage remains at least 80%.
- Unit and integration tests need neither a live key nor provider access.
- The manual connectivity check succeeds with a valid local `.env` key.

## Part 9: Structured AI Board Updates

- [x] Define and document a validated structured response: assistant text plus optional board operations.
- [x] Send the current board, persisted conversation history, and latest user question to the model.
- [x] Validate all model output before changing data.
- [x] Apply valid create, edit, move, and delete operations through the same board service as the API.
- [x] Persist the assistant conversation and return an updated board with the assistant response.

Tests and success criteria:

- Tests cover assistant-only replies, each permitted operation, invalid output, and provider failures.
- Invalid or unauthorized operations never modify the board.
- Integration tests verify valid structured operations persist correctly.

## Part 10: AI Chat Sidebar

- [x] Add an accessible, responsive sidebar chat interface alongside the board.
- [x] Display persisted history, sending state, errors, and assistant replies.
- [x] Send authenticated chat requests to the backend.
- [x] Refresh the board automatically after AI-applied mutations.
- [x] Keep the UI consistent with the project color scheme and established Kanban experience.

Tests and success criteria:

- Component tests cover sending, loading, error, history, and board-refresh states.
- Browser tests verify a mocked assistant response and board update without a manual reload.
- Frontend and backend retain the shared coverage threshold.

## Approval Gates (MVP)

1. Approve this plan and `frontend/AGENTS.md` before Part 2.
2. Approve the documented database design before Part 6.
3. Confirm a valid OpenRouter key is available before the opt-in live connectivity check in Part 8.

## Part 11: Accounts and Multiple Boards

- [x] Registration with scrypt-hashed passwords; usernames unique ignoring case; 5 registrations per hour per address.
- [x] Sessions signed over a per-user session key; changing the password signs out other sessions.
- [x] Change password and delete account (with its boards, cards and messages).
- [x] Several boards per user: list, create, rename, delete (never the last one), with per-board chat history.
- [x] Board, column, card and chat routes scoped under `/api/boards/{board_id}` and authorized per board.
- [x] Migration from the version 1 database, tested from a version 0 file and run on the Docker volume.

Tests and success criteria:

- Users cannot read or change each other's boards; the AI can only change the board it is asked about.
- Browser test covers the full account lifecycle and per-board data.

## Part 12: Card Details and Filters

- [x] Optional priority and due date on cards, editable in the UI and by the AI; edits are partial.
- [x] Priority and due date badges; overdue cards highlighted and counted in the header.
- [x] Search, priority and overdue filters on the board.
- [x] Fix: long columns spilled their cards outside the column's droppable area, which broke keyboard and pointer moves from the bottom of a scrolled board.

Tests: partial edits, validation of priority and dates, filters in unit tests, and a browser test that moves a card with the keyboard from the bottom of a long, scrolled column.

## Part 13: Board Sharing

- [x] Owners add members by username and remove them; members can leave. Shared boards are labelled with their owner.
- [x] Members can change cards and columns and use the board's chat; renaming, sharing and deleting are owner-only (403).
- [x] Card assignees (board members only), set in the UI or by the AI, with an assignee filter.
- [x] Chat messages record their author; teammates' messages are labelled.
- [x] Removing a member or deleting an account clears their assignments; migrations 3 and 4 run on the Docker volume.

Tests: owner-only actions return 403, non-members get 404, assignees must be members, and a browser test shares a board with a second user who assigns a card and leaves.

## Part 14: Comments and Activity

- [x] Card comments for everyone who can open the board; authors can delete their own. Cards show a comment count.
- [x] A per-board activity log of every change, including AI changes (marked "via assistant"), newest first, capped at 50 entries per request.
- [x] Deleted accounts leave their comments and activity, shown as "Former member". Migration 5 run on the Docker volume.
- [x] Fix: the board switcher overflowed phone screens once it had more buttons.

Tests: only authors delete comments, the log's wording and order for every kind of change, and a browser test that comments and reads the activity.

## Part 15: Card Labels

- [x] Up to 5 labels per card, unique ignoring case, set in the card editor (comma-separated) or by the AI.
- [x] Labels shown as colored badges (one stable color per label) and a label filter on the board.
- [x] Migration 6 run on the Docker volume.

Tests: case-insensitive de-duplication, limits, replacement on edit, AI labelling, and a browser test that labels and filters.

## Part 16: My Work

- [x] `GET /api/my-cards`: the user's assigned cards across boards, by urgency, with done cards last.
- [x] "My work" dialog listing open assigned cards with board, column, priority and due date; choosing one opens its board, refreshing the board list when the board is new to it.
- [x] Browser tests clean up their boards even when they fail.

Tests: ordering across boards, removal on leaving a board, and a browser test that opens a board from My work.

## Part 17: Checklists and Archive

- [x] Card checklists: add, tick (optimistically, rolled back on failure), remove; progress shown on the card. Checklist and comments share one card dialog.
- [x] Archive cards (hidden from the board, My work and board labels), restore them to the end of their column, or delete them for good.
- [x] Checklist and archive changes appear in the activity log. Migration 7 run on the Docker volume.

Tests: archived cards leave column positions contiguous and cannot be changed until restored, checklist counts, and a browser test that ticks a checklist, archives and restores.

## Part 18: Feedback Fixes

- [x] New cards (manual or AI) no longer vanish under an active filter: cards added after the filter last changed stay visible until it changes.
- [x] Priority and due date can be set when adding a card, not only when editing. Cards due today or within 3 days are marked "due soon" and counted in the header; the "Overdue only" checkbox became a due date filter (overdue, or due soon).
- [x] Every icon button and card badge explains itself in a tooltip on hover or keyboard focus, including why a disabled button is disabled.

Tests: a browser test adds a card with a priority and due date under an active filter and checks a tooltip on hover; the phone layout test caught tooltips widening the page.

## Known Limitations

- Rate limits are in memory and reset when the app restarts. Registration allows 5 per hour per address, which the browser tests also use (one per run).
- The browser tests keep a reusable `e2e-member` account in the Docker database.
- Deleting a board, card or account removes related rows in application code; the foreign keys have no `ON DELETE CASCADE`.

## Next

Nothing is planned. Candidate ideas, not yet agreed: due date reminders, board templates, and customisable columns (which would change the fixed five-column contract used by the API and the AI).
