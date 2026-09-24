# Kanban Studio

## Run

Start the backend first (`scripts/start.sh` from the repository root), then:

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:3000 and proxies `/api` to the backend on port 8000.

## Tests

```bash
npm run test:unit
npm run test:e2e
```

`test:e2e` runs against the Docker app at http://localhost:8000. Set `PLAYWRIGHT_BASE_URL` to test another server.
