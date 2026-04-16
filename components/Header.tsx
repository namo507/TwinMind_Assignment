"use client";

import { useCallback } from "react";
import { Mic, MicOff, RefreshCcw, Settings, Download, Trash2 } from "lucide-react";
import { useCopilotStore, selectHasApiKey } from "@/store/useCopilotStore";
import { buildSessionExport, downloadJson } from "@/lib/exportSession";
import { cn } from "@/utils/cn";

interface HeaderProps {
  onToggleRecord: () => void;
  onOpenSettings: () => void;
  onManualRefresh: () => void | Promise<void>;
  onResetSession: () => void | Promise<void>;
}

export function Header({
  onToggleRecord,
  onOpenSettings,
  onManualRefresh,
  onResetSession,
}: HeaderProps) {
  const isRecording = useCopilotStore((s) => s.isRecording);
  const isGeneratingSuggestions = useCopilotStore((s) => s.isGeneratingSuggestions);
  const hasKey = useCopilotStore(selectHasApiKey);

  const onExport = useCallback(() => {
    const s = useCopilotStore.getState();
    const payload = buildSessionExport({
      transcript: s.transcript,
      suggestionBatches: s.suggestionBatches,
      chat: s.chat,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(payload, `twinmind-session-${stamp}.json`);
  }, []);

  const onReset = useCallback(() => {
    if (!confirm("Clear transcript, suggestions, and chat for this session?")) return;
    void onResetSession();
  }, [onResetSession]);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-ink-800 bg-ink-900/60 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 ring-1 ring-inset ring-accent-500/30">
          <span className="text-sm font-semibold text-accent-300">TM</span>
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-ink-50">TwinMind — Live Suggestions</h1>
          <p className="text-xs text-ink-400">
            Groq whisper-large-v3 · openai/gpt-oss-120b
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onManualRefresh}
          disabled={!hasKey || isGeneratingSuggestions}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-700/60 disabled:cursor-not-allowed disabled:opacity-60"
          title={!hasKey ? "Add your Groq API key in Settings first" : "Refresh transcript and suggestions now"}
        >
          <RefreshCcw
            className={cn("h-3.5 w-3.5", isGeneratingSuggestions && "animate-spin")}
          />
          Refresh
        </button>

        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-700/60"
          title="Export session as JSON"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-700/60"
          title="Clear transcript, suggestions, and chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Reset
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-700/60"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>

        <button
          type="button"
          onClick={onToggleRecord}
          disabled={!hasKey}
          title={!hasKey ? "Add your Groq API key in Settings first" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold shadow-sm transition",
            isRecording
              ? "bg-red-500/90 text-white hover:bg-red-500"
              : "bg-accent-500 text-white hover:bg-accent-400",
            !hasKey && "cursor-not-allowed opacity-60",
          )}
        >
          {isRecording ? (
            <>
              <MicOff className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Start
            </>
          )}
        </button>
      </div>
    </header>
  );
}
