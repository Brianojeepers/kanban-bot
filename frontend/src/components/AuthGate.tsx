"use client";

import { FormEvent, useEffect, useState } from "react";
import { SquareKanban } from "lucide-react";
import { Workspace } from "@/components/Workspace";
import { ApiError, getSession, register, signIn } from "@/lib/api";

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:bg-white focus:ring-4 focus:ring-[var(--primary-blue)]/15";
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]";

export const AuthGate = () => {
  // undefined while the session check runs, null when signed out.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [error, setError] = useState("");

  useEffect(() => {
    getSession()
      .then((session) => setUsername(session.username))
      .catch((failure) => {
        setUsername(null);
        if (!(failure instanceof ApiError)) setError("Unable to reach the server.");
      });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [name, password] = [String(form.get("username")), String(form.get("password"))];
    try {
      const session = mode === "signin" ? await signIn(name, password) : await register(name, password);
      setError("");
      setUsername(session.username);
    } catch (failure) {
      const detail = failure instanceof ApiError ? failure.detail : "";
      if (mode === "signin") setError(failure instanceof ApiError && failure.status === 429 ? detail : "Invalid username or password.");
      else setError(detail || "Use 3 to 32 letters, numbers, dots, dashes or underscores, and a password of at least 8 characters.");
    }
  };

  const switchMode = () => {
    setMode(mode === "signin" ? "register" : "signin");
    setError("");
  };

  if (username === undefined) return null;
  if (username) return <Workspace username={username} onSignedOut={() => setUsername(null)} />;

  const isSignIn = mode === "signin";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
          <SquareKanban className="size-6" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-[var(--navy-dark)]">Kanban Studio</h1>
        <p className="mt-1 text-sm text-[var(--gray-text)]">{isSignIn ? "Sign in to open your boards." : "Create an account to start planning."}</p>
        <div className="mt-8 space-y-4">
          <label className={labelClass}>
            Username
            <input name="username" required autoComplete="username" className={inputClass} {...(!isSignIn && { minLength: 3, maxLength: 32, pattern: "[A-Za-z0-9_.\\-]+" })} />
          </label>
          <label className={labelClass}>
            Password
            <input name="password" type="password" required autoComplete={isSignIn ? "current-password" : "new-password"} className={inputClass} {...(!isSignIn && { minLength: 8, maxLength: 128 })} />
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[var(--danger)]/10 px-3.5 py-2.5 text-sm text-[var(--danger)]">{error}</p>}
        <button type="submit" className="mt-6 w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] transition hover:brightness-110">
          {isSignIn ? "Sign in" : "Create account"}
        </button>
        <p className="mt-5 text-center text-sm text-[var(--gray-text)]">
          {isSignIn ? "New here?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode} className="font-semibold text-[var(--primary-blue)] hover:underline">
            {isSignIn ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
};
