FROM node:24-bookworm-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend-build /frontend/out ./static

EXPOSE 8000

RUN useradd --system --create-home app && mkdir -p /data

# Start as root only to give the data volume (possibly created by an older root-run image) to the
# app user, then run the server as that user.
CMD ["sh", "-c", "chown -R app:app /data && exec setpriv --reuid=app --regid=app --init-groups /app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio"]