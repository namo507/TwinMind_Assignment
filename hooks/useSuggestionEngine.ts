"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getAllPreviousTitles,
  normaliseSuggestionCard,
  selectTranscriptText,
  useCopilotStore,
} from "@/store/useCopilotStore";
import type { SuggestionBatch } from "@/lib/types";

/**
 * useSuggestionEngine
 * -------------------
 * Drives the middle column.
 *
 * Triggers a new batch of 3 suggestions when either:
 *   (a) the auto-refresh interval fires while the user is recording, OR
 *   (b) the user manually clicks the refresh button.
 *
 * We deliberately do NOT trigger on "transcript length changed" because the
 * assignment specifies a fixed ~30s cadence — triggering on every transcript
 * append would produce a dozen calls in the first 30s while Whisper finishes
 * warming up.
 */
export function useSuggestionEngine() {
  const isRecording = useCopilotStore((s) => s.isRecording);
  const refreshIntervalMs = useCopilotStore((s) => s.refreshIntervalMs);
  const setError = useCopilotStore((s) => s.setError);
  const pushBatch = useCopilotStore((s) => s.pushBatch);
  const setIsGeneratingSuggestions = useCopilotStore((s) => s.setIsGeneratingSuggestions);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const triggerOnce = useCallback(async (): Promise<boolean> => {
    // Read latest state *imperatively* so the callback identity is stable and
    // doesn't re-fire the interval effect on every transcript append.
    const state = useCopilotStore.getState();
    if (!state.groqApiKey) {
      setError("Paste your Groq API key in Settings to generate suggestions.");
      return false;
    }
    if (inFlightRef.current) return false;

    const transcriptText = selectTranscriptText(state);
    if (transcriptText.trim().length < 40) {
      // Not enough to say anything meaningful. Skip silently; try again next tick.
      return false;
    }

    const window = transcriptText.slice(-state.suggestionContextChars);
    const previousTitles = getAllPreviousTitles(state.suggestionBatches, 12);

    inFlightRef.current = true;
    setIsGeneratingSuggestions(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Groq-Key": state.groqApiKey,
        },
        body: JSON.stringify({
          transcriptWindow: window,
          previousTitles,
          systemPrompt: state.suggestionPrompt,
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`/api/suggest ${res.status}: ${err.slice(0, 200)}`);
      }
      const data = (await res.json()) as { raw?: unknown };
      const raw = (data.raw as { suggestions?: unknown[] }) ?? {};
      const list = Array.isArray(raw.suggestions) ? raw.suggestions : [];
      const normalised = list
        .map(normaliseSuggestionCard)
        .filter((c): c is NonNullable<ReturnType<typeof normaliseSuggestionCard>> => c !== null)
        .slice(0, 3);

      if (normalised.length === 0) {
        setError("Model returned an empty or invalid suggestions list.");
        return false;
      }

      const batch: SuggestionBatch = {
        id: `b_${Date.now()}`,
        createdAt: Date.now(),
        contextChars: window.length,
        suggestions: normalised,
      };
      pushBatch(batch);
      return true;
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(`Suggestion error: ${(err as Error).message}`);
      }
      return false;
    } finally {
      inFlightRef.current = false;
      setIsGeneratingSuggestions(false);
    }
  }, [pushBatch, setError, setIsGeneratingSuggestions]);

  // Auto-trigger on a timer while recording.
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      void triggerOnce();
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [isRecording, refreshIntervalMs, triggerOnce]);

  // Cancel in-flight requests if the user navigates away.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { triggerOnce };
}
