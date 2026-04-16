"use client";

import { useCallback, useEffect, useState } from "react";
import { selectHasApiKey, useCopilotStore } from "@/store/useCopilotStore";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSuggestionEngine } from "@/hooks/useSuggestionEngine";
import { useChatEngine } from "@/hooks/useChatEngine";
import { Header } from "@/components/Header";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ApiKeyGate } from "@/components/ApiKeyGate";

export default function HomePage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Hydration guard: zustand/persist reads localStorage on mount; rendering
  // anything that depends on persisted state before hydration would flicker.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasKey = useCopilotStore(selectHasApiKey);
  const isRecording = useCopilotStore((s) => s.isRecording);
  const appendTranscript = useCopilotStore((s) => s.appendTranscript);
  const setError = useCopilotStore((s) => s.setError);

  // --- Wire chunks → /api/transcribe → store ----------------------------
  const onChunk = useCallback(
    async (blob: Blob, seq: number) => {
      const state = useCopilotStore.getState();
      if (!state.groqApiKey) return; // double-guard
      const form = new FormData();
      form.append("file", blob, `chunk-${seq}.webm`);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "X-Groq-Key": state.groqApiKey },
        body: form,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`transcribe ${res.status}: ${err.slice(0, 200)}`);
      }
      const data = (await res.json()) as { text?: string };
      if (data.text) appendTranscript(data.text);
    },
    [appendTranscript],
  );

  const { start, stop } = useAudioRecorder(onChunk);
  const { triggerOnce } = useSuggestionEngine();
  const { sendUserQuery, sendSuggestionClick } = useChatEngine();

  const onToggleRecord = useCallback(() => {
    if (!hasKey) {
      setError("Paste your Groq API key in Settings first.");
      setSettingsOpen(true);
      return;
    }
    if (isRecording) void stop();
    else void start();
  }, [hasKey, isRecording, setError, start, stop]);

  const onManualRefresh = useCallback(() => {
    void triggerOnce();
  }, [triggerOnce]);

  // Open settings automatically on first ever load (no key yet).
  useEffect(() => {
    if (!mounted) return;
    if (!hasKey) setSettingsOpen(true);
    // Only the first time. We intentionally don't depend on hasKey afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  return (
    <div className="flex h-full min-h-screen flex-col">
      <Header
        onToggleRecord={onToggleRecord}
        onOpenSettings={() => setSettingsOpen(true)}
        onManualRefresh={onManualRefresh}
      />

      {mounted && !hasKey && (
        <ApiKeyGate onOpenSettings={() => setSettingsOpen(true)} />
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(320px,1.4fr)]">
        <TranscriptPanel />
        <SuggestionsPanel onCardClick={(c) => void sendSuggestionClick(c)} />
        <ChatPanel onSend={(t) => void sendUserQuery(t)} />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ErrorBanner />
    </div>
  );
}
