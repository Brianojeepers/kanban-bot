import { GripVertical } from "lucide-react";
import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="flex rotate-2 cursor-grabbing items-start gap-1 rounded-xl border border-[var(--primary-blue)]/40 bg-white py-2.5 pl-1 pr-3 shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <GripVertical className="m-1.5 size-4 shrink-0 text-[var(--navy-dark)]" aria-hidden />
    <div className="min-w-0 pt-0.5">
      <h4 className="break-words font-display text-sm font-semibold leading-snug text-[var(--navy-dark)]">
        {card.title}
      </h4>
      <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
        {card.details}
      </p>
    </div>
  </article>
);
