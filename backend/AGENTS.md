# Backend Guide

## Purpose

This directory contains the FastAPI application. It serves the statically exported Next.js frontend and the authenticated API at `http://localhost:8000`. Use `uv` for Python dependency management and execution in Docker.

## Architecture

- Keep HTTP route handlers thin. Put authentication, board mutations, persistence, and OpenRouter calls in focused application services.
- Serve the exported frontend and API from the same origin. Do not add a separate frontend API host.
- Create SQLite tables automatically when the database does not exist. The Docker volume persists the database at `/data/pm.db`.
- Users register with a username and scrypt-hashed password. The demo account `user` / `password` is seeded only into an empty database.
- Each user owns any number of boards and always keeps at least one of their own. The owner can share a board with other users as members; members can change cards and columns and use the chat, and only the owner can rename, share or delete it. A member can leave. Board routes live under `/api/boards/{board_id}` and authorize the board through the `owned_board` dependency; board functions then take that `board_id`.
- Schema changes are migrations in `db.initialize()`, keyed on `PRAGMA user_version`. Never edit the version 1 `SCHEMA`; add the next migration instead, and test it from an older database.
- Keep exactly five columns in their original order. Columns may be renamed but cannot be created, deleted, or reordered.
- Cards have a title, details, an optional priority (`low`, `medium`, `high`), due date and assignee (a board member), and up to 5 labels (1 to 30 characters, unique per card ignoring case; an edit that sends labels replaces them all). Card edits are partial: fields left out keep their values. Preserve card order within each column when cards are created, moved, archived, restored or deleted.
- Board members can comment on cards (only a comment's author can delete it) and keep a checklist on each card.
- Archiving a card hides it from the board, My work and board labels, and takes it out of its column's order (position -1) so active positions stay 0..n-1; restoring puts it at the end of its column. Archived cards can only be restored or deleted for good. Count active cards with `archived_at IS NULL` whenever positions are computed.
- `GET /api/my-cards` lists the signed-in user's assigned cards on every board, open cards first (by due date, then priority), done cards (last column) after.
- Every change to a board is recorded in its activity log: board mutation functions return a description, and routes and the AI pass it to `board.record` with the acting user (an empty description, for an edit that changed nothing, is not recorded).
- Deleting a board, card or account deletes related rows in code (the foreign keys have no `ON DELETE CASCADE`); add any new card or board table to `purge_board`, `delete_card` and `accounts.delete_account`.
- Rate limits (`rate_limit.py`) are in memory: failed sign-ins and registrations per client address, chat messages per user.
- Persist chat messages, with their author, on the board so conversation history survives browser and container restarts and is shared by the board's members.

## Authentication and Secrets

- Use a signed, HTTP-only session cookie. Its signature covers the user's `session_key`, which is rotated on password change to sign out other sessions.
- Require an authenticated session for every board and chat endpoint.
- Read `OPENROUTER_API_KEY` only from server environment configuration. Never return it, a session-signing secret, or database paths in API responses.
- Use OpenRouter model `openai/gpt-oss-120b` only through a server-side client.

## AI Operations

- Send the open board (with its members and labels), recent persisted conversation history, today's date, and the latest question to the model.
- Require structured, validated output containing assistant text and optional board operations.
- Apply only validated create, edit, move, and delete operations, to the board the chat belongs to, through the same board service used by HTTP endpoints. Record them in the activity log as the asking user, marked "(via assistant)". If any operation is invalid, none is applied.
- Persist valid updates immediately and return the assistant response with the updated board state.

## Testing

- Maintain at least 80% statement, branch, function, and line unit-test coverage for backend source.
- Use isolated temporary SQLite databases for persistence tests and FastAPI's test client for HTTP integration tests.
- Cover registration, authentication, account changes, authorization boundaries between users and between one user's boards, migrations, database creation, card and column mutations, ordering, chat persistence, and API errors.
- Tests are grouped by area: `test_main.py` (MVP board, chat, rate limits, migration from version 0), `test_accounts.py`, `test_boards.py`, `test_sharing.py`, `test_collaboration.py` (comments and activity), `test_labels.py`, `test_my_cards.py` and `test_archive_and_checklists.py`. The demo board has id 1 and fixed ids (`col-backlog`, `card-1`) in tests.
- Mock OpenRouter at its client boundary in automated tests. A live `2+2` provider check is manual and opt-in.