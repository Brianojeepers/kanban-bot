"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { LoaderCircle, SquareKanban } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { BoardFilters } from "@/components/BoardFilters";
import { CardDialog } from "@/components/CardDialog";
import { applyMove, boardAnnouncements, columnKeyboardCoordinates, dueStatus, emptyFilter, getMoveTarget, isDueSoon, isFiltering, localToday, matchesFilter, type BoardData, type CardFilter } from "@/lib/kanban";
import { addCard, archiveCard, deleteCard, getBoard, moveBoardCard, renameColumn, updateCard, type CardFields } from "@/lib/api";

// One palette color per fixed column, in board order.
const columnAccents = ["var(--gray-text)", "var(--primary-blue)", "var(--accent-yellow)", "var(--secondary-purple)", "var(--navy-dark)"];

type KanbanBoardProps = {
  boardId: number;
  username: string;
  board: BoardData | null;
  onBoardChange: (board: BoardData) => void;
  // Header slots: the board switcher next to the title, and account actions on the right.
  toolbar?: ReactNode;
  actions?: ReactNode;
};

export const KanbanBoard = ({ boardId, username, board, onBoardChange, toolbar, actions }: KanbanBoardProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Cards that were on the board when the filter last changed. Cards added since (by the user or the assistant)
  // stay visible whatever the filter, so a new card never seems to vanish.
  const [{ filter, filteredIds }, setFilterState] = useState<{ filter: CardFilter; filteredIds: Set<string> }>({ filter: emptyFilter, filteredIds: new Set() });
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    getBoard(boardId).then(onBoardChange).catch(() => setError("Unable to load board."));
  }, [boardId, onBoardChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates })
  );

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-6 text-sm text-[var(--gray-text)] lg:min-h-0 lg:h-full">
        {error ? <p role="alert">{error}</p> : <><LoaderCircle className="size-4 animate-spin" aria-hidden /><p>Loading board...</p></>}
      </main>
    );
  }

  const update = async (request: Promise<BoardData>, failure: string, previous?: BoardData) => {
    try {
      onBoardChange(await request);
      setError("");
    } catch {
      if (previous) onBoardChange(previous);
      setError(failure);
    }
  };

  // Precise pointer hit-testing first (falls back to rect overlap), matching
  // dnd-kit's recommended strategy for nested column/card droppables.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    const target = over && getMoveTarget(board.columns, String(active.id), String(over.id));
    if (!target) return;
    onBoardChange(applyMove(board, String(active.id), target.columnId, target.position));
    update(moveBoardCard(board.id, String(active.id), target.columnId, target.position), "Unable to move card.", board);
  };

  const handleRenameColumn = (columnId: string, title: string) => update(renameColumn(board.id, columnId, title), "Unable to rename column.");
  const handleAddCard = (columnId: string, fields: CardFields & { title: string }) => update(addCard(board.id, columnId, fields), "Unable to add card.");
  const changeFilter = (next: CardFilter) => setFilterState({ filter: next, filteredIds: new Set(Object.keys(board.cards)) });
  const handleDeleteCard = (_columnId: string, cardId: string) => update(deleteCard(board.id, cardId), "Unable to delete card.");
  const handleArchiveCard = (cardId: string) => update(archiveCard(board.id, cardId), "Unable to archive card.");
  const handleEditCard = (cardId: string, fields: CardFields) => update(updateCard(board.id, cardId, fields), "Unable to edit card.");

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const totalCards = Object.keys(board.cards).length;
  const doneCards = board.columns[board.columns.length - 1].cardIds.length;
  const donePercent = totalCards ? Math.round((doneCards / totalCards) * 100) : 0;
  const today = localToday();
  // Cards in the last column are done, so they are never overdue or due soon.
  const doneIds = new Set(board.columns[board.columns.length - 1].cardIds);
  const dueStatuses = Object.values(board.cards).filter((card) => card.dueDate && !doneIds.has(card.id)).map((card) => dueStatus(card.dueDate!, today));
  const overdueCards = dueStatuses.filter((status) => status === "overdue").length;
  const dueSoonCards = dueStatuses.filter(isDueSoon).length;
  const shownIds = new Set(Object.values(board.cards).filter((card) => matchesFilter(card, filter, today) || !filteredIds.has(card.id)).map((card) => card.id));

  return (
    <main className="flex min-h-screen flex-col lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-[var(--stroke)] bg-white/70 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban className="size-5" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-semibold leading-tight text-[var(--navy-dark)]">Kanban Studio</h1>
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-6">
          <div className="hidden w-60 sm:block">
            <div className="flex justify-between gap-2 text-xs font-semibold text-[var(--gray-text)]">
              <span>
                {doneCards} of {totalCards} done
                {overdueCards > 0 && <span className="ml-2 text-[var(--danger)]">{overdueCards} overdue</span>}
                {dueSoonCards > 0 && <span className="ml-2 text-[#8a6300]">{dueSoonCards} due soon</span>}
              </span>
              <span className="text-[var(--navy-dark)]">{donePercent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--navy-dark)]/10">
              <div className="h-full rounded-full bg-[var(--accent-yellow)] transition-[width] duration-500" style={{ width: `${donePercent}%` }} />
            </div>
          </div>
          {actions}
        </div>
      </header>
      <BoardFilters filter={filter} onChange={changeFilter} members={board.members} labels={board.labels} shown={shownIds.size} total={totalCards} />
      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-xl bg-[var(--danger)]/10 px-4 py-2.5 text-sm font-medium text-[var(--danger)] sm:mx-6">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ announcements: boardAnnouncements(board) }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Columns share the full width and scroll sideways once they would get narrower than 14rem.
            The row grows with the longest column (a plain auto row stops at the board's height, so cards
            spill out of their column and drag and drop no longer finds it) and fills the height otherwise. */}
        <section className="relative grid flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] auto-rows-[minmax(max-content,auto)] gap-3 overflow-x-auto p-4 [scrollbar-width:thin] sm:p-6 lg:overflow-y-auto">
          {board.columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              accent={columnAccents[index]}
              cards={column.cardIds.filter((cardId) => shownIds.has(cardId)).map((cardId) => board.cards[cardId])}
              isFiltered={isFiltering(filter)}
              members={board.members}
              onRename={handleRenameColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onEditCard={handleEditCard}
              onOpenCard={setOpenCardId}
              onArchiveCard={handleArchiveCard}
            />
          ))}
        </section>
        <DragOverlay>
          {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
      {openCardId && board.cards[openCardId] && (
        <CardDialog boardId={board.id} card={board.cards[openCardId]} username={username} onBoardChange={onBoardChange} onClose={() => setOpenCardId(null)} />
      )}
    </main>
  );
};
