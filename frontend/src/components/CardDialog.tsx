import { useEffect, useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import { Modal, modalError, modalInput } from "@/components/Modal";
import {
  addChecklistItem, addComment, deleteChecklistItem, deleteComment, failureMessage, getChecklist, getComments, updateChecklistItem,
  type ChecklistItem, type Comment,
} from "@/lib/api";
import { timeAgo, type BoardData, type Card } from "@/lib/kanban";

type CardDialogProps = {
  boardId: number;
  card: Card;
  username: string;
  onBoardChange: (board: BoardData) => void;
  onClose: () => void;
};

const sectionTitle = "font-display text-base font-semibold text-[var(--navy-dark)]";
const smallButton = "rounded-xl bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110";
const iconButton = "flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--gray-text)] transition hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]";

// A card's checklist and comments. Every change returns the updated board, which passes on so the card's badges update.
export const CardDialog = ({ boardId, card, username, onBoardChange, onClose }: CardDialogProps) => {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getChecklist(boardId, card.id), getComments(boardId, card.id)])
      .then(([checklist, loaded]) => { setItems(checklist); setComments(loaded); })
      .catch(() => setError("Unable to load this card."));
  }, [boardId, card.id]);

  const apply = async <T,>(request: Promise<T & { board: BoardData }>, show: (result: T) => void, failure: string) => {
    try {
      const result = await request;
      show(result);
      onBoardChange(result.board);
      setError("");
      return true;
    } catch (reason) {
      setError(failureMessage(reason, failure));
      return false;
    }
  };
  const showItems = (result: { items: ChecklistItem[] }) => setItems(result.items);
  const showComments = (result: { comments: Comment[] }) => setComments(result.comments);

  const submit = (field: string, send: (text: string) => Promise<boolean>) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const text = String(new FormData(formElement).get(field)).trim();
    if (text && await send(text)) formElement.reset();
  };

  // Ticks at once, and unticks again if the server refuses.
  const toggle = async (item: ChecklistItem, done: boolean) => {
    const previous = items;
    setItems(items!.map((current) => current.id === item.id ? { ...current, done } : current));
    if (!await apply(updateChecklistItem(boardId, card.id, item.id, { done }), showItems, "Unable to update the checklist.")) setItems(previous);
  };

  const done = items?.filter((item) => item.done).length ?? 0;

  return (
    <Modal title={card.title} subtitle="Checklist and comments" closeLabel="Close card" onClose={onClose}>
      {error && <p role="alert" className={`mt-4 ${modalError}`}>{error}</p>}

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h3 className={sectionTitle}>Checklist</h3>
          {items && items.length > 0 && <span className="text-xs font-semibold text-[var(--gray-text)]">{done} of {items.length} done</span>}
        </div>
        {items && items.length > 0 && (
          <ul aria-label="Checklist" className="mt-3 space-y-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-[var(--surface)]">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => toggle(item, event.target.checked)}
                  aria-label={item.text}
                  className="size-4 accent-[var(--secondary-purple)]"
                />
                <span className={`min-w-0 flex-1 break-words text-sm ${item.done ? "text-[var(--gray-text)] line-through" : "text-[var(--navy-dark)]"}`}>{item.text}</span>
                <button type="button" onClick={() => apply(deleteChecklistItem(boardId, card.id, item.id), showItems, "Unable to update the checklist.")} aria-label={`Remove ${item.text}`} data-tooltip="Remove this item" data-tooltip-align="end" className={iconButton}>
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit("item", (text) => apply(addChecklistItem(boardId, card.id, text), showItems, "Unable to update the checklist."))} className="mt-3 flex gap-2">
          <input name="item" required maxLength={200} aria-label="New checklist item" placeholder="Add an item" className={`${modalInput} mt-0`} />
          <button type="submit" className={smallButton}>Add</button>
        </form>
      </section>

      <section className="mt-8 border-t border-[var(--stroke)] pt-6">
        <h3 className={sectionTitle}>Comments</h3>
        <div className="mt-3 space-y-3">
          {comments === null && !error && <p className="text-sm text-[var(--gray-text)]">Loading...</p>}
          {comments?.length === 0 && <p className="text-sm text-[var(--gray-text)]">No comments yet.</p>}
          {comments && comments.length > 0 && (
            <ul aria-label="Comments" className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-xl bg-[var(--surface)] px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-[var(--gray-text)]">
                    <span className="font-semibold text-[var(--navy-dark)]">{comment.author ?? "Former member"}</span>
                    <span>{timeAgo(comment.createdAt)}</span>
                    {comment.author === username && (
                      <button type="button" onClick={() => apply(deleteComment(boardId, card.id, comment.id), showComments, "Unable to delete comment.")} aria-label="Delete comment" data-tooltip="Delete your comment" data-tooltip-align="end" className={`ml-auto ${iconButton}`}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--navy-dark)]">{comment.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form onSubmit={submit("content", (text) => apply(addComment(boardId, card.id, text), showComments, "Unable to add comment."))} className="mt-4 space-y-3">
          <textarea name="content" required maxLength={2000} rows={3} aria-label="New comment" placeholder="Write a comment" className={`${modalInput} mt-0 resize-y`} />
          <button type="submit" className={smallButton}>Add comment</button>
        </form>
      </section>
    </Modal>
  );
};
