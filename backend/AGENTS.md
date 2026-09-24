# Backend Guide

## Purpose

This directory contains the FastAPI application. It serves the statically exported Next.js frontend and the authenticated API at `http://localhost:8000`. Use `uv` for Python dependency management and execution in Docker.

## Architecture

- Keep HTTP route handlers thin. Put authentication, board mutations, persistence, and OpenRouter calls in focused application services.
- Serve the exported frontend and API from the same origin. Do not add a separate frontend API host.
- Create SQLite tables automatically when the database does not exist. The Docker volume persists the database at `/data/pm.db`.
- Model users for future multi-user support, while accepting only the fixed MVP credentials `user` / `password`.
- Each user owns one board. Every board operation must use the authenticated user identity.
- Keep exactly five columns in their original order. Columns may be renamed but cannot be created, deleted, or reordered.
- Cards have only a title and details. Preserve their order within each column when cards are created or moved.
- Persist chat messages with the user's board so conversation history survives browser and container restarts.

## Authentication and Secrets

- Use a signed, HTTP-only session cookie for the MVP login session.
- Require an authenticated session for every board and chat endpoint.
- Read `OPENROUTER_API_KEY` only from server environment configuration. Never return it, a session-signing secret, or database paths in API responses.
- Use OpenRouter model `openai/gpt-oss-120b` only through a server-side client.

## AI Operations

- Send the authenticated user's current board, persisted conversation history, and latest question to the model.
- Require structured, validated output containing assistant text and optional board operations.
- Apply only validated create, edit, move, and delete operations through the same board service used by HTTP endpoints.
- Persist valid updates immediately and return the assistant response with the updated board state.

## Testing

- Maintain at least 80% statement, branch, function, and line unit-test coverage for backend source.
- Use isolated temporary SQLite databases for persistence tests and FastAPI's test client for HTTP integration tests.
- Cover authentication, authorization boundaries, database creation, card and column mutations, ordering, chat persistence, and API errors.
- Mock OpenRouter at its client boundary in automated tests. A live `2+2` provider check is manual and opt-in.