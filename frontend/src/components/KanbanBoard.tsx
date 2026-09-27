"use client";

import { useEffect, useState } from "react";
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
import { LoaderCircle, LogOut, SquareKanban } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { applyMove, boardAnnouncements, columnKeyboardCoordinates, getMoveTarget, type BoardData } from "@/lib/kanban";
import { addCard, deleteCard, getBoard, moveBoardCard, renameColumn, updateCard } from "@/lib/api";

// One palette color per fixed column, in board order.
const columnAccents = ["var(--gray-text)", "var(--primary-blue)", "var(--accent-yellow)", "var(--secondary-purple)", "var(--navy-dark)"];

type KanbanBoardProps = {
  board: BoardData | null;
  onBoardChange: (board: BoardData) => void;
  onLogout?: () => void;
};

export const KanbanBoard = ({ board, onBoardChange, onLogout }: KanbanBoardProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getBoard().then(onBoardChange).catch(() => setError("Unable to load board."));
  }, [onBoardChange]);

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
    update(moveBoardCard(String(active.id), target.columnId, target.position), "Unable to move card.", board);
  };

  const handleRenameColumn = (columnId: string, title: string) => update(renameColumn(columnId, title), "Unable to rename column.");
  const handleAddCard = (columnId: string, title: string, details: string) => update(addCard(columnId, title, details), "Unable to add card.");
  const handleDeleteCard = (_columnId: string, cardId: string) => update(deleteCard(cardId), "Unable to delete card.");
  const handleEditCard = (cardId: string, title: string, details: string) => update(updateCard(cardId, title, details), "Unable to edit card.");

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const totalCards = Object.keys(board.cards).length;
  const doneCards = board.columns[board.columns.length - 1].cardIds.length;
  const donePercent = totalCards ? Math.round((doneCards / totalCards) * 100) : 0;

  return (
    <main className="flex min-h-screen flex-col lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-[var(--stroke)] bg-white/70 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold leading-tight text-[var(--navy-dark)]">Kanban Studio</h1>
            <p className="hidden text-xs text-[var(--gray-text)] sm:block">Drag cards between stages, or ask the assistant.</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="hidden w-52 sm:block">
            <div className="flex justify-between text-xs font-semibold text-[var(--gray-text)]">
              <span>{doneCards} of {totalCards} done</span>
              <span className="text-[var(--navy-dark)]">{donePercent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--navy-dark)]/10">
              <div className="h-full rounded-full bg-[var(--accent-yellow)] transition-[width] duration-500" style={{ width: `${donePercent}%` }} />
            </div>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            >
              <LogOut className="size-3.5" aria-hidden />
              Log out
            </button>
          )}
        </div>
      </header>
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
        {/* Columns share the full width and scroll sideways once they would get narrower than 14rem. */}
        <section className="relative grid flex-1 grid-cols-[repeat(5,minmax(14rem,1fr))] gap-3 overflow-x-auto p-4 [scrollbar-width:thin] sm:p-6 lg:overflow-y-auto">
          {board.columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              accent={columnAccents[index]}
              cards={column.cardIds.map((cardId) => board.cards[cardId])}
              onRename={handleRenameColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onEditCard={handleEditCard}
            />
          ))}
        </section>
        <DragOverlay>
          {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
};
