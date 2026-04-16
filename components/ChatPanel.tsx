"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useCopilotStore } from "@/store/useCopilotStore";
import { EmptyState, PanelHeading } from "./TranscriptPanel";
import { cn } from "@/utils/cn";

interface ChatPanelProps {
  onSend: (text: string) => void | Promise<void>;
}

export function ChatPanel({ onSend }: ChatPanelProps) {
  const chat = useCopilotStore((s) => s.chat);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the bottom while streaming.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    await onSend(t);
  };

  return (
    <section className="flex h-full flex-col bg-ink-900/10">
      <PanelHeading title="Chat" subtitle="Ask anything about the meeting" />
      <div
        ref={listRef}
        className="scroll-panel flex-1 overflow-y-auto px-4 py-4"
      >
        {chat.length === 0 ? (
          <EmptyState
            title="No messages yet"
            body="Click a suggestion card for a detailed answer, or ask a question below."
          />
        ) : (
          <div className="space-y-4">
            {chat.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex animate-fade-in",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                    m.role === "user"
                      ? "bg-accent-500/90 text-white"
                      : "border border-ink-700/70 bg-ink-900/70 text-ink-100",
                  )}
                >
                  {m.role === "assistant" && m.content === "" ? (
                    <Thinking />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-ink-800 bg-ink-900/40 px-3 py-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Ask about what was said… (Enter to send, Shift+Enter for newline)"
            className="min-h-[40px] max-h-40 w-full resize-none rounded-md border border-ink-700 bg-ink-950/80 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex h-[40px] items-center gap-1.5 rounded-md bg-accent-500 px-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 text-ink-400">
      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400" />
      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400 [animation-delay:240ms]" />
      <span className="ml-1 text-xs">thinking</span>
    </span>
  );
}
