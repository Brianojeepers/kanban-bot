import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useState } from "react";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onEdit(card.id, String(form.get("title")), String(form.get("details"))); setIsEditing(false); }} className="space-y-2"><input name="title" defaultValue={card.title} aria-label="Card title" className="w-full border p-1 text-sm" required /><textarea name="details" defaultValue={card.details} aria-label="Card details" className="w-full border p-1 text-sm" rows={2} /><button type="submit" className="text-xs text-[var(--primary-blue)]">Save</button></form> : <><h4 className="break-words font-display text-base font-semibold text-[var(--navy-dark)]">
        {card.title}
      </h4>
      <p className="mt-2 break-words text-sm leading-6 text-[var(--gray-text)]">
        {card.details}
      </p></>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${card.title}`}
          className="mr-auto cursor-grab touch-none rounded-full px-2 py-1 text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)] active:cursor-grabbing"
        >
          Move
        </button>
        {!isEditing && <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="px-2 py-1 text-xs font-semibold text-[var(--primary-blue)]"
        >Edit</button>}
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
