"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: string; content: string };
type ChatSidebarProps = { onBoardUpdated: () => void };

export const ChatSidebar = ({ onBoardUpdated }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => { fetch("/api/messages").then((response) => response.ok ? response.json() : []).then(setMessages); }, []);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const message = String(form.get("message") ?? "").trim();
    if (!message) return;
    setIsSending(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setMessages(result.messages);
      formElement.reset();
      onBoardUpdated();
    } catch { setError("Unable to send message."); }
    finally { setIsSending(false); }
  };

  return <aside className="border-l border-[var(--stroke)] bg-white p-5 lg:w-80"><h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">AI assistant</h2><div className="my-4 space-y-3" aria-live="polite">{messages.map((message, index) => <p key={`${message.role}-${index}`} className="text-sm"><strong>{message.role === "assistant" ? "Assistant" : "You"}:</strong> {message.content}</p>)}</div><form onSubmit={send} className="space-y-2"><textarea name="message" required placeholder="Ask about your board" className="w-full border p-2" rows={3} />{error && <p role="alert">{error}</p>}<button type="submit" disabled={isSending} className="bg-[var(--secondary-purple)] px-3 py-2 text-sm text-white">{isSending ? "Sending..." : "Send"}</button></form></aside>;
};