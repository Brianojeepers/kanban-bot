import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
};

const iconButton = "flex size-7 items-center justify-center rounded-lg text-[var(--gray-text)] transition";
const field = "w-full rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 text-sm outline-none transition focus:border-[var(--primary-blue)] focus:bg-white";

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
        "group relative rounded-xl border border-[var(--stroke)] bg-white shadow-[var(--shadow-soft)]",
        "transition-[box-shadow,border-color] duration-150 hover:border-[var(--primary-blue)]/30 hover:shadow-[0_8px_20px_rgba(3,33,71,0.1)]",
        isDragging && "opacity-40"
      )}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onEdit(card.id, String(form.get("title")), String(form.get("details")));
            setIsEditing(false);
          }}
          className="space-y-2 p-3"
        >
          <input name="title" defaultValue={card.title} aria-label="Card title" maxLength={200} required autoFocus className={clsx(field, "font-semibold text-[var(--navy-dark)]")} />
          <textarea name="details" defaultValue={card.details} aria-label="Card details" maxLength={2000} rows={3} className={clsx(field, "resize-y text-[var(--navy-dark)]")} />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">Save</button>
            <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-1 py-2.5 pl-1 pr-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${card.title}`}
            className={clsx(iconButton, "h-auto min-h-7 shrink-0 cursor-grab touch-none self-stretch opacity-50 hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] hover:opacity-100 active:cursor-grabbing group-hover:opacity-100")}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 pt-0.5 [@media(hover:none)]:pr-14">
            <h4 className="break-words font-display text-sm font-semibold leading-snug text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
                {card.details}
              </p>
            )}
          </div>
          {/* Floats over the text on hover or focus where a pointer can hover; always shown on touch screens. */}
          <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg bg-white p-0.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-hover:shadow-[var(--shadow-soft)] [@media(hover:hover)]:opacity-0">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label={`Edit ${card.title}`}
              title="Edit"
              className={clsx(iconButton, "hover:bg-[var(--primary-blue)]/10 hover:text-[var(--primary-blue)]")}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              aria-label={`Delete ${card.title}`}
              title="Delete"
              className={clsx(iconButton, "hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]")}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
