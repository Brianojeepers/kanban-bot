import type { Announcements, KeyboardCoordinateGetter } from "@dnd-kit/core";

export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

// Where a dragged card lands: over a column it goes to the end, over a card it takes that
// card's index among the column's other cards. Returns null when nothing would change.
export const getMoveTarget = (columns: Column[], activeId: string, overId: string) => {
  const sourceColumn = columns.find((column) => column.cardIds.includes(activeId));
  const targetColumn = columns.find((column) => column.id === overId) ?? columns.find((column) => column.cardIds.includes(overId));
  if (activeId === overId || !sourceColumn || !targetColumn) return null;

  const remainingCardIds = targetColumn.cardIds.filter((cardId) => cardId !== activeId);
  const position = targetColumn.id === overId ? remainingCardIds.length : remainingCardIds.indexOf(overId);
  if (targetColumn.id === sourceColumn.id && sourceColumn.cardIds.indexOf(activeId) === position) return null;
  return { columnId: targetColumn.id, position };
};

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
