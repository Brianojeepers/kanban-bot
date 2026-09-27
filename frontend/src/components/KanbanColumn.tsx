import clsx from "clsx";
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import type { CardFields } from "@/lib/api";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  accent: string;
  // The cards to show: all of the column's cards, or those matching the board's filter.
  cards: Card[];
  isFiltered?: boolean;
  members: string[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, fields: CardFields & { title: string }) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, fields: CardFields) => void;
  onOpenCard: (cardId: string) => void;
  onArchiveCard: (cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  accent,
  cards,
  isFiltered = false,
  members,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onOpenCard,
  onArchiveCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const [draftTitle, setDraftTitle] = useState(column.title);
  const [savedTitle, setSavedTitle] = useState(column.title);
  if (column.title !== savedTitle) {
    setSavedTitle(column.title);
    setDraftTitle(column.title);
  }

  const saveTitle = () => {
    const title = draftTitle.trim();
    if (title && title !== column.title) onRename(column.id, title);
    else setDraftTitle(column.title);
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[28rem] flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--navy-dark)]/[0.03] p-2 transition",
        isOver && "bg-[var(--accent-yellow)]/10 ring-2 ring-[var(--accent-yellow)]"
      )}
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-white focus:bg-white focus:ring-2 focus:ring-[var(--primary-blue)]/40"
          aria-label="Column title"
          maxLength={200}
        />
        <span data-tooltip={cards.length === 1 ? "1 card shown in this column" : `${cards.length} cards shown in this column`} data-tooltip-align="end" className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--gray-text)] shadow-[var(--shadow-soft)]">
          <span className="sr-only">Cards: </span>{cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              members={members}
              onEdit={onEditCard}
              onOpen={onOpenCard}
              onArchive={onArchiveCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--navy-dark)]/10 px-3 py-8 text-center text-xs font-medium text-[var(--gray-text)]">
            <Inbox className="size-5 opacity-60" aria-hidden />
            {isFiltered ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(fields) => onAddCard(column.id, fields)}
      />
    </section>
  );
};
