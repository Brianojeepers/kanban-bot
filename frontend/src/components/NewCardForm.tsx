import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";
import type { CardFields } from "@/lib/api";
import type { Priority } from "@/lib/kanban";

type NewCardFormProps = {
  onAdd: (fields: CardFields & { title: string }) => void;
};

const field = "w-full rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white";

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title")).trim();
    if (!title) return;
    onAdd({
      title,
      details: String(form.get("details")).trim(),
      priority: (form.get("priority") || null) as Priority | null,
      due_date: String(form.get("due_date")) || null,
    });
    setIsOpen(false);
  };

  return (
    <div className="mt-2">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-[var(--stroke)] bg-white p-2 shadow-[var(--shadow-soft)]">
          <input name="title" placeholder="Card title" maxLength={200} autoFocus required className={clsx(field, "font-semibold")} />
          <textarea name="details" placeholder="Details" maxLength={2000} rows={2} className={clsx(field, "resize-y")} />
          <div className="grid grid-cols-2 gap-2">
            <select name="priority" defaultValue="" aria-label="Priority" className={field}>
              <option value="">No priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input name="due_date" type="date" aria-label="Due date" className={clsx(field, "min-w-0")} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">
              Add card
            </button>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-white hover:text-[var(--primary-blue)] hover:shadow-[var(--shadow-soft)]"
        >
          <Plus className="size-4" aria-hidden />
          Add a card
        </button>
      )}
    </div>
  );
};
