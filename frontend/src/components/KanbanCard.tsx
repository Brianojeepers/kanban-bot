import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useState } from "react";
import { Archive, CalendarDays, GripVertical, ListChecks, Maximize2, MessageSquare, Pencil, Trash2, UserRound } from "lucide-react";
import { dueStatus, formatDueDate, labelColor, localToday, parseLabels, type Card, type Priority } from "@/lib/kanban";
import type { CardFields } from "@/lib/api";

type KanbanCardProps = {
  card: Card;
  // Usernames the card can be assigned to.
  members: string[];
  onDelete: (cardId: string) => void;
  onOpen: (cardId: string) => void;
  onArchive: (cardId: string) => void;
  onEdit: (cardId: string, fields: CardFields) => void;
};

const priorityStyles: Record<Priority, string> = {
  high: "bg-[var(--danger)]/10 text-[var(--danger)]",
  medium: "bg-[var(--accent-yellow)]/15 text-[#8a6300]",
  low: "bg-[var(--primary-blue)]/10 text-[#16729d]",
};
const dueStyles = {
  overdue: "bg-[var(--danger)]/10 text-[var(--danger)]",
  today: "bg-[var(--accent-yellow)]/15 text-[#8a6300]",
  soon: "bg-[var(--accent-yellow)]/15 text-[#8a6300]",
  upcoming: "bg-[var(--navy-dark)]/5 text-[var(--gray-text)]",
};
const chip = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold";
const dueDescriptions = { overdue: "Overdue: it was due", today: "Due today", soon: "Due soon", upcoming: "Due" };

const iconButton = "flex size-7 items-center justify-center rounded-lg text-[var(--gray-text)] transition";
const field = "w-full rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 text-sm outline-none transition focus:border-[var(--primary-blue)] focus:bg-white";

export const KanbanCard = ({ card, members, onDelete, onOpen, onArchive, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const due = card.dueDate ? { status: dueStatus(card.dueDate, localToday()), date: formatDueDate(card.dueDate) } : null;
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
            onEdit(card.id, {
              title: String(form.get("title")),
              details: String(form.get("details")),
              priority: (form.get("priority") || null) as Priority | null,
              due_date: String(form.get("due_date")) || null,
              assignee: String(form.get("assignee")) || null,
              labels: parseLabels(String(form.get("labels"))),
            });
            setIsEditing(false);
          }}
          className="space-y-2 p-3"
        >
          <input name="title" defaultValue={card.title} aria-label="Card title" maxLength={200} required autoFocus className={clsx(field, "font-semibold text-[var(--navy-dark)]")} />
          <textarea name="details" defaultValue={card.details} aria-label="Card details" maxLength={2000} rows={3} className={clsx(field, "resize-y text-[var(--navy-dark)]")} />
          <div className="grid grid-cols-2 gap-2">
            <select name="priority" defaultValue={card.priority ?? ""} aria-label="Priority" className={clsx(field, "text-[var(--navy-dark)]")}>
              <option value="">No priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input name="due_date" type="date" defaultValue={card.dueDate ?? ""} aria-label="Due date" className={clsx(field, "min-w-0 text-[var(--navy-dark)]")} />
          </div>
          <input name="labels" defaultValue={card.labels.join(", ")} aria-label="Labels" placeholder="Labels, separated by commas" className={clsx(field, "text-[var(--navy-dark)]")} />
          <select name="assignee" defaultValue={card.assignee ?? ""} aria-label="Assignee" className={clsx(field, "text-[var(--navy-dark)]")}>
            <option value="">Unassigned</option>
            {members.map((member) => <option key={member} value={member}>{member}</option>)}
          </select>
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
            data-tooltip="Drag to move, or press Space and use the arrow keys"
            className={clsx(iconButton, "h-auto min-h-7 shrink-0 cursor-grab touch-none self-stretch opacity-50 hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] hover:opacity-100 active:cursor-grabbing group-hover:opacity-100")}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 pt-0.5 [@media(hover:none)]:pr-32">
            <h4 className="break-words font-display text-sm font-semibold leading-snug text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
                {card.details}
              </p>
            )}
            {(card.priority || card.dueDate || card.assignee || card.labels.length > 0 || card.comments > 0 || card.checklist.total > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {card.labels.map((label) => (
                  <span key={label} data-tooltip={`Label "${label}"`} className={chip} style={{ color: labelColor(label), backgroundColor: `color-mix(in srgb, ${labelColor(label)} 12%, transparent)` }}>
                    <span className="sr-only">Label: </span>{label}
                  </span>
                ))}
                {card.priority && (
                  <span data-tooltip={`${card.priority[0].toUpperCase() + card.priority.slice(1)} priority`} className={clsx(chip, priorityStyles[card.priority])}>
                    {card.priority[0].toUpperCase() + card.priority.slice(1)}<span className="sr-only"> priority</span>
                  </span>
                )}
                {due && (
                  <span data-tooltip={due.status === "today" ? "Due today" : `${dueDescriptions[due.status]} ${due.date}`} className={clsx(chip, dueStyles[due.status])}>
                    <CalendarDays className="size-3" aria-hidden />
                    <span className="sr-only">Due </span>{due.date}
                    {due.status !== "upcoming" && <span className="sr-only">, {due.status === "soon" ? "due soon" : due.status === "today" ? "due today" : "overdue"}</span>}
                  </span>
                )}
                {card.assignee && (
                  <span data-tooltip={`Assigned to ${card.assignee}`} className={clsx(chip, "bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]")}>
                    <UserRound className="size-3" aria-hidden />
                    <span className="sr-only">Assigned to </span>{card.assignee}
                  </span>
                )}
                {card.checklist.total > 0 && (
                  <span data-tooltip={`${card.checklist.done} of ${card.checklist.total} checklist items done`} className={clsx(chip, card.checklist.done === card.checklist.total ? "bg-[#2f855a]/10 text-[#2f855a]" : "bg-[var(--navy-dark)]/5 text-[var(--gray-text)]")}>
                    <ListChecks className="size-3" aria-hidden />
                    {card.checklist.done}/{card.checklist.total}<span className="sr-only"> checklist items done</span>
                  </span>
                )}
                {card.comments > 0 && (
                  <span data-tooltip={card.comments === 1 ? "1 comment" : `${card.comments} comments`} className={clsx(chip, "bg-[var(--navy-dark)]/5 text-[var(--gray-text)]")}>
                    <MessageSquare className="size-3" aria-hidden />
                    {card.comments}<span className="sr-only">{card.comments === 1 ? " comment" : " comments"}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Floats over the text on hover or focus where a pointer can hover; always shown on touch screens. */}
          <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg bg-white p-0.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-hover:shadow-[var(--shadow-soft)] [@media(hover:hover)]:opacity-0">
            <button
              type="button"
              onClick={() => onOpen(card.id)}
              aria-label={`Open ${card.title}`}
              data-tooltip="Open the checklist and comments"
              data-tooltip-align="end"
              className={clsx(iconButton, "hover:bg-[var(--primary-blue)]/10 hover:text-[var(--primary-blue)]")}
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label={`Edit ${card.title}`}
              data-tooltip="Edit title, details, priority, due date, labels and assignee"
              data-tooltip-align="end"
              className={clsx(iconButton, "hover:bg-[var(--primary-blue)]/10 hover:text-[var(--primary-blue)]")}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onArchive(card.id)}
              aria-label={`Archive ${card.title}`}
              data-tooltip="Archive: hide from the board, restorable later"
              data-tooltip-align="end"
              className={clsx(iconButton, "hover:bg-[var(--accent-yellow)]/15 hover:text-[#8a6300]")}
            >
              <Archive className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              aria-label={`Delete ${card.title}`}
              data-tooltip="Delete for good"
              data-tooltip-align="end"
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
