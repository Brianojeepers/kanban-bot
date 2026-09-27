import { useEffect, useState } from "react";
import { Modal, modalError } from "@/components/Modal";
import { getActivity, type ActivityEntry } from "@/lib/api";
import { timeAgo } from "@/lib/kanban";

type ActivityDialogProps = { boardId: number; boardName: string; onClose: () => void };

export const ActivityDialog = ({ boardId, boardName, onClose }: ActivityDialogProps) => {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getActivity(boardId).then(setEntries).catch(() => setError("Unable to load activity."));
  }, [boardId]);

  return (
    <Modal title="Activity" subtitle={boardName} closeLabel="Close activity" onClose={onClose}>
      <div className="mt-6">
        {error && <p role="alert" className={modalError}>{error}</p>}
        {entries === null && !error && <p className="text-sm text-[var(--gray-text)]">Loading activity...</p>}
        {entries?.length === 0 && <p className="text-sm text-[var(--gray-text)]">Nothing has happened on this board yet.</p>}
        {entries && entries.length > 0 && (
          <ol aria-label="Recent activity" className="space-y-2.5 border-l-2 border-[var(--accent-yellow)]/60 pl-4">
            {entries.map((entry) => (
              <li key={entry.id} className="text-sm text-[var(--navy-dark)]">
                <span className="font-semibold">{entry.actor ?? "Former member"}</span> {entry.action}
                <span className="block text-xs text-[var(--gray-text)]">{timeAgo(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
};
