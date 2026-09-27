# Amp Code Review

Date: 2026-09-27  
Commit reviewed: `9e557f3` (`main`)

## Executive summary

The MVP is well structured and substantially complete. The backend keeps routes thin, scopes board access by user, validates AI operations before applying them, and preserves card order. The frontend cleanly separates API, board, card, authentication, and chat concerns. Secrets remain server-side, the container is localhost-only, and the automated suites provide strong baseline coverage.

No critical or high-severity issue was found for the stated local, single-user deployment. The most important remaining risks are concurrent responses replacing newer UI state, rate limits that can be exceeded by simultaneous requests, and AI board changes being committed separately from their chat messages.

## Verification performed

| Check | Result |
|---|---|
| Backend tests | 64 passed; 98.43% aggregate coverage |
| Frontend unit/component tests | 40 passed |
| Frontend coverage | 93.2% statements, 85.91% branches, 91.46% functions, 94.89% lines |
| Frontend lint | Passed |
| Frontend production build | Passed |
| Playwright against the running app | 8 passed |
| Production dependency audit | 0 known vulnerabilities |
| Compose validation and shell syntax | Passed |

The backend's ignored virtual environment had stale executable paths from an earlier checkout location. It was recreated from `uv.lock`; this was a local environment issue, not an application defect.

## Findings

### M1. Concurrent board updates can replace newer frontend state

**Severity: Medium**  
**Files:** `frontend/src/components/KanbanBoard.tsx:47-54, 68-80`, `frontend/src/components/AuthGate.tsx:42`

Every mutation returns a complete board snapshot and installs it with `onBoardChange`. If two requests overlap and the older request finishes last, its response can replace the newer board. A failed optimistic drag can also restore its captured `previous` board over changes that succeeded while the move was pending. Chat uses the same parent state setter, so an AI response can participate in the same race.

**Impact:** the database can be correct while the UI temporarily loses a recent edit, move, add, delete, or AI update until reload.

**Recommendation:** serialize board mutations or version requests and ignore stale completions. On an optimistic mutation failure, fetch the authoritative board instead of restoring an old snapshot. Add a component test that resolves two requests in reverse order.

### M2. Rate-limit checking and recording are not atomic

**Severity: Medium**  
**Files:** `backend/app/rate_limit.py:26-39`, `backend/app/main.py:73-77, 140-143`

`check()` and `record()` lock independently. Several simultaneous requests can all pass `check()` before any request records its call. Chat also checks its minute and daily limits separately.

**Impact:** concurrent traffic can exceed the failed-login and AI-spend limits that the application claims to enforce.

**Recommendation:** replace the split methods with an atomic `consume(key)` operation that prunes, checks, and records under one lock. Add a coordinated concurrency test rather than only sequential limit tests.

### M3. AI board changes and chat messages are not one transaction

**Severity: Medium**  
**Files:** `backend/app/chat.py:79-90`, `backend/app/board.py:147-149`

All AI board operations correctly share one transaction, but that transaction commits before the user and assistant messages are inserted through two separate connections. A database or process failure can therefore leave board changes without the matching conversation, or persist only the user message.

**Impact:** the board and persisted conversation can disagree after a partial failure, even if the client receives an error.

**Recommendation:** apply operations and insert both messages through one connection and transaction. Add a failure-injection test proving that a failed message insert rolls back the entire turn.

### M4. Initial chat history can duplicate a completed chat response

**Severity: Medium**  
**Files:** `frontend/src/components/ChatSidebar.tsx:15, 18-42`

The history request prepends its result to current state whenever it resolves. If a chat request returns its authoritative `messages` first, the older history response can resolve afterward and prepend those same persisted messages again.

**Impact:** chat bubbles can be duplicated until reload.

**Recommendation:** finish history loading before enabling send, cancel/ignore a superseded history request, or merge by stable message IDs. Add the missing test where chat resolves before history.

### M5. The documented quality gates are not fully enforced

**Severity: Medium**  
**Files:** `frontend/package.json:10-14`, `frontend/vitest.config.ts:11-19`, `backend/pyproject.toml:22-27`, `frontend/tests/kanban.spec.ts`, `docs/PLAN.md`

- `npm run test:unit` does not enable coverage, so the configured frontend thresholds are skipped by the documented command.
- Backend coverage enforces only one aggregate percentage, not each metric promised by the plan.
- Playwright does not cover several workflows marked complete in the plan: column rename, same-column reorder, logout/protected access, and mobile layout. Only the edit path explicitly verifies persistence after reload.
- The mocked chat browser test verifies that a returned board renders, but not that an AI mutation persists through the backend.

**Impact:** explicit acceptance criteria can regress while the standard project commands remain green.

**Recommendation:** make the normal unit command run coverage, enforce the intended backend metrics where supported, and add focused browser cases for the missing contractual workflows. Otherwise, narrow the plan so it accurately states the enforced standard.

### M6. Normal-size supporting text does not meet WCAG AA contrast

**Severity: Medium**  
**Files:** `frontend/src/app/globals.css:8`, with examples in `KanbanBoard.tsx:93-101`, `KanbanColumn.tsx:53-55, 79-80`, and `ChatSidebar.tsx:53, 62`

`#888888` on white is approximately 3.5:1, below the 4.5:1 requirement for normal text. The token is used for text as small as 12–14px.

**Impact:** supporting text can be difficult to read for users with low vision.

**Recommendation:** preserve `#888888` as a nonessential visual token if required by the palette, but introduce a darker accessible token for small text.

### L1. Failed form submissions can lose drafts or look saved

**Severity: Low**  
**Files:** `frontend/src/components/NewCardForm.tsx:13-20`, `KanbanCard.tsx:34`, `KanbanColumn.tsx:27-38`

Add and edit forms close before persistence succeeds, so failures discard entered text. A failed column rename can continue displaying its unsaved local value.

Return a promise from mutation callbacks and reset or close forms only after success. Restore the server title after a failed rename and prevent duplicate submissions while pending.

### L2. Authentication actions do not handle network and expired-session failures cleanly

**Severity: Low**  
**Files:** `frontend/src/components/AuthGate.tsx:19-39`, `frontend/src/lib/api.ts:3-9`

Login and logout have no `try/catch`; a network failure can become an unhandled rejection. Logout switches views even when the server did not clear the cookie. A 401 from a board mutation is shown as a generic board error while the authenticated shell remains visible.

Add pending/error states, change views only after successful logout, and route API 401 responses back through the authentication boundary.

### L3. Request and model-output sizes are unbounded

**Severity: Low for localhost MVP**  
**Files:** `backend/app/main.py:28-48`, `backend/app/chat.py:25-53, 60-70`

Card details, chat messages, assistant responses, and AI operation counts have no practical maximum. Rate limiting controls request count but not request size or provider token use.

Add sensible Pydantic length limits, cap operation count, and specify a provider output-token limit before any network-exposed deployment.

### L4. Startup scripts announce success before readiness

**Severity: Low**  
**Files:** `scripts/start.sh:5-6`, `scripts/start.ps1:3-4`, `compose.yaml`

The scripts print that the app is running immediately after detached Compose startup. Missing configuration or an initialization crash can still result in the success message.

Add a container healthcheck and wait for `/api/health` with a bounded timeout before reporting success.

### L5. Sessions have no expiry or server-side revocation

**Severity: Low for localhost MVP**  
**Files:** `backend/app/auth.py:14-27`, `backend/app/main.py:87-90`

The session is a deterministic username signature with no timestamp. Logout deletes the browser cookie but cannot invalidate a copied token; it remains valid until `SESSION_SECRET` changes.

Include a signed issued/expiry timestamp before deploying beyond a trusted local machine.

### L6. New-card fields lack persistent labels

**Severity: Low**  
**File:** `frontend/src/components/NewCardForm.tsx:27-44`

The title and details controls rely on placeholders rather than labels. Placeholders disappear after typing and are not a substitute for persistent accessible labels.

Add visible labels or explicit accessible names.

## Recommended order of work

1. Coordinate frontend board updates and chat-history loading (M1, M4).
2. Make rate-limit consumption atomic (M2).
3. Commit each AI turn and its board operations atomically (M3).
4. Align executable test gates with `docs/PLAN.md` (M5).
5. Address text contrast and failed-form behavior (M6, L1).
6. Apply the remaining hardening before any non-local deployment (L2-L6).

## What is already strong

- Every board and chat data path is scoped to the authenticated username.
- AI operations are schema-validated and reuse the same board mutation functions as HTTP endpoints.
- A bad AI operation rolls back all operations in that response.
- Card ordering and adjacent-column movement have strong regression coverage.
- Secrets remain out of frontend code and the Docker build context.
- Compose binds the service to `127.0.0.1`, matching the local-only requirement.
- The container runs the application as a non-root user after preparing the data volume.
- Lockfiles, linting, unit coverage, production build, browser tests, and dependency audit are all currently healthy.
