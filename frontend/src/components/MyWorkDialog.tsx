import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { Modal, modalError } from "@/components/Modal";
import { getMyCards, type AssignedCard } from "@/lib/api";
import { dueStatus, formatDueDate, localToday } from "@/lib/kanban";

type MyWorkDialogProps = { username: string; onOpenBoard: (boardId: number) => void; onClose: () => void };

export const MyWorkDialog = ({ username, onOpenBoard, onClose }: MyWorkDialogProps) => {
  const [cards, setCards] = useState<AssignedCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyCards().then(setCards).catch(() => setError("Unable to load your cards."));
  }, []);

  const today = localToday();
  const open = cards?.filter((card) => !card.done) ?? [];
  const doneCount = (cards?.length ?? 0) - open.length;

  return (
    <Modal title="My work" subtitle={`Cards assigned to ${username} on every board`} closeLabel="Close my work" onClose={onClose}>
      <div className="mt-6">
        {error && <p role="alert" className={modalError}>{error}</p>}
        {cards === null && !error && <p className="text-sm text-[var(--gray-text)]">Loading your cards...</p>}
        {cards && open.length === 0 && <p className="text-sm text-[var(--gray-text)]">Nothing open is assigned to you.</p>}
        {open.length > 0 && (
          <ul aria-label="Assigned cards" className="space-y-2">
            {open.map((card) => {
              const status = card.dueDate && dueStatus(card.dueDate, today);
              return (
                <li key={card.id}>
                  <button type="button" onClick={() => onOpenBoard(card.boardId)} className="group flex w-full items-center gap-3 rounded-xl border border-[var(--stroke)] px-3.5 py-2.5 text-left transition hover:border-[var(--primary-blue)]/40 hover:bg-[var(--surface)]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--navy-dark)]">{card.title}</span>
                      <span className="block truncate text-xs text-[var(--gray-text)]">
                        {card.boardName} · {card.column}
                        {card.priority && ` · ${card.priority[0].toUpperCase()}${card.priority.slice(1)} priority`}
                      </span>
                    </span>
                    {card.dueDate && (
                      <span className={clsx("shrink-0 text-xs font-semibold", status === "overdue" ? "text-[var(--danger)]" : "text-[var(--gray-text)]")}>
                        {status === "overdue" ? "Overdue, " : "Due "}{formatDueDate(card.dueDate)}
                      </span>
                    )}
                    <ArrowRight className="size-4 shrink-0 text-[var(--gray-text)] transition group-hover:text-[var(--primary-blue)]" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {doneCount > 0 && <p className="mt-4 text-xs text-[var(--gray-text)]">{doneCount} done {doneCount === 1 ? "card is" : "cards are"} not shown.</p>}
      </div>
    </Modal>
  );
};
