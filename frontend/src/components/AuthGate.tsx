"use client";

import { FormEvent, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";

export const AuthGate = () => {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [boardVersion, setBoardVersion] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/session").then((response) => setIsSignedIn(response.ok));
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
    setError("Invalid username or password.");
  };

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setIsSignedIn(false);
  };

  if (isSignedIn === null) return null;
  if (isSignedIn) return <div className="lg:flex"><div className="min-w-0 flex-1"><KanbanBoard key={boardVersion} onLogout={logout} /></div><ChatSidebar onBoardUpdated={() => setBoardVersion((version) => version + 1)} /></div>;

  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6"><form onSubmit={signIn} className="w-full space-y-4"><h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">Kanban Studio</h1><label className="block text-sm">Username<input name="username" required className="mt-1 w-full border p-2" /></label><label className="block text-sm">Password<input name="password" type="password" required className="mt-1 w-full border p-2" /></label>{error && <p role="alert">{error}</p>}<button className="bg-[var(--secondary-purple)] px-4 py-2 text-white" type="submit">Sign in</button></form></main>;
};