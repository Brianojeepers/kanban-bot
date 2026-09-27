"use client";

import { FormEvent, useEffect, useState } from "react";
import { Sparkles, SquareKanban } from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import type { BoardData } from "@/lib/kanban";

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white focus:ring-4 focus:ring-[var(--primary-blue)]/15";

export const AuthGate = () => {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then((response) => setIsSignedIn(response.ok))
      .catch(() => { setIsSignedIn(false); setError("Unable to reach the server."); });
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (response.ok) {
      setIsSignedIn(true);
      return;
    }
    const tooManyAttempts = response.status === 429 ? (await response.json()).detail : "";
    setError(tooManyAttempts || "Invalid username or password.");
  };

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setBoard(null);
    setIsSignedIn(false);
  };

  if (isSignedIn === null) return null;
  if (isSignedIn) {
    return (
      <div className="lg:flex lg:h-screen lg:overflow-hidden">
        <div className="min-w-0 flex-1">
          <KanbanBoard board={board} onBoardChange={setBoard} onLogout={logout} />
        </div>
        {/* Hidden rather than unmounted, so an in-flight reply and the history survive. */}
        <div hidden={!isChatOpen} className="contents">
          <ChatSidebar onBoardUpdated={setBoard} onClose={() => setIsChatOpen(false)} />
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
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-3xl border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
          <SquareKanban className="size-6" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-[var(--navy-dark)]">Kanban Studio</h1>
        <p className="mt-1 text-sm text-[var(--gray-text)]">Sign in to open your board.</p>
        <div className="mt-8 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]">
            Username
            <input name="username" required autoComplete="username" className={inputClass} />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]">
            Password
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[var(--danger)]/10 px-3.5 py-2.5 text-sm text-[var(--danger)]">{error}</p>}
        <button type="submit" className="mt-6 w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] transition hover:brightness-110">
          Sign in
        </button>
      </form>
    </main>
  );
};
