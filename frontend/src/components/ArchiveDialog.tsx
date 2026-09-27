import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Modal, modalError } from "@/components/Modal";
import { deleteArchivedCard, failureMessage, getArchivedCards, restoreCard, type ArchivedCard } from "@/lib/api";
import { timeAgo, type BoardData } from "@/lib/kanban";

type ArchiveDialogProps = { boardId: number; boardName: string; onBoardChange: (board: BoardData) => void; onClose: () => void };

const action = "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition";

export const ArchiveDialog = ({ boardId, boardName, onBoardChange, onClose }: ArchiveDialogProps) => {
  const [cards, setCards] = useState<ArchivedCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getArchivedCards(boardId).then(setCards).catch(() => setError("Unable to load archived cards."));
  }, [boardId]);

  const restore = async (card: ArchivedCard) => {
    try {
      onBoardChange(await restoreCard(boardId, card.id));
      setCards((current) => current!.filter((archived) => archived.id !== card.id));
      setError("");
    } catch (reason) {
      setError(failureMessage(reason, "Unable to restore that card."));
    }
  };

  const remove = async (card: ArchivedCard) => {
    if (!window.confirm(`Delete "${card.title}" for good?`)) return;
    try {
      setCards(await deleteArchivedCard(boardId, card.id));
      setError("");
    } catch (reason) {
      setError(failureMessage(reason, "Unable to delete that card."));
    }
  };

  return (
    <Modal title="Archived cards" subtitle={boardName} closeLabel="Close archived cards" onClose={onClose}>
      <div className="mt-6">
        {error && <p role="alert" className={`mb-4 ${modalError}`}>{error}</p>}
        {cards === null && !error && <p className="text-sm text-[var(--gray-text)]">Loading archived cards...</p>}
        {cards?.length === 0 && <p className="text-sm text-[var(--gray-text)]">No archived cards.</p>}
        {cards && cards.length > 0 && (
          <ul aria-label="Archived cards" className="divide-y divide-[var(--stroke)] rounded-xl border border-[var(--stroke)]">
            {cards.map((card) => (
              <li key={card.id} className="flex items-center gap-2 px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--navy-dark)]">{card.title}</span>
                  <span className="block text-xs text-[var(--gray-text)]">From {card.column}, archived {timeAgo(card.archivedAt)}</span>
                </span>
                <button type="button" onClick={() => restore(card)} aria-label={`Restore ${card.title}`} className={`${action} text-[var(--primary-blue)] hover:bg-[var(--primary-blue)]/10`}>
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restore
                </button>
                <button type="button" onClick={() => remove(card)} aria-label={`Delete ${card.title} for good`} className={`${action} text-[var(--danger)] hover:bg-[var(--danger)]/10`}>
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
