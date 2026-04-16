"use client";

import { useEffect, useRef } from "react";
import { useCopilotStore } from "@/store/useCopilotStore";

export function TranscriptPanel() {
  const transcript = useCopilotStore((s) => s.transcript);
  const isRecording = useCopilotStore((s) => s.isRecording);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest line whenever new text lands.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  return (
    <section className="flex h-full flex-col border-r border-ink-800 bg-ink-900/40">
      <PanelHeading title="Transcript" subtitle={isRecording ? "Listening…" : "Idle"} live={isRecording} />
      <div
        ref={scrollRef}
        className="scroll-panel flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-ink-100"
      >
        {transcript.length === 0 ? (
          <EmptyState
            title="Nothing transcribed yet"
            body="Click Start to begin recording. The transcript will update roughly every 30 seconds."
          />
        ) : (
          <div className="space-y-2">
            {transcript.map((line) => (
              <div key={line.id} className="animate-fade-in">
                <span className="mr-2 text-[10px] uppercase tracking-wide text-ink-500">
                  {formatTime(line.createdAt)}
                </span>
                <span className="text-ink-100">{line.text}</span>
              </div>
            ))}
            {isRecording && (
              <div className="pt-1 text-xs text-ink-500">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-red-400" />
                recording…
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function PanelHeading({
  title,
  subtitle,
  live,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-300">{title}</h2>
        {subtitle && <span className="text-xs text-ink-500">· {subtitle}</span>}
      </div>
      {live && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-red-400" />
          live
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-[24ch] space-y-1">
        <p className="text-sm font-medium text-ink-300">{title}</p>
        <p className="text-xs text-ink-500">{body}</p>
      </div>
    </div>
  );
}
