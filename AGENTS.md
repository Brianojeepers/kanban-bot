# The Project Management MVP web app

## Business Requirements

This project is a Project Management App. Key features:
- A user can sign in
- When signed in, the user sees a Kanban board representing their project
- The Kanban board has fixed columns that can be renamed
- The cards on the Kanban board can be moved with drag and drop, and edited
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards

## Limitations

For the MVP, there will only be a user sign in (hardcoded to 'user' and 'password') but the database will support multiple users for future.

For the MVP, there will only be 1 Kanban board per signed in user.

For the MVP, this will run locally (in a docker container)

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Current State

The MVP is complete. The Next.js frontend in frontend/ is statically exported and served by the FastAPI backend in backend/, all built into a single Docker image. Sign in, board data, and AI chat are backed by the API and SQLite.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Commands

Full app (Docker, served at http://localhost:8000 on localhost only; needs `OPENROUTER_API_KEY` and `SESSION_SECRET` in root `.env`, e.g. `python3 -c 'import secrets; print(secrets.token_hex(32))'` for the secret):
- `scripts/start.sh` / `scripts/stop.sh` (`.ps1` on Windows). Stopping keeps the `pm_data` volume that holds `/data/pm.db`.

Backend (`cd backend`, managed with `uv`):
- `uv run pytest --cov` runs all tests. Each test gets its own temporary SQLite database (`tests/conftest.py`). Coverage must be at least 80% with branch coverage on.
- Single test: `uv run pytest tests/test_main.py::test_health_check_returns_ok`
- Local server: `DATABASE_PATH=/tmp/pm.db SESSION_SECRET=dev uv run uvicorn app.main:app --reload`

Frontend (`cd frontend`):
- `npm run dev` serves the UI on port 3000 and proxies `/api` to the backend on port 8000 (the Docker app or the local backend server); `npm run build` (static export to `out/`), `npm run lint`
- `npm run test:unit` runs Vitest; add `-- src/lib/kanban.test.ts` to run one file or `-- -t "name"` to filter by test name.
- `npm run test:e2e` runs Playwright against the running Docker app at http://localhost:8000; set `PLAYWRIGHT_BASE_URL` to target another server, such as `http://localhost:3000` for `npm run dev`.
- Frontend unit coverage must also be at least 80%.

## Architecture

The app is one Docker image. A Node stage builds the Next.js app with `output: "export"`. That output is copied into `/app/static` of a Python `uv` image, where FastAPI serves both `/api/*` and the static site from the same origin. `backend/static/index.html` in the repo is only the old smoke-test page; the Docker build replaces it. There is no separate API host or CORS.

Backend (`backend/app/`):
- `main.py`: thin route handlers. The `require_session` dependency protects every board and chat endpoint and passes the signed-in username to it. Every mutation endpoint returns the full updated board.
- `auth.py`: fixed `user`/`password` login and an HMAC-signed, HTTP-only `pm_session` cookie. The signing key comes from `SESSION_SECRET`; the app refuses to start without it.
- `board.py`: SQLite access with raw `sqlite3`. `initialize()` creates the tables and seeds the user, the five columns, and the demo cards; it runs on each read. Cards keep an explicit `position` within each column, and `move_card` shifts positions in both the source and destination columns. Every function takes the username and only reads or changes that user's board; ids from another board are reported as not found. The schema supports multiple users (see `docs/database-schema.json`), but the seed uses fixed column and card ids, so seeding must generate per-board ids before a second account is added.
- `chat.py`: calls OpenRouter (`openai/gpt-oss-120b`) through `httpx` in JSON mode. It sends chat history plus the current board, then applies the returned `create_card`/`edit_card`/`move_card`/`delete_card` operations through the same `board.py` functions the HTTP routes use, and saves both messages. Tests mock `chat.httpx.post`.

Frontend (`frontend/src/`):
- `AuthGate` checks `/api/session`, shows the login form or the board, and places `KanbanBoard` next to `ChatSidebar`. `AuthGate` holds the board state: `KanbanBoard` loads it and shows a loading state until it arrives, and a chat reply passes its returned board straight in, so the board updates in place.
- `lib/api.ts` wraps the board endpoints. `lib/kanban.ts` holds the `BoardData` types and `getMoveTarget`, which turns a DnD Kit drop into the column and position sent to the move endpoint.
- The board shape is `{ columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }` on both backend and frontend.

`backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md` contain per-directory rules.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.