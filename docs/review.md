# Project Review

Items marked **Resolved** have since been fixed. See `code_review.md` for the current review and its status.

An honest assessment of the approach taken for this MVP, its weaknesses, and
what's needed to take it from "working demo" to "production-ready product."

---

## 1. What Went Well

- **Phased delivery with approval gates.** Each part of `docs/PLAN.md` had a
  checklist, explicit test criteria, and — for the two highest-risk
  decisions (data model, going live with a real AI key) — a required
  sign-off before implementation began. This kept scope controlled and
  caught misunderstandings early rather than at the end.
- **Testing was proportional, not superficial.** Both unit and real-browser
  integration tests were required at every phase, with an enforced 80%
  coverage floor on both frontend and backend. That combination is what
  actually caught the drag-and-drop bug — a pure unit test would never have
  exercised real pointer geometry.
- **The AI integration is defensively designed.** The model is required to
  return structured JSON, every operation is validated before being applied,
  and it reuses the exact same board-mutation functions as the regular
  human-facing API — there is no separate, less-trusted code path for
  AI-driven changes.
- **Secrets are kept server-side.** The OpenRouter key and session-signing
  logic never reach the browser, and `.env` is git-ignored.
- **Root-cause debugging over guessing.** When tests failed, the approach
  was to reproduce with evidence (network traces, page snapshots, direct
  measurements) rather than speculatively changing code — this is what
  correctly separated a real backend bug (missing re-indexing) from a real
  frontend bug (wrong collision detection) from a red herring (an unrelated
  test-tooling limitation).

---

## 2. What I Would Improve

### 2.1 Correctness / Robustness

- **The AI operation loop is not atomic.** In `chat.py`, operations from the
  model are applied one at a time in a loop; if operation 3 of 5 is invalid,
  operations 1 and 2 have *already been written to the database* before the
  error is raised. The right fix is to validate every operation's shape
  fully **before** applying any of them, or wrap the whole batch in a single
  transaction that rolls back entirely on any failure.
  **Resolved:** operations run in one transaction and the reply is validated before any is applied.
- **No schema migration tooling.** Tables are created with
  `CREATE TABLE IF NOT EXISTS`, which works for the first version of the
  schema but has no story for changing the schema later without wiping data.
  A tool like `alembic` (or even a hand-rolled `schema_version` table with
  numbered migration scripts) should be introduced before the schema changes
  again.
- **No optimistic-lock/versioning on board writes.** If two requests move
  cards at nearly the same instant (e.g. a human dragging a card while the
  AI is also mutating the board), the last write silently wins. Fine for a
  single-user MVP; would need addressing before multi-user use.
- **Card editing is minimal.** Only title/details, no due dates, labels, or
  assignees — a deliberate MVP simplification, but worth flagging as a real
  product gap, not an oversight.

### 2.2 Security

- **Hardcoded credentials in source code.** `USERNAME`/`PASSWORD` are
  literal strings in `auth.py`. Acceptable for this explicitly-scoped MVP
  requirement, but must never ship this way for real users — passwords need
  hashing (e.g. `bcrypt`/`argon2`) and to live in the database, not source
  control.
- **Session secret has an insecure default.** `SESSION_SECRET` falls back to
  a hardcoded string (`"local-development-secret"`) if the environment
  variable isn't set. This is convenient for local development but is a
  silent trap — if someone forgets to set it in a real deployment, every
  session is signed with a publicly-known secret. This should fail loudly
  (raise an error at startup) instead of silently falling back, once this
  moves beyond local development.
  **Resolved:** the app now refuses to start without `SESSION_SECRET`.
- **No rate limiting.** Both `/api/login` (brute-force risk) and `/api/chat`
  (cost-control risk — every call spends real money against the OpenRouter
  key) currently accept unlimited requests.
  **Resolved:** failed sign-ins are limited to 10 per minute per client and chat to 10 messages per minute per user (in memory, returning 429).
- **No CSRF defense beyond `SameSite=Lax`.** Adequate for many cases, but a
  dedicated CSRF token would be the more rigorous approach once this is
  exposed beyond a local, single-user context.
- **Everything runs over plain HTTP.** Fine for `localhost`; a production
  deployment needs TLS (HTTPS) in front of it, generally via a reverse proxy
  (e.g. Caddy, nginx, or a managed load balancer) rather than terminating
  TLS in the application itself.

### 2.3 Operations / Reliability

- **No structured logging or error monitoring.** Right now, a production
  failure would only be visible by manually reading container logs. A real
  deployment needs structured logs and an error-tracking tool (e.g. Sentry)
  so failures are surfaced automatically instead of waiting for a user
  complaint.
- **No automated CI pipeline.** All the tests exist and pass, but they run
  manually right now. This should be wired into a CI system (GitHub Actions,
  etc.) so every change is verified automatically before merge, with the
  coverage thresholds enforced as a hard gate rather than a manual check.
- **No backup strategy for the SQLite file.** A Docker named volume protects
  against container recreation, but not against disk failure or accidental
  `docker volume rm`. A real deployment needs a scheduled backup of the
  database file to separate storage.
- **Single-process, single-worker server.** Fine for one user; would need a
  process manager / multiple workers (and likely a move off SQLite — see
  below) to handle concurrent load.

### 2.4 Developer Experience

- **No dependency vulnerability scanning.** Nothing currently checks
  `npm`/`uv` dependencies for known CVEs. Tools like `npm audit`,
  `pip-audit`, or Dependabot/Renovate should be added.
  Partly addressed: both audits were run and the advisories fixed, but nothing runs them automatically.
- **Test data hygiene during manual/local testing.** Because the SQLite
  volume persists across runs, repeatedly running the app locally
  (especially E2E tests against it) accumulates leftover cards indefinitely.
  This isn't a production concern, but it's worth documenting a "reset local
  data" script (`docker volume rm pm_pm_data`) for contributors — currently
  that knowledge only exists in this review.
  **Resolved:** the E2E suite deletes its cards, and the root README documents the reset.

---

## 3. How I Would Productionize This

Roughly in priority order:

1. **Replace hardcoded auth with real accounts.** Add a `password_hash`
   column, use a proper hashing algorithm, and remove the single
   hardcoded credential path entirely.
2. **Move off SQLite for multi-user/concurrent scale**, or at minimum
   enable SQLite's WAL (write-ahead log) mode as a stop-gap. For real
   multi-user concurrency, PostgreSQL is the natural next step — the schema
   was already designed with multi-user ownership in mind, which makes this
   migration straightforward.
3. **Put a real reverse proxy in front of the app** (TLS termination,
   gzip/br compression, basic rate limiting) — e.g. Caddy or nginx, or a
   managed platform's built-in equivalent (Fly.io, Render, etc.).
4. **Introduce environment-based configuration** — distinct `.env` values
   (and ideally a secrets manager, not a checked-in file at all) for
   development, staging, and production, with the app refusing to start if a
   required production secret is missing rather than silently using a
   default.
5. **Add CI**: run lint, unit tests (with the 80% coverage gate enforced as
   a required check, not a manual step), and the Playwright suite against a
   built Docker image on every pull request.
6. **Add structured logging + error monitoring**, and basic uptime/health
   alerting on the `/api/health` endpoint.
7. **Add rate limiting** on `/api/login` and `/api/chat` (e.g. a simple
   in-memory or Redis-backed limiter).
8. **Add a migrations tool** before the schema changes again.
9. **Add automated backups** of the database volume.
10. **Revisit the AI cost/abuse story**: track usage per user, consider a
    per-user or global daily request cap, and make the loop in `chat.py`
    atomic as described above.

---

## 4. General Advice and Evaluation

- **This is a genuinely solid MVP for its stated scope.** The
  architecture is simple, each layer does one clear job, and the choices
  (FastAPI, SQLite, Next.js static export, Docker) are all justifiable,
  boring, well-documented technologies rather than speculative or exotic
  ones — that is usually the right call for a first version.
- **The biggest gap between "MVP" and "production" is almost entirely in
  the categories that don't show up in a demo**: authentication hardening,
  observability, backups, and abuse/cost controls. None of these are
  visible when you personally click around the app and it works — they only
  matter once real, unpredictable users and real failure modes show up. This
  is a very common and very reasonable place for an MVP to stop, as long as
  the gap is known and explicit (which is the purpose of this document).
- **Testing discipline was the single highest-leverage decision.** The
  requirement to prove behavior in a real browser against a real Docker
  build (not just "the code looks right") is what caught a bug that would
  otherwise have shipped and confused real users. I'd recommend keeping
  that discipline non-negotiable even as the project grows and it becomes
  tempting to skip it under time pressure.
- **Treat this review as a backlog, not a blocker.** None of the items above
  need to happen before you keep using this locally as intended. They matter
  once/if this is exposed to the internet or to more than one real person.

---

## 5. Suggested Next Steps (If Continuing This Project)

1. Decide whether this stays a personal/local tool or becomes multi-user —
   that decision determines whether items in section 3 are worth doing at
   all, or premature.
2. If going multi-user: start with real authentication (item 3.1) and a
   Postgres migration (item 3.2) before anything else, since every other
   security item depends on "who is actually logged in" being trustworthy.
3. If staying local/personal: the highest-value remaining work is probably
   the atomic AI-operation fix (section 2.1) and a documented data-reset
   script, since those affect correctness and day-to-day usability even for
   a single user.
