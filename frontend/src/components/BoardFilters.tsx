import clsx from "clsx";
import { Search, X } from "lucide-react";
import { DUE_SOON_DAYS, emptyFilter, isFiltering, UNASSIGNED, type CardFilter, type Priority } from "@/lib/kanban";

type BoardFiltersProps = {
  filter: CardFilter;
  onChange: (filter: CardFilter) => void;
  members: string[];
  labels: string[];
  shown: number;
  total: number;
};

const control = "h-8 rounded-lg border border-[var(--stroke)] bg-white text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20";

export const BoardFilters = ({ filter, onChange, members, labels, shown, total }: BoardFiltersProps) => (
  <div className="flex flex-wrap items-center gap-2 px-4 pt-3 sm:px-6">
    <label className="relative">
      <span className="sr-only">Search cards</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--gray-text)]" aria-hidden />
      <input
        type="search"
        value={filter.text}
        onChange={(event) => onChange({ ...filter, text: event.target.value })}
        placeholder="Search cards"
        className={clsx(control, "w-52 pl-8 pr-2.5 font-medium")}
      />
    </label>
    <select aria-label="Filter by priority" value={filter.priority} onChange={(event) => onChange({ ...filter, priority: event.target.value as Priority | "" })} className={clsx(control, "px-2")}>
      <option value="">Any priority</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    {members.length > 1 && (
      <select aria-label="Filter by assignee" value={filter.assignee} onChange={(event) => onChange({ ...filter, assignee: event.target.value })} className={clsx(control, "px-2")}>
        <option value="">Anyone</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {members.map((member) => <option key={member} value={member}>{member}</option>)}
      </select>
    )}
    {labels.length > 0 && (
      <select aria-label="Filter by label" value={filter.label} onChange={(event) => onChange({ ...filter, label: event.target.value })} className={clsx(control, "px-2")}>
        <option value="">Any label</option>
        {labels.map((label) => <option key={label} value={label}>{label}</option>)}
      </select>
    )}
    <select aria-label="Filter by due date" value={filter.due} onChange={(event) => onChange({ ...filter, due: event.target.value as CardFilter["due"] })} className={clsx(control, "px-2")}>
      <option value="">Any due date</option>
      <option value="overdue">Overdue</option>
      <option value="soon">Due in the next {DUE_SOON_DAYS} days</option>
    </select>
    {isFiltering(filter) && (
      <>
        <p className="text-xs text-[var(--gray-text)]" role="status">Showing {shown} of {total} cards</p>
        <button type="button" onClick={() => onChange(emptyFilter)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:bg-white">
          <X className="size-3.5" aria-hidden />
          Clear filters
        </button>
      </>
    )}
  </div>
);
