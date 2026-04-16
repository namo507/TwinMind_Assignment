"use client";

import { useEffect, useRef } from "react";
import { useCopilotStore } from "@/store/useCopilotStore";
import type { SuggestionCard, SuggestionType } from "@/lib/types";
import { cn } from "@/utils/cn";
import { EmptyState, PanelHeading } from "./TranscriptPanel";
import { MessageCircleQuestion, Quote, BookOpen, ShieldCheck, Sparkles } from "lucide-react";

interface SuggestionsPanelProps {
  onCardClick: (card: SuggestionCard) => void;
}

export function SuggestionsPanel({ onCardClick }: SuggestionsPanelProps) {
  const batches = useCopilotStore((s) => s.suggestionBatches);
  const isGenerating = useCopilotStore((s) => s.isGeneratingSuggestions);
  const scrollRef = useRef<HTMLDivElement>(null);

  // New batches land at the top — make sure the user sees them.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [batches.length]);

  return (
    <section className="flex h-full flex-col border-r border-ink-800 bg-ink-900/20">
      <PanelHeading
        title="Live suggestions"
        subtitle={isGenerating ? "Generating…" : batches.length > 0 ? `${batches.length} batch${batches.length === 1 ? "" : "es"}` : undefined}
        live={isGenerating}
      />
      <div ref={scrollRef} className="scroll-panel flex-1 overflow-y-auto px-3 py-3">
        {isGenerating && batches.length === 0 && <SkeletonBatch />}
        {!isGenerating && batches.length === 0 && (
          <EmptyState
            title="No suggestions yet"
            body="Start recording. Every ~30 seconds we'll surface three actionable cards."
          />
        )}
        <div className="space-y-5">
          {batches.map((batch, idx) => (
            <div key={batch.id} className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {idx === 0 ? "Latest" : `Earlier · ${formatAgo(batch.createdAt)}`}
                </span>
                <span className="text-[10px] text-ink-500">
                  {batch.contextChars.toLocaleString()} char context
                </span>
              </div>
              {batch.suggestions.map((card) => (
                <SuggestionCardView key={card.id} card={card} onClick={() => onCardClick(card)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SuggestionCardView({
  card,
  onClick,
}: {
  card: SuggestionCard;
  onClick: () => void;
}) {
  const meta = TYPE_META[card.type];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-lift group w-full rounded-lg border border-ink-700/80 bg-ink-900/70 p-3 text-left shadow-sm",
        "hover:border-accent-500/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
            meta.iconWrap,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                meta.chip,
              )}
            >
              {meta.label}
            </span>
            <span className="text-[10px] text-ink-500">
              relevance {Math.round(card.relevance_score * 100)}%
            </span>
          </div>
          <p className="mt-1 text-sm font-medium leading-snug text-ink-50">
            {card.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-300">{card.content}</p>
          <p className="mt-1.5 text-[10px] text-ink-500 group-hover:text-accent-300">
            Click for detailed answer →
          </p>
        </div>
      </div>
    </button>
  );
}

function SkeletonBatch() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse-soft rounded-lg border border-ink-800 bg-ink-900/50"
        />
      ))}
    </div>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

const TYPE_META: Record<
  SuggestionType,
  {
    label: string;
    icon: typeof MessageCircleQuestion;
    chip: string;
    iconWrap: string;
  }
> = {
  QUESTION: {
    label: "Question",
    icon: MessageCircleQuestion,
    chip: "bg-sky-500/15 text-sky-300",
    iconWrap: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  },
  TALKING_POINT: {
    label: "Talking point",
    icon: Quote,
    chip: "bg-violet-500/15 text-violet-300",
    iconWrap: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  ANSWER: {
    label: "Answer",
    icon: Sparkles,
    chip: "bg-emerald-500/15 text-emerald-300",
    iconWrap: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  FACT_CHECK: {
    label: "Fact check",
    icon: ShieldCheck,
    chip: "bg-amber-500/15 text-amber-300",
    iconWrap: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  CONTEXT: {
    label: "Context",
    icon: BookOpen,
    chip: "bg-indigo-500/15 text-indigo-300",
    iconWrap: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
  },
};
