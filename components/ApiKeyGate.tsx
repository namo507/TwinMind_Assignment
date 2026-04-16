"use client";

import { KeyRound, Mic, Sparkles } from "lucide-react";

interface ApiKeyGateProps {
  onOpenSettings: () => void;
}

/**
 * Shown the first time the app loads (no API key yet). Doesn't block the UI
 * behind a modal wall — the user can still click around — but it does give
 * them a clear "do this first" callout.
 */
export function ApiKeyGate({ onOpenSettings }: ApiKeyGateProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-6 py-2.5 text-sm text-amber-200">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0" />
        <span>
          Paste your Groq API key to start. The key stays in your browser — it&rsquo;s
          never stored on a server.
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-amber-200/80">
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Mic className="h-3.5 w-3.5" /> capture
        </span>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Sparkles className="h-3.5 w-3.5" /> suggest
        </span>
        <button
          onClick={onOpenSettings}
          className="rounded-md bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-ink-950 hover:bg-amber-300"
        >
          Open Settings
        </button>
      </div>
    </div>
  );
}
