import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

const initialFormState = { title: "", details: "" };

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd(formState.title.trim(), formState.details.trim());
    setFormState(initialFormState);
    setIsOpen(false);
  };

  return (
    <div className="mt-2">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-[var(--stroke)] bg-white p-2 shadow-[var(--shadow-soft)]">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            maxLength={200}
            autoFocus
            className="w-full rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            maxLength={2000}
            rows={2}
            className="w-full resize-y rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setFormState(initialFormState);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            >
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
