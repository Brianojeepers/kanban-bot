# Frontend Guide

## Purpose

This directory contains the Next.js Kanban app. It is statically exported (`output: "export"`) and served by FastAPI on the same origin. Board data, sign in, and chat come from the authenticated FastAPI API.

## Structure

- `src/app/page.tsx` renders `AuthGate` at `/`.
- `src/components/AuthGate.tsx` checks the session, shows the sign-in form or the board with the chat sidebar, and holds the board state that `KanbanBoard` and chat replies update.
- `src/components/ChatSidebar.tsx` loads and sends chat messages through `/api/messages` and `/api/chat`.
- `src/app/layout.tsx` defines metadata and the Manrope and Space Grotesk fonts.
- `src/app/globals.css` defines the shared color variables and global styles.
- `src/components/KanbanBoard.tsx` owns board state, API mutations, and DnD Kit event handling.
- `src/components/KanbanColumn.tsx` renders a droppable column, its rename input, cards, empty state, and new-card form.
- `src/components/KanbanCard.tsx` renders a sortable card with a Move drag handle (pointer or keyboard) and its edit and delete controls. The card itself is not draggable, so its buttons are not nested in a button.
- `src/components/KanbanCardPreview.tsx` renders the active drag overlay.
- `src/components/NewCardForm.tsx` owns the add-card form's open, submit, validation, and cancel states.
- `src/lib/api.ts` is the client API module for board reads and mutations.
- `src/lib/kanban.ts` contains board types and the drag-and-drop helpers: `getMoveTarget` (where a drop lands), `columnKeyboardCoordinates` (arrow keys move between columns and past neighbouring cards) and `boardAnnouncements` (screen reader messages by title). Test board data lives in `src/test/fixtures.ts`.
- `src/**/*.test.tsx` and `src/**/*.test.ts` are Vitest unit and component tests.
- `tests/` contains Playwright browser integration tests.

## Current Behavior

- The board has exactly five ordered columns. Their titles can change; their count and order do not.
- Cards contain a title and details. Cards can be added, edited, deleted, reordered, and moved; every change is persisted through the API.
- `getMoveTarget` decides where a dropped card lands: at the end of a column, or at the index of the card it is dropped on. The backend applies the move and returns the board.
- The visual system uses the color variables in `globals.css`: yellow accent, blue primary, purple secondary, navy headings, and gray supporting text.

## Development

- Run `npm run dev` for the Next.js development server. It proxies `/api` to the backend on port 8000, which must be running.
- Run `npm run lint` before completing frontend work.
- Run `npm run test:unit` for Vitest, `npm run test:e2e` for Playwright (against the Docker app at http://localhost:8000 unless `PLAYWRIGHT_BASE_URL` is set), and `npm run test:all` for both.
- Maintain at least 80% statement, branch, function, and line unit-test coverage. Cover critical board workflows in Playwright.

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
