import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Archive, History, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { BoardSummary } from "@/lib/kanban";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeId: number;
  username: string;
  onShare: () => void;
  onShowActivity: () => void;
  onShowArchive: () => void;
  onSelect: (boardId: number) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

// Disabled buttons still take the pointer, so their tooltip can say why; only the icon fades.
const iconButton = "flex size-8 items-center justify-center rounded-lg text-[var(--gray-text)] transition enabled:hover:bg-white enabled:hover:text-[var(--navy-dark)] enabled:hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:[&>svg]:opacity-40";
const control = "h-9 rounded-lg border border-[var(--stroke)] bg-white px-2.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20";

export const BoardSwitcher = ({ boards, activeId, username, onShare, onShowActivity, onShowArchive, onSelect, onCreate, onRename, onDelete }: BoardSwitcherProps) => {
  const [mode, setMode] = useState<"create" | "rename" | null>(null);
  const active = boards.find((board) => board.id === activeId);
  const isOwner = active?.owner === username;
  const ownBoards = boards.filter((board) => board.owner === username).length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name) return;
    if (mode === "create") onCreate(name);
    else onRename(name);
    setMode(null);
  };

  if (mode) {
    return (
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          name="name"
          aria-label="Board name"
          placeholder="Board name"
          defaultValue={mode === "rename" ? active?.name : ""}
          maxLength={100}
          required
          autoFocus
          onKeyDown={(event) => { if (event.key === "Escape") setMode(null); }}
          className={clsx(control, "w-48")}
        />
        <button type="submit" className="h-9 rounded-lg bg-[var(--secondary-purple)] px-3 text-xs font-semibold text-white transition hover:brightness-110">
          {mode === "create" ? "Create" : "Save"}
        </button>
        <button type="button" onClick={() => setMode(null)} className="h-9 rounded-lg px-3 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-white hover:text-[var(--navy-dark)]">
          Cancel
        </button>
      </form>
    );
  }

  return (
    // The select shrinks so the row never gets wider than a phone screen.
    <div className="flex min-w-0 max-w-full items-center gap-1">
      <select aria-label="Board" value={activeId} onChange={(event) => onSelect(Number(event.target.value))} className={clsx(control, "min-w-0 max-w-56")}>
        {boards.map((board) => <option key={board.id} value={board.id}>{board.owner === username ? board.name : `${board.name} (${board.owner})`}</option>)}
      </select>
      <button type="button" onClick={() => setMode("create")} aria-label="New board" data-tooltip="Create a new board" className={iconButton}>
        <Plus className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onShowActivity} aria-label="Board activity" data-tooltip="See recent changes on this board" className={iconButton}>
        <History className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onShowArchive} aria-label="Archived cards" data-tooltip="See archived cards, to restore or delete them" className={iconButton}>
        <Archive className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onShare} aria-label="Share board" data-tooltip="See who can open this board, and share it" className={iconButton}>
        <Users className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={() => setMode("rename")} disabled={!isOwner} aria-label="Rename board" data-tooltip={isOwner ? "Rename this board" : "Only the owner can rename this board"} className={iconButton}>
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => { if (window.confirm(`Delete "${active?.name}" and all of its cards?`)) onDelete(); }}
        disabled={!isOwner || ownBoards < 2}
        aria-label="Delete board"
        data-tooltip={!isOwner ? "Only the owner can delete this board" : ownBoards < 2 ? "Your only board cannot be deleted" : "Delete this board and all its cards"}
        data-tooltip-align="end"
        className={clsx(iconButton, "enabled:hover:text-[var(--danger)]")}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
};
