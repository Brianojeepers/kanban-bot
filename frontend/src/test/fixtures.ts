import type { BoardData, Card } from "@/lib/kanban";

export const makeCard = (id: string, title: string, details = "", extra: Partial<Card> = {}): Card => ({ id, title, details, priority: null, dueDate: null, assignee: null, labels: [], comments: 0, checklist: { done: 0, total: 0 }, ...extra });

export const boardFixture: BoardData = {
  id: 1,
  name: "Product roadmap",
  owner: "user",
  members: ["user", "ada"],
  labels: [],
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-in-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: Object.fromEntries([
    makeCard("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    makeCard("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    makeCard("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    makeCard("card-4", "Refine status language", "Standardize column labels and tone across the board."),
    makeCard("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    makeCard("card-6", "QA micro-interactions", "Verify hover, focus, and loading states."),
    makeCard("card-7", "Ship marketing page", "Final copy approved and asset pack delivered."),
    makeCard("card-8", "Close onboarding sprint", "Document release notes and share internally."),
  ].map((card) => [card.id, card])),
};
