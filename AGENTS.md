# The Project Management web app

## Business Requirements

This project is a Project Management App. Key features:
- A user can register, sign in, change their password and delete their account
- When signed in, the user sees their Kanban boards; they can create, rename, delete and share boards
- Each Kanban board has fixed columns that can be renamed
- The cards on the Kanban board can be moved with drag and drop, and edited: title, details, priority, due date, assignee and labels, plus a checklist and comments. Cards can be archived and restored
- Boards can be searched and filtered, each board keeps an activity log, and "My work" lists the user's assigned cards across boards
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move / delete one or more cards

## Limitations

Users register with a username and password. A demo account (`user` / `password`) is seeded into a new, empty database.

Each user can have several Kanban boards and share them with other users; each board has exactly five columns.

The app runs locally (in a docker container).

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

The MVP is complete and has been extended with accounts (registration, password change, account deletion), several boards per user, board sharing with members, card priority, due dates (with overdue and due-soon warnings), assignees and labels, card checklists and comments, archiving cards, a per-board activity log, a "My work" list of the user's assigned cards across boards, board search and filters, and hover tooltips on every icon. The Next.js frontend in frontend/ is statically exported and served by the FastAPI backend in backend/, all built into a single Docker image. Accounts, board data, and AI chat are backed by the API and SQLite. `docs/PLAN.md` lists what is done and what is planned next; `docs/database-schema.json` documents the database (schema version 7).

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
- `npm run test:e2e` runs Playwright against the running Docker app at http://localhost:8000; set `PLAYWRIGHT_BASE_URL` to target another server, such as `http://localhost:3000` for `npm run dev`. Rebuild the app (`scripts/start.sh`) first so it runs the current code.
- `npm run build` type-checks test files too, so a type error in a test fails the Docker build (and `scripts/start.sh` then leaves the previous container running).
- Frontend unit coverage must also be at least 80%.

## Architecture

The app is one Docker image. A Node stage builds the Next.js app with `output: "export"`. That output is copied into `/app/static` of a Python `uv` image, where FastAPI serves both `/api/*` and the static site from the same origin. `backend/static/index.html` in the repo is only a placeholder; the Docker build replaces it with the Next.js export. There is no separate API host or CORS.

Backend (`backend/app/`):
- `main.py`: thin route handlers. Board, column, card, comment, checklist, activity, archive and chat routes live under `/api/boards/{board_id}/...`. `require_session` resolves the session cookie to a `User`; `owned_board` additionally checks that the user owns or is a member of the `{board_id}` in the path (404 otherwise); owner-only actions (rename, delete, add or remove members) also call `board.require_owner` (403). Every board mutation returns the full updated board (comment and checklist changes return it alongside the updated list). `GET /api/my-cards` lists the user's assigned cards across boards.
- `auth.py`: scrypt password hashing and the HMAC-signed, HTTP-only `pm_session` cookie. The token is `{user_id}.{signature}`, where the signature covers the user's `session_key`; rotating that key (on password change) signs out every other session. The signing key comes from `SESSION_SECRET`; the app refuses to start without it.
- `accounts.py`: register (creates an empty "My first board"), sign in, session lookup, password change and account deletion (which deletes the user's own boards, removes their memberships and assignments, and clears the authorship of their messages, comments and activity, which then show as "Former member"). Usernames are unique ignoring case.
- `db.py`: the SQLite connection, `NotFoundError`/`ForbiddenError`/`ConflictError` (mapped to 404/403/409), and `initialize()`, which creates the version 1 schema and applies migrations in order using `PRAGMA user_version`, so new and existing databases take the same path. It seeds the demo account and board (with fixed ids) only into an empty database.
- `board.py`: raw `sqlite3` access for boards, members, cards, labels, checklists, comments, archive and the activity log. Functions take a `board_id` that the route has already authorized; column and card ids from another board are reported as not found. Active cards keep an explicit `position` (0..n-1) within each column, and `move_card` shifts positions in both columns; archived cards have position -1 and are left out of the board. Mutations return a short description (`moved "Task" to Review`) that the caller passes to `board.record` for the board's activity log, with the acting user (AI changes are suffixed "(via assistant)"). `update_card` changes only the fields given. Assignees are given as usernames and must be the board's owner or a member; removing a member unassigns their cards on that board.
- `rate_limit.py`: in-memory rolling-window limits returning 429 with `Retry-After`: 10 failed sign-ins per minute and 5 registrations per hour per client address, and 10 chat messages per minute and 100 per rolling 24 hours per user. They reset when the app restarts.
- `chat.py`: calls OpenRouter (`openai/gpt-oss-120b`) through `httpx` in JSON mode. It sends the board's chat history plus the current board and today's date, then applies the returned `create_card`/`edit_card`/`move_card`/`delete_card` operations (including priority, due date, assignee and labels) to that board only, through the same `board.py` functions the HTTP routes use, and saves both messages, the user's with its author. Tests mock `chat.httpx.post`.

Frontend (`frontend/src/`):
- `AuthGate` checks `/api/session` and shows the sign-in or registration form, or the `Workspace`.
- `Workspace` loads the board list, tracks the open board and its data, and renders `KanbanBoard` (with `BoardSwitcher` and the account and log out buttons in its header), `ChatSidebar`, `ShareDialog`, `ActivityDialog`, `ArchiveDialog`, `MyWorkDialog` and `AccountDialog` (all built on `Modal`). Opening a board from My work refreshes the board list first if it does not have that board yet. Board data that arrives for a board that is no longer open (a late mutation or chat reply) is dropped.
- `KanbanBoard` loads the open board, applies mutations, runs drag and drop, and filters cards with `BoardFilters` (text, priority, assignee, label, due date; newly added cards stay visible until the filter changes), archives cards, and opens a card's `CardDialog` (checklist and comments).
- `lib/api.ts` wraps every endpoint and throws `ApiError` carrying the server's `detail`. `lib/kanban.ts` holds the types, `getMoveTarget` (turns a DnD Kit drop into the column and position sent to the move endpoint), due date helpers, label helpers, `timeAgo` and `matchesFilter`.
- Icon buttons and badges explain themselves with CSS tooltips (`data-tooltip`, styled in `globals.css`).
- The board shape is `{ id, name, owner, members, labels, columns: [{id, title, cardIds}], cards: {id: {id, title, details, priority, dueDate, assignee, labels, comments, checklist}} }` on both backend and frontend. Board `members` lists every username that can open the board, owner first; board `labels` are the distinct labels on its cards; a card's `comments` is its comment count and `checklist` is `{done, total}`. Archived cards are left out of the board. Request bodies use snake_case (`column_id`, `due_date`).
