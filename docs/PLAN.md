# Project Management MVP Plan

## Agreed Decisions

- Run the combined application at `http://localhost:8000`.
- Start scripts build the Docker image and start the application. Stop scripts stop the application without deleting data.
- Persist SQLite in a Docker volume at `/data/pm.db`.
- Use SQLite for runtime data. Store the proposed schema and example records as JSON documentation in `docs/`, not as the application database.
- Authenticate the fixed MVP account, `user` / `password`, with a signed, HTTP-only session cookie.
- Keep exactly five columns in a fixed order; users and AI can rename them but cannot add, delete, or reorder them.
- Cards have a title and details only.
- Persist chat history in SQLite across browser and container restarts.
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

## Approval Gates

1. Approve this plan and `frontend/AGENTS.md` before Part 2.
2. Approve the documented database design before Part 6.
3. Confirm a valid OpenRouter key is available before the opt-in live connectivity check in Part 8.