$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose up --build --detach
Write-Host "Project Management MVP is running at http://localhost:8000"
