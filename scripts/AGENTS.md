# Script Guide

This directory contains the local Docker lifecycle scripts for macOS, Linux, and Windows.

- `start.sh` and `stop.sh` are the macOS and Linux entry points.
- `start.ps1` and `stop.ps1` are the Windows PowerShell entry points.
- Start scripts must build and start the Compose application, then report `http://localhost:8000`.
- Stop scripts must run `docker compose down` without the `--volumes` option so SQLite data remains persistent.
- Keep scripts non-interactive, small, and rooted at the repository directory.