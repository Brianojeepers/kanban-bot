#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
docker compose up --build --detach
printf 'Project Management MVP is running at http://localhost:8000\n'
