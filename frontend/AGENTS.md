# Frontend Guide

## Purpose

This directory contains the Next.js Kanban app. It is statically exported (`output: "export"`) and served by FastAPI on the same origin. Board data, sign in, and chat come from the authenticated FastAPI API.

## Structure

- `src/app/page.tsx` renders `AuthGate` at `/`.
- `src/components/AuthGate.tsx` checks the session and shows the sign-in or create-account form, or the `Workspace`.
- `src/components/Workspace.tsx` loads the user's boards and holds the open board id and board data that `KanbanBoard` and chat replies update; data for a board that is no longer open is dropped. It passes `BoardSwitcher` (select, new, activity, archive, share, rename, delete; boards shared with the user are labelled with their owner, and rename and delete are owner-only) and the account and log out buttons into the board header, and opens `MyWorkDialog` (open cards assigned to the user on every board; choosing one opens its board, refreshing the board list if needed), `ActivityDialog` (recent board activity), `ArchiveDialog`, `ShareDialog` (members; the owner adds and removes them, a member can leave) and `AccountDialog` (change password, delete account).
- `src/components/Modal.tsx` is the shared dialog shell (title, subtitle, close button, Escape to close) and form classes used by every dialog. On desktop the board and sidebar fill the viewport height. The sidebar can be hidden (kept mounted, so pending replies survive) to give the board the full width; it remounts per board.
- `src/components/ChatSidebar.tsx` loads and sends the open board's chat messages. On a shared board, teammates' messages are labelled with their author.
- `src/app/layout.tsx` defines metadata and the Manrope and Space Grotesk fonts.
- `src/app/globals.css` defines the shared color variables and global styles.
- `src/components/KanbanBoard.tsx` loads the open board and owns API mutations, the card filter, and DnD Kit event handling. It renders the compact header (header slots, progress through the last column, overdue and due-soon counts), `BoardFilters`, and a five-column grid that fills the width and scrolls sideways once columns would drop below 14rem. The grid row is `minmax(max-content, auto)`: it grows with the longest column, so cards never spill out of their column's droppable area. Each column gets one palette color by position.
- `src/components/CardDialog.tsx` shows a card's checklist (add, tick at once with rollback on failure, remove) and comments (add, delete own); `KanbanBoard` opens it.
- `src/components/ArchiveDialog.tsx` lists the board's archived cards, restores them, and deletes them for good after confirmation.
- `src/components/BoardFilters.tsx` renders the search, priority, assignee (on shared boards), label (when the board has labels) and due date (overdue, or due within `DUE_SOON_DAYS`) filters. Filtering only hides cards; moves still use the full card order. Cards added after the filter last changed (by the user or the assistant) stay visible until it changes again.
- `src/components/KanbanColumn.tsx` renders a droppable column, its rename input, cards, empty state, and new-card form.
- `src/components/KanbanCard.tsx` renders a sortable card with its label, priority, due date (overdue in the danger color, due today or within 3 days in yellow), assignee, checklist progress and comment count badges; each label keeps one color from `labelColor`. It has a grip-icon Move drag handle (pointer or keyboard) and small open, edit, archive and delete icon buttons that float over the card on hover or focus (always shown on touch screens). Edit mode edits title, details, priority, due date, labels (comma-separated) and assignee, with Save and Cancel. The card itself is not draggable, so its buttons are not nested in a button.
- `src/components/KanbanCardPreview.tsx` renders the active drag overlay.
- `src/components/NewCardForm.tsx` owns the add-card form (title, details, priority, due date) and its open, submit, validation, and cancel states.
- `src/lib/api.ts` is the client API module for every endpoint. Failed requests throw `ApiError` with the server's `detail`.
- `src/lib/kanban.ts` contains board types and the drag-and-drop helpers: `getMoveTarget` (where a drop lands), `columnKeyboardCoordinates` (arrow keys move between columns and past neighbouring cards) and `boardAnnouncements` (screen reader messages by title). It also has the due date helpers (`localToday`, `dueStatus`, `isDueSoon`, `DUE_SOON_DAYS`, `formatDueDate`), label helpers (`labelColor`, `parseLabels`), `timeAgo`, and the card filter (`CardFilter`, `matchesFilter`). Test board data and `makeCard` live in `src/test/fixtures.ts`.
- `src/**/*.test.tsx` and `src/**/*.test.ts` are Vitest unit and component tests.
- `tests/` contains Playwright browser integration tests.

## Current Behavior

- The board has exactly five ordered columns. Their titles can change; their count and order do not.
- Cards contain a title and details, and optionally a priority, due date, assignee, labels and checklist; they can have comments. Cards can be added, edited, archived, restored, deleted, reordered, and moved; every change is persisted through the API.
- A component that takes `onBoardChange` must receive a stable function (as `Workspace` passes one from `useCallback`): `KanbanBoard` reloads the board whenever it changes.
- `getMoveTarget` decides where a dropped card lands: at the end of a column, or at the index of the card it is dropped on. The backend applies the move and returns the board.
- Icons come from `lucide-react`. Icon-only buttons need an `aria-label` naming the card, such as `Edit {title}`, and a `data-tooltip` saying what they do (use `data-tooltip-align="end"` near the right edge of the screen or a scrolling area). Tooltips are CSS-only (`globals.css`) and are only rendered on hover or keyboard focus, so they never widen the page; do not use `title`. Disabled buttons keep the pointer so their tooltip can explain why.
- Scroll containers must be positioned (`relative`): otherwise `sr-only` text inside them (absolutely positioned) escapes and widens or lengthens the page.
- The visual system uses the color variables in `globals.css`: yellow accent, blue primary, purple secondary, navy headings, and gray supporting text.

## Development

- Run `npm run dev` for the Next.js development server. It proxies `/api` to the backend on port 8000, which must be running.
- Run `npm run lint` before completing frontend work. `npm run build` type-checks test files too, so keep tests type-correct or the Docker build fails.
- Run `npm run test:unit` for Vitest, `npm run test:e2e` for Playwright (against the Docker app at http://localhost:8000 unless `PLAYWRIGHT_BASE_URL` is set), and `npm run test:all` for both.
- Maintain at least 80% statement, branch, function, and line unit-test coverage. Cover critical board workflows in Playwright. `tests/kanban.spec.ts` uses the demo account's board (id 1); `tests/workspace.spec.ts` covers accounts and boards, and registers only one new account per run because registration is limited to 5 an hour per address; the sharing test reuses an `e2e-member` account, registering it only on the first run. Its `afterEach` deletes the demo account's test boards (timestamped names) even when a test fails.

## API Boundary

- Keep OpenRouter keys, session secrets, and database access out of this directory's browser code.
- Board reads and mutations use the FastAPI API on the same origin, authenticated by an HTTP-only cookie.
- The board remains responsible for orchestration; data loading and mutations go through `src/lib/api.ts`.
- Do not add column creation, deletion, or reordering. The fixed five-column contract must remain valid for API and AI operations.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
