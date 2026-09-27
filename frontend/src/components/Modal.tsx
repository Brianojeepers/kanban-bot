import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = { title: string; subtitle: string; closeLabel: string; onClose: () => void; children: ReactNode };

export const Modal = ({ title, subtitle, closeLabel, onClose, children }: ModalProps) => (
  <div className="fixed inset-0 z-20 flex items-center justify-center bg-[var(--navy-dark)]/30 px-4 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="modal-title" className="font-display text-xl font-semibold text-[var(--navy-dark)]">{title}</h2>
          <p className="truncate text-sm text-[var(--gray-text)]">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={closeLabel} data-tooltip="Close (Esc)" data-tooltip-align="end" autoFocus className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {children}
    </section>
  </div>
);

export const modalLabel = "block text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]";
export const modalInput = "mt-1.5 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white";
export const modalError = "rounded-xl bg-[var(--danger)]/10 px-3.5 py-2.5 text-sm text-[var(--danger)]";
