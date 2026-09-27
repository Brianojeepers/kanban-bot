# Code Review (Snarky Claude)

Reviewed at commit `a9dbbf8`. This is the second pass. The first pass read the code; this one started the app with `scripts/start.sh` and used Playwright to try each finding against the running Docker app. The review covers everything in `backend/app/`, `frontend/src/`, `frontend/tests/`, `Dockerfile`, `compose.yaml` and `scripts/`, plus the three earlier reviews in `docs/`, which I read so I could check whether anyone acted on them. (Spoiler: nobody did.)

## Resolution

The five fixes in the last section have been made. Everything else in this review is still open.

| Finding | Change | Verified by |
|---|---|---|
| 1. Drag down one slot | `getMoveTarget` uses the hovered card's index in the original list | Corrected unit test; new E2E "moves a card down one place within its column" |
| 2. AI edit erases details | `EditCard.details` is required | New malformed-reply case "edit without details" |
| 3. Enter double send | `send` returns early while `isSending` | New unit test "does not send again on Enter while a reply is pending" |
| 4. Unbounded sizes | Titles are limited to 200 characters, details and chat messages to 2,000; blank chat messages are rejected. Inputs have matching `maxLength`. | New backend test; live API now returns 422 for a 1 MB title and a blank chat message |
| 7. Plan overclaims E2E | Added the reorder, logout and 375px layout tests | Playwright: 11 passed against the rebuilt Docker app |

After the fixes: backend 67 passed (98.4% coverage), frontend 41 passed (93.6% statements, 86.8% branches), lint clean.

## The project in one breath

This is a single-user Kanban board with an AI sidebar. A Next.js app is statically exported and served by FastAPI from the same origin, all packed into one Docker image on `127.0.0.1:8000`. SQLite lives in the `pm_data` volume at `/data/pm.db`.

- **Auth:** there is one hardcoded account, `user` / `password`, in `backend/app/auth.py`, which is security in the way a screen door is a door. The session cookie is `username.hmac(username)`, signed with `SESSION_SECRET`.
- **Board:** five fixed columns and cards with an explicit `position`. `board.py` uses raw `sqlite3`, and every mutation endpoint returns the whole board.
- **AI:** `chat.py` sends the system prompt, the last 20 messages, and the board as JSON to `openai/gpt-oss-120b` via OpenRouter in JSON mode. It validates the reply with Pydantic and applies the operations in one transaction, so a bad card id rolls back the whole batch.
- **Rate limits:** in-memory rolling windows. That's 10 failed sign-ins per minute per client, and 10 chats per minute and 100 per day per user.

## How this was verified

| Check | Result |
|---|---|
| `scripts/start.sh`, then `GET /api/health` | `{"status":"ok"}` at `http://localhost:8000` |
| Backend `uv run pytest --cov` | 64 passed, 98.4% coverage with branches |
| Frontend `vitest --coverage` | 40 passed, 93.2% statements, 85.9% branches, 91.5% functions, 94.9% lines |
| `npm run lint` | Clean |
| **Playwright `npm run test:e2e`** against the Docker app | **8 passed in 3.7s** |
| **Playwright bug probes** (temporary, see below) | 8 of 8 reproduced the reported behavior |

**About the probes.** I wrote temporary Playwright specs that drive the live app in Chromium to reproduce each finding. Where a failure had to be forced (a 500, a slow response), I used `page.route`. The probes never called OpenRouter, because every chat request was intercepted. They cleaned up after themselves, and the probe files have been deleted from the repo; a copy is in my session scratchpad if you want it. I left your board as I found it.

AI behavior that can't safely be triggered live (it would mean paying OpenRouter to maybe misbehave) was reproduced in-process against a temporary SQLite file, with `httpx.post` mocked, exactly as the backend tests do.

The tests are green and coverage is excellent. This matters, because every bug below got past a very well-lit room, and now I've watched each one happen in a real browser.

## The headline

This repo now holds **three code reviews** (`code_review.md`, `code_review_amp.md`, `code_review_claude.md`) and a `review.md`. Between them they agree on roughly a dozen issues. The number fixed since those reviews landed is **zero**. The latest commit's message is "created associated review documents for comparison". So they were compared. They were not acted on.

This is the fourth review, and this time every bug comes with a reproduction. Harder to file away. Not impossible.

---

## High

### 1. You still can't drag a card down one slot

`frontend/src/lib/kanban.ts:27-29` **Reproduced live.**

```ts
const remainingCardIds = targetColumn.cardIds.filter((cardId) => cardId !== activeId);
const position = targetColumn.id === overId ? remainingCardIds.length : remainingCardIds.indexOf(overId);
if (targetColumn.id === sourceColumn.id && sourceColumn.cardIds.indexOf(activeId) === position) return null;
```

Playwright added `Probe 1`, `Probe 2` and `Probe 3` to Backlog, dragged each Move handle with the mouse, and then read the order back from `/api/board`:

| Action | Resulting order | Expected |
|---|---|---|
| Start | `1, 2, 3` | |
| Drop 1 on 2 | `1, 2, 3`: **nothing happened** | `2, 1, 3` |
| Drop 1 on 3 | `2, 1, 3`: **one slot short** | `2, 3, 1` |
| Drop 3 on 2 (upward) | `3, 2, 1`: correct | `3, 2, 1` |

Moving up works and moving down doesn't, which is exactly as predicted from the code. So the one core feature of a Kanban board, moving a card down, is broken in the most common direction.

`kanban.test.ts:21` asserts the wrong answer (`card-1` over `card-3` gives position `1`), and the Playwright suite has no reorder-within-a-column test at all (see finding 7). The unit test defends the bug, and the browser test that would have caught it doesn't exist.

**Fix:** index into the original list for card drops, `targetColumn.cardIds.indexOf(overId)`, correct the unit test to expect `2`, and add a Playwright test that drops a card on the one below it.

---

## Medium

### 2. An AI edit that leaves out `details` wipes the card

`backend/app/chat.py:32-36` and `backend/app/board.py:117-119` **Reproduced** (in-process, OpenRouter mocked).

I fed `chat.ask` a model reply of `{"action": "edit_card", "card_id": "card-1", "title": "Roadmap v2"}`:

```
before: {'title': 'Align roadmap themes', 'details': 'Draft quarterly themes with impact statements and metrics.'}
after:  {'title': 'Roadmap v2', 'details': ''}
```

The details were erased without a word. `EditCard.details` defaults to `""`, and "rename this card" is exactly the request where a concise model leaves `details` out. The system prompt asks nicely for all fields. The schema doesn't enforce it. Asking an LLM nicely is not a type system.

**Fix:** make `details` required on `EditCard` (drop the default), so an incomplete edit fails validation instead of destroying data.

### 3. Enter sends a second chat message while the first is in flight

`frontend/src/components/ChatSidebar.tsx:46` and `:68` **Reproduced live.**

With `/api/chat` delayed by 1.5 seconds, I typed "first" and pressed Enter, then typed "second" and pressed Enter. **Two requests were sent** while the Send button showed as disabled. `sendOnEnter` calls `form.requestSubmit()`, which doesn't care about the button. In the real app, both requests would spend quota, both would change the board, and the second reply would overwrite the first in the chat. Since AI calls are the only thing in this app that costs money, this is the bug that costs money.

**Fix:** return early from `send` when `isSending` is true.

### 4. Nothing limits the size of anything

`backend/app/main.py:47-48`, `backend/app/board.py:24` **Reproduced live** (for card titles).

`POST /api/columns/col-backlog/cards` with a **1,000,000-character title returned 200**. That card is then serialized into every AI prompt until someone deletes it. `ChatRequest.message` has no limit either and accepts whitespace-only messages. I didn't send one of those live, because it would have gone to OpenRouter. The rate limiter caps how *many* requests someone can make, not how *large* they are.

**Fix:** add `max_length` to the message, `Title` and `details`, and add `min_length=1` with stripping to the message.

### 5. The chat history shows up twice

`frontend/src/components/ChatSidebar.tsx:15` **Reproduced live.**

With `/api/messages` delayed by 2 seconds, I sent a chat that got an immediate reply. When the history then arrived, it was prepended to a list that already contained it. **The old answer appeared twice.** The cause is the `[...history, ...current]` merge. It takes a slow first load, but a cold container or a big history is enough.

**Fix:** `setMessages((current) => current.length ? current : history)`.

### 6. Out-of-order responses can roll the board back

`frontend/src/components/KanbanBoard.tsx:47-55` **Not reproduced** (code reading only).

Every mutation replaces the board with whatever response arrives, whenever it arrives. Two quick drags, or a drag plus a chat reply, can resolve out of order, so the board shows the older state. Also, a failed move restores `previous`, the snapshot taken at drop time, which undoes any successful change that finished in between. I didn't build a probe with two deliberately misordered responses, so treat this one as likely rather than proven.

**Fix:** keep a request counter and ignore responses older than the newest one sent.

### 7. The plan's checkboxes say more than the tests do

`docs/PLAN.md` versus `frontend/tests/kanban.spec.ts` **New in this pass.**

The plan ticks off browser coverage that does not exist:

| `PLAN.md` claims | In `kanban.spec.ts`? |
|---|---|
| Part 3: "same-column reorder" | No. Every drag in the suite moves between columns, which is why finding 1 survived. |
| Part 3: "mobile layout smoke test" | No viewport test at all. (I checked it myself: 0px of horizontal overflow at 375px wide. It passes. Nobody asked it.) |
| Part 4: "Browser tests cover ... logout" | No test clicks Log out. |

The suite itself is solid for what it covers. It's fast (3.7s), cleans up its own cards, and uses the accessible roles and names. But a checked box that isn't true is worse than an unchecked one, because it tells the next person not to look.

**Fix:** add the three tests (about 30 lines in total), or untick the boxes.

---

## Low

### 8. If the board fails to load, there's no way out

`frontend/src/components/KanbanBoard.tsx:43-45` **Reproduced live.**

With `/api/board` returning 500 after sign-in, the page shows "Unable to load board." and **no Log out button**. The component returns before rendering the header, which is where the button lives. There's no retry either. The only way out is to clear cookies, which is a lot to ask of someone whose board just failed to load.

### 9. Failed edits and creates throw away your typing

`NewCardForm.tsx:18-20`, `KanbanColumn.tsx:34-38`, `KanbanCard.tsx:34` **Reproduced live.**

- **Create:** with the create endpoint returning 500, I typed a title and a paragraph of details and clicked Add card. The form closed and **both were gone**, replaced by "Unable to add card."
- **Rename:** with the rename endpoint returning 500, **the input kept showing "Probe rename"** while the server still had "Backlog". The page says one thing and the database says another, until the next reload quietly settles it.
- **Edit:** it follows the same pattern as create (the form closes before the request resolves). It also has no Cancel button, so the only way out of edit mode is Save.

### 10. "Per client address" is really "per Docker gateway"

`backend/app/main.py:73` **Confirmed** from the container logs.

```
INFO:     172.18.0.1:63722 - "GET /api/board HTTP/1.1" 200 OK
```

Every request arrives from `172.18.0.1`, the Docker bridge gateway. So the "10 failed sign-ins per minute per client address" limit is one shared counter for everyone. It's harmless while the port is bound to `127.0.0.1`. But the docs promise per-client behavior the code doesn't deliver. It also means the E2E test "rejects a wrong password" uses up one of the shared 10 on every run.

### 11. `CLAUDE.md` is wrong about `initialize()`

`CLAUDE.md` says `initialize()` "runs on each read". It runs once, in `lifespan` (`main.py:21`). Any agent trusting that line will reason wrongly about what happens if the DB file disappears mid-run (answer: 500s until restart).

### 12. Sessions are immortal

`backend/app/auth.py:14-28`

The token is a pure function of the username, has no expiry, and logout only asks the browser to forget it. A copied cookie works until the heat death of the universe or the next `SESSION_SECRET` rotation, whichever comes first. For a localhost MVP this is acceptable. It still needs fixing before a second account exists.

### 13. Rate-limit check and record aren't atomic

`backend/app/main.py:140-143`, `backend/app/rate_limit.py:26-39`

The check and the record take the lock separately, so concurrent requests can all pass `check` before any of them calls `record`. Together with finding 3, which is now proven to send two requests at once, you can race yourself past your own quota.

### 14. Every chat reply ships the full history

`backend/app/chat.py:64` and `:91`

`board.messages()` loads every message ever sent, then slices off the last 20 for the model and returns all of them to the browser on every chat. That's fine at 100 messages. After a year it's a very expensive way to say "Done."

### 15. The E2E suite runs against your real data

`frontend/playwright.config.ts`

`npm run test:e2e` targets the Docker app, which uses the `pm_data` volume that holds your actual board. Cleanup happens in `afterEach` by matching card titles against a regex. So a crashed run, or a card you happen to title "Playwright card 1", leaves junk behind or gets deleted. Pointing the tests at a throwaway volume (a second compose profile, or `DATABASE_PATH` on a separate container) would make this impossible.

### 16. A 401 in the console on every visit

Loading the page while signed out logs `Failed to load resource: 401 (Unauthorized)` from the `/api/session` check. It's expected and harmless, and it was the only console error across all the probe runs. I'm mentioning it so the next person who sees it in the console knows it's expected.

---

## Nitpicks I'm contractually obligated to make

- `board.board()` (`board.py:100-102`) runs one query for cards and then one more per column to get the ordering. The first query already returns the cards ordered by `position`, so build `cardIds` from it and skip five queries.
- `AuthGate.tsx:44` and `KanbanCard.tsx:34` are each a single line of JSX over 400 characters long. Your formatter isn't lazy. It's been told not to look.
- `create_card` fills in `"No details yet."` for empty details, but `update_card` happily saves `""`. Pick one. (Finding 2 is what happens when you don't.)
- AI failures count toward the daily quota (`main.py:142-145`). That's intentional and commented, but three bad replies in a row cost the user three of their 100 daily messages for the model's mistake.

---

## Status of earlier findings

| Issue | Earlier reviews | Status at `a9dbbf8` |
|---|---|---|
| Drag down one slot | claude #1 | Open, **reproduced** (finding 1) |
| AI edit erases details | claude #2, code_review L4 | Open, **reproduced** (finding 2) |
| Double send via Enter | claude #3 | Open, **reproduced** (finding 3) |
| Unbounded sizes | all three | Open, **reproduced** (finding 4) |
| Duplicate history | code_review M3, amp M4 | Open, **reproduced** (finding 5) |
| Out-of-order board state | all three | Open, not reproduced (finding 6) |
| Lost drafts / stale rename | all three | Open, **reproduced** (finding 9) |
| Non-atomic rate limit | all three | Open (finding 13) |
| Immortal sessions | all three | Open (finding 12) |
| AI ops and messages not one transaction | code_review M4, amp M3 | Open (low impact: a crash between the two just loses the chat log entry) |
| Start scripts announce success before readiness | code_review M6, amp L4 | Open. `start.sh` prints "running" before uvicorn is up, so I polled `/api/health` myself. |
| WCAG contrast on `#888888` text | amp M6 | Open (it's your brand color, so this one is a design argument, not a bug) |

## What's genuinely good

I'm snarky, not blind.

- The backend is small, readable and correct where it matters. Every query is scoped by username, cross-board ids come back as 404s, and the AI operations run in a single transaction that rolls back on a bad id.
- Validating the AI reply with a discriminated Pydantic union before touching the database is exactly right.
- Keyboard drag and drop, with custom column navigation and title-based screen reader announcements, is more accessibility effort than most production apps manage. And the E2E suite actually tests it.
- The Docker setup is tidy: localhost-only binding, a non-root runtime user, and a locked `uv sync`. It built and started without complaint.
- The mobile layout holds at 375px with no horizontal overflow, and normal use produced no console errors beyond the expected 401.
- The coverage is real, not padded.

## If you fix only five things

1. **Finding 1:** one line of code, one line of unit test and one Playwright test. Your board can't move cards down, and now you've got the table to prove it.
2. **Finding 2:** delete `= ""` on one line. The AI can delete your data.
3. **Finding 3:** add one `if` statement. It costs you money.
4. **Finding 4:** add three `max_length`s. They also cost you money.
5. **Finding 7:** write the three E2E tests the plan says exist, or untick the boxes. Honest checkboxes are free.

That's about 30 minutes of work. The nearly 1,000 lines of review documents in `docs/` took longer, and I'm aware I'm contributing to that count.
