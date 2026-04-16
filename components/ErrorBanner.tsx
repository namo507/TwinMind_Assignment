"use client";

import { AlertCircle, X } from "lucide-react";
import { useEffect } from "react";
import { useCopilotStore } from "@/store/useCopilotStore";

export function ErrorBanner() {
  const error = useCopilotStore((s) => s.error);
  const setError = useCopilotStore((s) => s.setError);

  // Auto-dismiss after 6 seconds.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error, setError]);

  if (!error) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-lg backdrop-blur animate-fade-in">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        <span className="flex-1 leading-snug">{error}</span>
        <button
          onClick={() => setError(null)}
          className="shrink-0 rounded p-0.5 text-red-300 hover:bg-red-500/20"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
