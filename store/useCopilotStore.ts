"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatMessage,
  SuggestionBatch,
  SuggestionCard,
  TranscriptLine,
} from "@/lib/types";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_SUGGESTION_PROMPT,
} from "@/lib/prompts";

/**
 * Store design:
 * - PERSISTED (localStorage): api key + editable prompts + context-window sizes.
 *   These are the things the user configures once and wants to survive reload.
 * - EPHEMERAL (in-memory only): transcript, suggestion batches, chat history.
 *   The assignment says "no data persistence needed when reloading the page".
 *
 * Why Zustand: we have very-high-frequency updates (streaming chat tokens land
 * at ~400 tokens/sec from gpt-oss-120b). React Context would rerender every
 * subscriber on every token. Zustand's selector-based subscriptions let each
 * panel subscribe to only the slice it renders.
 */

// ---- Settings (persisted) ----
interface SettingsSlice {
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;

  suggestionPrompt: string;
  setSuggestionPrompt: (p: string) => void;
  detailedAnswerPrompt: string;
  setDetailedAnswerPrompt: (p: string) => void;
  chatPrompt: string;
  setChatPrompt: (p: string) => void;

  /** Sliding-window size (characters) for the live suggestion engine. */
  suggestionContextChars: number;
  setSuggestionContextChars: (n: number) => void;
  /** Max chars of transcript to inject on suggestion-click detailed answers. */
  detailedAnswerContextChars: number;
  setDetailedAnswerContextChars: (n: number) => void;
  /** Max chars of transcript to inject for free-form chat. */
  chatContextChars: number;
  setChatContextChars: (n: number) => void;

  /** Auto-refresh cadence for suggestions, in ms. */
  refreshIntervalMs: number;
  setRefreshIntervalMs: (n: number) => void;

  /** Audio chunk length, in ms (must match the server's expectations). */
  audioChunkMs: number;
  setAudioChunkMs: (n: number) => void;

  resetPrompts: () => void;
}

// ---- Live session state (ephemeral) ----
interface SessionSlice {
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  transcript: TranscriptLine[];
  appendTranscript: (text: string) => void;
  clearTranscript: () => void;

  suggestionBatches: SuggestionBatch[]; // newest first
  isGeneratingSuggestions: boolean;
  pushBatch: (batch: SuggestionBatch) => void;
  setIsGeneratingSuggestions: (v: boolean) => void;
  clearBatches: () => void;

  chat: ChatMessage[];
  addUserMessage: (content: string, sourceSuggestionId?: string) => string;
  addAssistantPlaceholder: () => string;
  appendAssistantToken: (id: string, token: string) => void;
  setAssistantContent: (id: string, content: string) => void;
  clearChat: () => void;

  /** Global error banner (toast-lite). */
  error: string | null;
  setError: (msg: string | null) => void;

  resetSession: () => void;
}

export type CopilotStore = SettingsSlice & SessionSlice;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export const useCopilotStore = create<CopilotStore>()(
  persist(
    (set, get) => ({
      // ---- Settings defaults ----
      groqApiKey: "",
      setGroqApiKey: (key) => set({ groqApiKey: key.trim() }),

      suggestionPrompt: DEFAULT_SUGGESTION_PROMPT,
      setSuggestionPrompt: (p) => set({ suggestionPrompt: p }),
      detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
      setDetailedAnswerPrompt: (p) => set({ detailedAnswerPrompt: p }),
      chatPrompt: DEFAULT_CHAT_PROMPT,
      setChatPrompt: (p) => set({ chatPrompt: p }),

      suggestionContextChars: 2200,
      setSuggestionContextChars: (n) => set({ suggestionContextChars: clampInt(n, 400, 12000) }),
      detailedAnswerContextChars: 20000,
      setDetailedAnswerContextChars: (n) =>
        set({ detailedAnswerContextChars: clampInt(n, 1000, 120000) }),
      chatContextChars: 20000,
      setChatContextChars: (n) => set({ chatContextChars: clampInt(n, 1000, 120000) }),

      refreshIntervalMs: 30000,
      setRefreshIntervalMs: (n) => set({ refreshIntervalMs: clampInt(n, 5000, 120000) }),

      audioChunkMs: 30000,
      setAudioChunkMs: (n) => set({ audioChunkMs: clampInt(n, 5000, 60000) }),

      resetPrompts: () =>
        set({
          suggestionPrompt: DEFAULT_SUGGESTION_PROMPT,
          detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
          chatPrompt: DEFAULT_CHAT_PROMPT,
        }),

      // ---- Session state ----
      isRecording: false,
      setIsRecording: (v) => set({ isRecording: v }),

      transcript: [],
      appendTranscript: (text) => {
        const t = text.trim();
        if (!t) return;
        set((state) => ({
          transcript: [...state.transcript, { id: uid(), text: t, createdAt: Date.now() }],
        }));
      },
      clearTranscript: () => set({ transcript: [] }),

      suggestionBatches: [],
      isGeneratingSuggestions: false,
      pushBatch: (batch) =>
        set((state) => ({ suggestionBatches: [batch, ...state.suggestionBatches] })),
      setIsGeneratingSuggestions: (v) => set({ isGeneratingSuggestions: v }),
      clearBatches: () => set({ suggestionBatches: [] }),

      chat: [],
      addUserMessage: (content, sourceSuggestionId) => {
        const id = uid();
        set((state) => ({
          chat: [
            ...state.chat,
            {
              id,
              role: "user",
              content,
              createdAt: Date.now(),
              sourceSuggestionId,
            },
          ],
        }));
        return id;
      },
      addAssistantPlaceholder: () => {
        const id = uid();
        set((state) => ({
          chat: [...state.chat, { id, role: "assistant", content: "", createdAt: Date.now() }],
        }));
        return id;
      },
      appendAssistantToken: (id, token) => {
        if (!token) return;
        set((state) => ({
          chat: state.chat.map((m) =>
            m.id === id ? { ...m, content: m.content + token } : m,
          ),
        }));
      },
      setAssistantContent: (id, content) => {
        set((state) => ({
          chat: state.chat.map((m) => (m.id === id ? { ...m, content } : m)),
        }));
      },
      clearChat: () => set({ chat: [] }),

      error: null,
      setError: (msg) => set({ error: msg }),

      resetSession: () =>
        set({
          transcript: [],
          suggestionBatches: [],
          chat: [],
          isGeneratingSuggestions: false,
          isRecording: false,
          error: null,
        }),
    }),
    {
      name: "twinmind-settings-v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : dummyStorage)),
      // Persist *only* settings. Transcript / chat / batches are session-scoped.
      partialize: (state) => ({
        groqApiKey: state.groqApiKey,
        suggestionPrompt: state.suggestionPrompt,
        detailedAnswerPrompt: state.detailedAnswerPrompt,
        chatPrompt: state.chatPrompt,
        suggestionContextChars: state.suggestionContextChars,
        detailedAnswerContextChars: state.detailedAnswerContextChars,
        chatContextChars: state.chatContextChars,
        refreshIntervalMs: state.refreshIntervalMs,
        audioChunkMs: state.audioChunkMs,
      }),
    },
  ),
);

// ---- Selectors (stable references) ----
export const selectHasApiKey = (s: CopilotStore) => s.groqApiKey.trim().length > 0;
export const selectTranscriptText = (s: CopilotStore) =>
  s.transcript.map((l) => l.text).join(" ");

// ---- helpers ----
function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(n) ? n : min);
  return Math.max(min, Math.min(max, v));
}

/** No-op storage for SSR — the persist middleware touches it during hydration. */
const dummyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
} as unknown as Storage;

export function getAllPreviousTitles(batches: SuggestionBatch[], limit = 12): string[] {
  const out: string[] = [];
  for (const b of batches) {
    for (const c of b.suggestions) {
      out.push(c.title);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function normaliseSuggestionCard(raw: unknown): SuggestionCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = String(r.type ?? "").toUpperCase();
  const allowed = ["QUESTION", "TALKING_POINT", "ANSWER", "FACT_CHECK", "CONTEXT"];
  if (!allowed.includes(type)) return null;
  const title = String(r.title ?? "").trim();
  const content = String(r.content ?? "").trim();
  if (!title || !content) return null;
  const score = Number(r.relevance_score ?? 0.5);
  return {
    id: String(r.id ?? uid()),
    type: type as SuggestionCard["type"],
    title: title.slice(0, 200),
    content: content.slice(0, 1200),
    relevance_score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5,
  };
}
