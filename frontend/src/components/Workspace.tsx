"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo, LoaderCircle, LogOut, Sparkles, UserRound } from "lucide-react";
import { AccountDialog } from "@/components/AccountDialog";
import { ActivityDialog } from "@/components/ActivityDialog";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { MyWorkDialog } from "@/components/MyWorkDialog";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ShareDialog } from "@/components/ShareDialog";
import { KanbanBoard } from "@/components/KanbanBoard";
import { createBoard, failureMessage, deleteBoard, listBoards, logout, renameBoard } from "@/lib/api";
import type { BoardData, BoardSummary } from "@/lib/kanban";

type WorkspaceProps = { username: string; onSignedOut: () => void };

const headerButton = "flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]";

export const Workspace = ({ username, onSignedOut }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isMyWorkOpen, setIsMyWorkOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  // Replies can arrive after the user has switched boards; only the open board's data is shown.
  const openBoardId = useRef<number | null>(null);

  const selectBoard = (id: number) => {
    openBoardId.current = id;
    setBoardId(id);
    setBoard(null);
  };

  useEffect(() => {
    listBoards()
      .then((list) => { setBoards(list); openBoardId.current = list[0].id; setBoardId(list[0].id); })
      .catch(() => setError("Unable to load your boards."));
  }, []);

  const showBoard = useCallback((next: BoardData) => {
    if (next.id === openBoardId.current) setBoard(next);
  }, []);

  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action();
      setError("");
    } catch (reason) {
      setError(failureMessage(reason, failure));
    }
  };

  const handleCreate = (name: string) => run(async () => {
    const created = await createBoard(name);
    setBoards((current) => [...(current ?? []), { id: created.id, name: created.name, owner: created.owner }]);
    selectBoard(created.id);
    setBoard(created);
  }, "Unable to create board.");

  const handleRename = (name: string) => run(async () => {
    const renamed = await renameBoard(boardId!, name);
    setBoards((current) => current!.map((summary) => summary.id === renamed.id ? { ...summary, name: renamed.name } : summary));
    showBoard(renamed);
  }, "Unable to rename board.");

  const handleDelete = () => run(async () => {
    const remaining = await deleteBoard(boardId!);
    setBoards(remaining);
    selectBoard(remaining[0].id);
  }, "Unable to delete board.");

  // My work can point to a board shared with the user after the list loaded, so refresh the list for it.
  const openFromMyWork = (id: number) => run(async () => {
    setIsMyWorkOpen(false);
    if (!boards!.some((summary) => summary.id === id)) setBoards(await listBoards());
    if (id !== boardId) selectBoard(id);
  }, "Unable to open that board.");

  const handleLeft = () => {
    const remaining = boards!.filter((summary) => summary.id !== boardId);
    setBoards(remaining);
    setIsShareOpen(false);
    selectBoard(remaining[0].id);
  };

  const signOut = async () => {
    await logout().catch(() => undefined);
    onSignedOut();
  };

  if (!boards || boardId === null) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-6 text-sm text-[var(--gray-text)]">
        {error ? <p role="alert">{error}</p> : <><LoaderCircle className="size-4 animate-spin" aria-hidden /><p>Loading boards...</p></>}
      </main>
    );
  }

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {error && (
          <p role="alert" className="mx-4 mt-3 rounded-xl bg-[var(--danger)]/10 px-4 py-2.5 text-sm font-medium text-[var(--danger)] sm:mx-6">{error}</p>
        )}
        <div className="min-h-0 flex-1">
          <KanbanBoard
            key={boardId}
            boardId={boardId}
            username={username}
            board={board}
            onBoardChange={showBoard}
            toolbar={<BoardSwitcher boards={boards} activeId={boardId} username={username} onShare={() => setIsShareOpen(true)} onShowActivity={() => setIsActivityOpen(true)} onShowArchive={() => setIsArchiveOpen(true)} onSelect={selectBoard} onCreate={handleCreate} onRename={handleRename} onDelete={handleDelete} />}
            actions={
              <>
                <button type="button" onClick={() => setIsMyWorkOpen(true)} className={headerButton}>
                  <ListTodo className="size-3.5" aria-hidden />
                  My work
                </button>
                <button type="button" onClick={() => setIsAccountOpen(true)} aria-label="Account settings" className={headerButton}>
                  <UserRound className="size-3.5" aria-hidden />
                  <span className="max-w-32 truncate">{username}</span>
                </button>
                <button type="button" onClick={signOut} className={headerButton}>
                  <LogOut className="size-3.5" aria-hidden />
                  Log out
                </button>
              </>
            }
          />
        </div>
      </div>
      {/* Hidden rather than unmounted, so an in-flight reply and the history survive. */}
      <div hidden={!isChatOpen} className="contents">
        <ChatSidebar key={boardId} boardId={boardId} username={username} onBoardUpdated={showBoard} onClose={() => setIsChatOpen(false)} />
      </div>
      {!isChatOpen && (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-10 flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          <Sparkles className="size-4" aria-hidden />
          Open AI assistant
        </button>
      )}
      {isShareOpen && board && <ShareDialog board={board} username={username} onBoardChange={showBoard} onLeft={handleLeft} onClose={() => setIsShareOpen(false)} />}
      {isActivityOpen && <ActivityDialog boardId={boardId} boardName={boards.find((summary) => summary.id === boardId)!.name} onClose={() => setIsActivityOpen(false)} />}
      {isArchiveOpen && <ArchiveDialog boardId={boardId} boardName={boards.find((summary) => summary.id === boardId)!.name} onBoardChange={showBoard} onClose={() => setIsArchiveOpen(false)} />}
      {isMyWorkOpen && <MyWorkDialog username={username} onOpenBoard={openFromMyWork} onClose={() => setIsMyWorkOpen(false)} />}
      {isAccountOpen && <AccountDialog username={username} onClose={() => setIsAccountOpen(false)} onDeleted={onSignedOut} />}
    </div>
  );
};
