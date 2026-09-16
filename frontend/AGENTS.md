# Frontend Guide

## Purpose

This directory contains the current Next.js Kanban demo. It is client-only today: board data is initialized in memory and resets on page reload. Later phases replace that state with authenticated FastAPI requests without duplicating board behavior.

## Structure

- `src/app/page.tsx` renders `KanbanBoard` at `/`.
- `src/app/layout.tsx` defines metadata and the Manrope and Space Grotesk fonts.
- `src/app/globals.css` defines the shared color variables and global styles.
- `src/components/KanbanBoard.tsx` owns board state and DnD Kit event handling.
- `src/components/KanbanColumn.tsx` renders a droppable column, its rename input, cards, empty state, and new-card form.
- `src/components/KanbanCard.tsx` renders a sortable card and its delete control.
- `src/components/KanbanCardPreview.tsx` renders the active drag overlay.
- `src/components/NewCardForm.tsx` owns the add-card form's open, submit, validation, and cancel states.
- `src/lib/kanban.ts` contains board types, demo seed data, card-move logic, and ID creation.
- `src/**/*.test.tsx` and `src/**/*.test.ts` are Vitest unit and component tests.
- `tests/` contains Playwright browser integration tests.

## Current Behavior

- The board has exactly five ordered columns. Their titles can change; their count and order do not.
- Cards contain a title and details. The current demo supports adding, deleting, reordering, and moving cards; editing existing cards is planned for the API-backed board.
- `moveCard` is the source of truth for same-column ordering and cross-column insertion.
- The visual system uses the color variables in `globals.css`: yellow accent, blue primary, purple secondary, navy headings, and gray supporting text.

## Development

- Run `npm run dev` for the Next.js development server.
- Run `npm run lint` before completing frontend work.
- Run `npm run test:unit` for Vitest, `npm run test:e2e` for Playwright, and `npm run test:all` for both.
- Maintain at least 80% statement, branch, function, and line unit-test coverage. Cover critical board workflows in Playwright.

## Future API Boundary

- Keep OpenRouter keys, session secrets, and database access out of this directory's browser code.
- Future board reads and mutations use the FastAPI API on the same origin, authenticated by an HTTP-only cookie.
- Keep existing component ownership where practical: the board remains responsible for orchestration, while data loading and mutations move behind a focused client API module.
- Do not add column creation, deletion, or reordering. The fixed five-column contract must remain valid for API and AI operations.