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
