import type { Announcements, KeyboardCoordinateGetter } from "@dnd-kit/core";

export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null;
  assignee: string | null;
  labels: string[];
  comments: number;
  checklist: { done: number; total: number };
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  id: number;
  name: string;
  owner: string;
  // Usernames of everyone who can open the board, the owner first.
  members: string[];
  // The distinct labels used on the board's cards.
  labels: string[];
  columns: Column[];
  cards: Record<string, Card>;
};

export type BoardSummary = { id: number; name: string; owner: string };

// Where a dragged card lands: over a column it goes to the end, over a card it takes that
// card's index, so within a column it swaps into the slot the sortable preview shows.
// Returns null when nothing would change.
export const getMoveTarget = (columns: Column[], activeId: string, overId: string) => {
  const sourceColumn = columns.find((column) => column.cardIds.includes(activeId));
  const targetColumn = columns.find((column) => column.id === overId) ?? columns.find((column) => column.cardIds.includes(overId));
  if (activeId === overId || !sourceColumn || !targetColumn) return null;

  const position = targetColumn.id === overId
    ? targetColumn.cardIds.filter((cardId) => cardId !== activeId).length
    : targetColumn.cardIds.indexOf(overId);
  if (targetColumn.id === sourceColumn.id && sourceColumn.cardIds.indexOf(activeId) === position) return null;
  return { columnId: targetColumn.id, position };
};

// The board after moving a card, applied locally so a drop shows at once while the API call runs.
export const applyMove = (board: BoardData, cardId: string, columnId: string, position: number): BoardData => ({
  ...board,
  columns: board.columns.map((column) => {
    const cardIds = column.cardIds.filter((id) => id !== cardId);
    if (column.id === columnId) cardIds.splice(position, 0, cardId);
    return { ...column, cardIds };
  }),
});

// Screen reader announcements for drag and drop, using titles instead of the default internal ids.
export const boardAnnouncements = (board: BoardData): Announcements => {
  const cardTitle = (id: string | number) => board.cards[String(id)]?.title ?? "card";
  const columnTitle = (id: string | number) => board.columns.find((column) => column.id === String(id) || column.cardIds.includes(String(id)))?.title ?? "column";
  return {
    onDragStart: ({ active }) => `Picked up ${cardTitle(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${cardTitle(active.id)} is over ${columnTitle(over.id)}.` : `${cardTitle(active.id)} is not over a column.`,
    onDragEnd: ({ active, over }) => over ? `Dropped ${cardTitle(active.id)} in ${columnTitle(over.id)}.` : `Dropped ${cardTitle(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelled moving ${cardTitle(active.id)}.`,
  };
};

// Keyboard dragging stays on the grid of columns: Left and Right move to the adjacent column,
// Up and Down move past the neighbouring card in the same column. (dnd-kit's default helper
// jumps to the nearest drop target in that direction, which can skip or leave a column.)
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { active, context }) => {
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return undefined;
  const enabled = droppableContainers.getEnabled();
  const columns = enabled.filter((container) => container.data.current?.type === "column").flatMap((container) => droppableRects.get(container.id) ?? []);
  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  const currentIndex = columns.findIndex((rect) => centerX >= rect.left && centerX <= rect.right && centerY >= rect.top && centerY <= rect.bottom);
  const current = columns[currentIndex];
  if (!current) return undefined;

  if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
    event.preventDefault();
    const target = columns[currentIndex + (event.code === "ArrowRight" ? 1 : -1)];
    if (!target) return undefined;
    return {
      x: target.left + (target.width - collisionRect.width) / 2,
      y: Math.max(target.top, Math.min(collisionRect.top, target.bottom - collisionRect.height)),
    };
  }
  if (event.code === "ArrowUp" || event.code === "ArrowDown") {
    event.preventDefault();
    const direction = event.code === "ArrowDown" ? 1 : -1;
    const next = enabled
      .filter((container) => container.id !== active && container.data.current?.type !== "column")
      .flatMap((container) => droppableRects.get(container.id) ?? [])
      .filter((rect) => rect.left + rect.width / 2 >= current.left && rect.left + rect.width / 2 <= current.right)
      .filter((rect) => (rect.top - collisionRect.top) * direction > 0)
      .sort((a, b) => Math.abs(a.top - collisionRect.top) - Math.abs(b.top - collisionRect.top))[0];
    return next && { x: collisionRect.left, y: next.top };
  }
  return undefined;
};

// Today as a local "YYYY-MM-DD" date, the format the API uses for due dates.
export const localToday = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// A card is due soon when its due date is within this many days after today.
export const DUE_SOON_DAYS = 3;

export type DueStatus = "overdue" | "today" | "soon" | "upcoming";

// "YYYY-MM-DD" strings compare correctly as text.
export const dueStatus = (dueDate: string, today: string): DueStatus => {
  const [year, month, day] = today.split("-").map(Number);
  const soonLimit = localToday(new Date(year, month - 1, day + DUE_SOON_DAYS));
  return dueDate < today ? "overdue" : dueDate === today ? "today" : dueDate <= soonLimit ? "soon" : "upcoming";
};

// Overdue, or due today or soon: the dates worth a warning.
export const isDueSoon = (status: DueStatus) => status === "today" || status === "soon";

export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// assignee is "" for anyone, UNASSIGNED for cards without one, or a username (never this short).
export const UNASSIGNED = "-";
export type CardFilter = { text: string; priority: Priority | ""; assignee: string; label: string; due: "" | "overdue" | "soon" };
export const emptyFilter: CardFilter = { text: "", priority: "", assignee: "", label: "", due: "" };

export const isFiltering = (filter: CardFilter) => Boolean(filter.text.trim() || filter.priority || filter.assignee || filter.label || filter.due);

export const matchesFilter = (card: Card, filter: CardFilter, today: string) => {
  const text = filter.text.trim().toLowerCase();
  return (!text || `${card.title}\n${card.details}`.toLowerCase().includes(text))
    && (!filter.priority || card.priority === filter.priority)
    && (!filter.assignee || (card.assignee ?? UNASSIGNED) === filter.assignee)
    && (!filter.label || card.labels.some((label) => label.toLowerCase() === filter.label.toLowerCase()))
    && (!filter.due || (card.dueDate !== null && (filter.due === "overdue" ? dueStatus(card.dueDate, today) === "overdue" : isDueSoon(dueStatus(card.dueDate, today)))));
};

// How long ago an API timestamp ("2026-09-27T12:00:00Z") was, in the largest whole unit.
export const timeAgo = (timestamp: string, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
};

// Each label keeps one palette color wherever it appears, whatever its case.
const labelColors = ["var(--primary-blue)", "var(--secondary-purple)", "#b07f00", "var(--navy-dark)", "#2f855a", "#c05621"];
export const labelColor = (label: string) => {
  const hash = [...label.toLowerCase()].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
  return labelColors[hash % labelColors.length];
};

// Labels as typed in the card editor: comma-separated, trimmed, blanks dropped.
export const parseLabels = (text: string) => text.split(",").map((label) => label.trim()).filter(Boolean);
