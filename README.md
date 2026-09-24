# Kanban Studio

A single-board Kanban app with an AI assistant that can create, edit, move and delete cards. FastAPI and SQLite on the backend, a statically exported Next.js frontend, packaged as one Docker image.

## Run

Requires Docker. Create `.env` in the repository root:

```
OPENROUTER_API_KEY=<your OpenRouter key>
SESSION_SECRET=<output of: python3 -c 'import secrets; print(secrets.token_hex(32))'>
```

Then run `scripts/start.sh` (`scripts/start.ps1` on Windows) and open http://localhost:8000. Sign in as `user` / `password`. Stop with `scripts/stop.sh`; the data is kept in the `pm_pm_data` volume. To reset it, stop the app and run `docker volume rm pm_pm_data`.

## Test

- Backend: `cd backend && uv run pytest --cov`
- Frontend: `cd frontend && npm run test:unit`, and with the app running, `npm run test:e2e`

`AGENTS.md` has the full command list and architecture notes. Planning and review documents are in `docs/`.
