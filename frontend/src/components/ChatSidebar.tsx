"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { BoardData } from "@/lib/kanban";

type Message = { role: string; content: string };
type ChatSidebarProps = { onBoardUpdated: (board: BoardData) => void };

export const ChatSidebar = ({ onBoardUpdated }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/messages").then((response) => response.ok ? response.json() : []).catch(() => []).then((history: Message[]) => setMessages((current) => [...history, ...current])); }, []);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, isSending]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const message = String(new FormData(formElement).get("message") ?? "").trim();
    if (!message) return;
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setIsSending(true); setError("");
    formElement.reset();
    let reason = "";
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.detail === "string") reason = result.detail;
        throw new Error();
      }
      setMessages(result.messages);
      onBoardUpdated(result.board);
    } catch {
      setMessages(history);
      (formElement.elements.namedItem("message") as HTMLTextAreaElement).value = message;
      setError(reason || "Unable to send message.");
    }
    finally { setIsSending(false); }
  };

  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };

  return (
    <aside className="flex h-[32rem] flex-col border-l border-[var(--stroke)] bg-white lg:sticky lg:top-0 lg:h-screen lg:w-80">
      <h2 className="border-b border-[var(--stroke)] px-5 py-4 font-display text-xl font-semibold text-[var(--navy-dark)]">AI assistant</h2>
      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[var(--surface)] px-4 py-4" aria-live="polite">
        {messages.length === 0 && !isSending && <p className="m-auto text-center text-sm text-[var(--gray-text)]">Ask the assistant to create, edit, move, or delete cards.</p>}
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <p key={`${message.role}-${index}`} className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${isUser ? "self-end rounded-br-sm bg-[var(--secondary-purple)] text-white" : "self-start rounded-bl-sm border border-[var(--stroke)] bg-white text-[var(--navy-dark)]"}`}>
              <span className="sr-only">{isUser ? "You: " : "Assistant: "}</span>{message.content}
            </p>
          );
        })}
        {isSending && <p className="self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--gray-text)]">Assistant is typing...</p>}
      </div>
      <form onSubmit={send} className="border-t border-[var(--stroke)] p-3">
        {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea name="message" required aria-label="Message" placeholder="Ask about your board" onKeyDown={sendOnEnter} rows={1} className="max-h-32 flex-1 resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
          <button type="submit" disabled={isSending} className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
        </div>
      </form>
    </aside>
  );
};
