"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { PanelRightClose, SendHorizontal, Sparkles } from "lucide-react";
import type { BoardData } from "@/lib/kanban";

type Message = { role: string; content: string };
type ChatSidebarProps = { onBoardUpdated: (board: BoardData) => void; onClose?: () => void };

export const ChatSidebar = ({ onBoardUpdated, onClose }: ChatSidebarProps) => {
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
    // Enter submits through requestSubmit, which ignores the disabled Send button.
    if (!message || isSending) return;
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
    <aside className="flex h-[36rem] flex-col border-t border-[var(--stroke)] bg-white lg:h-screen lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0 xl:w-96">
      <div className="flex items-center gap-3 border-b border-[var(--stroke)] px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--secondary-purple)] to-[var(--primary-blue)] text-white">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold leading-tight text-[var(--navy-dark)]">AI assistant</h2>
          <p className="text-xs text-[var(--gray-text)]">Creates, edits and moves cards for you</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Hide AI assistant" title="Hide" className="flex size-8 items-center justify-center rounded-lg text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]">
            <PanelRightClose className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div ref={listRef} className="relative flex flex-1 flex-col gap-3 overflow-y-auto bg-[var(--surface)] px-4 py-5 [scrollbar-width:thin]" aria-live="polite">
        {messages.length === 0 && !isSending && (
          <div className="m-auto max-w-56 text-center">
            <Sparkles className="mx-auto size-6 text-[var(--secondary-purple)] opacity-60" aria-hidden />
            <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">Ask the assistant to create, edit, move, or delete cards.</p>
          </div>
        )}
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <p key={`${message.role}-${index}`} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? "self-end rounded-br-md bg-[var(--secondary-purple)] text-white" : "self-start rounded-bl-md border border-[var(--stroke)] bg-white text-[var(--navy-dark)] shadow-[var(--shadow-soft)]"}`}>
              <span className="sr-only">{isUser ? "You: " : "Assistant: "}</span>{message.content}
            </p>
          );
        })}
        {isSending && (
          <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-soft)]">
            <span className="flex gap-1" aria-hidden>
              {[0, 150, 300].map((delay) => <span key={delay} className="size-1.5 animate-bounce rounded-full bg-[var(--secondary-purple)]" style={{ animationDelay: `${delay}ms` }} />)}
            </span>
            <p className="text-xs text-[var(--gray-text)]">Assistant is typing...</p>
          </div>
        )}
      </div>
      <form onSubmit={send} className="border-t border-[var(--stroke)] bg-white p-3">
        {error && <p role="alert" className="mb-2 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-1.5 transition focus-within:border-[var(--primary-blue)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--primary-blue)]/10">
          <textarea name="message" required maxLength={2000} aria-label="Message" placeholder="Ask about your board" onKeyDown={sendOnEnter} rows={1} className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none [field-sizing:content]" />
          <button type="submit" disabled={isSending} aria-label="Send" title="Send" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--secondary-purple)] text-white transition hover:brightness-110 disabled:opacity-50">
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-[var(--gray-text)]">Enter to send, Shift+Enter for a new line</p>
      </form>
    </aside>
  );
};
