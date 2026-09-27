import { useState, type FormEvent } from "react";
import { UserMinus } from "lucide-react";
import { Modal, modalError, modalInput, modalLabel } from "@/components/Modal";
import { addMember, failureMessage, removeMember } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ShareDialogProps = {
  board: BoardData;
  username: string;
  onBoardChange: (board: BoardData) => void;
  onLeft: () => void;
  onClose: () => void;
};

export const ShareDialog = ({ board, username, onBoardChange, onLeft, onClose }: ShareDialogProps) => {
  const [error, setError] = useState("");
  const isOwner = board.owner === username;

  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action();
      setError("");
    } catch (reason) {
      setError(failureMessage(reason, failure));
    }
  };

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const name = String(new FormData(formElement).get("username")).trim();
    run(async () => {
      onBoardChange(await addMember(board.id, name));
      formElement.reset();
    }, "Unable to add that member.");
  };

  const remove = (member: string) => run(async () => {
    const updated = await removeMember(board.id, member);
    if (member === username) onLeft();
    else onBoardChange(updated);
  }, "Unable to remove that member.");

  return (
    <Modal title="Share board" subtitle={board.name} closeLabel="Close sharing" onClose={onClose}>
      <ul aria-label="Members" className="mt-6 divide-y divide-[var(--stroke)] rounded-xl border border-[var(--stroke)]">
        {board.members.map((member) => (
          <li key={member} className="flex items-center gap-3 px-3.5 py-2.5 text-sm text-[var(--navy-dark)]">
            <span className="min-w-0 flex-1 truncate font-semibold">{member}{member === username && <span className="font-normal text-[var(--gray-text)]"> (you)</span>}</span>
            {member === board.owner ? (
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]">Owner</span>
            ) : (isOwner || member === username) && (
              <button type="button" onClick={() => remove(member)} aria-label={member === username ? "Leave board" : `Remove ${member}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/10">
                <UserMinus className="size-3.5" aria-hidden />
                {member === username ? "Leave board" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={invite} className="mt-6 space-y-3">
          <label className={modalLabel}>Add a member by username<input name="username" required autoComplete="off" className={modalInput} /></label>
          <p className="text-xs text-[var(--gray-text)]">Members can edit cards and columns and use the assistant. Only you can rename, share or delete the board.</p>
          <button type="submit" className="rounded-xl bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">Add member</button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-[var(--gray-text)]">Shared with you by {board.owner}. Only they can rename, share or delete it.</p>
      )}
      {error && <p role="alert" className={`mt-4 ${modalError}`}>{error}</p>}
    </Modal>
  );
};
