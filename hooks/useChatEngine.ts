"use client";

import { useCallback, useRef } from "react";
import { selectTranscriptText, useCopilotStore } from "@/store/useCopilotStore";
import {
  buildChatSystemMessage,
  buildDetailedAnswerUserMessage,
} from "@/lib/prompts";
import type { SuggestionCard } from "@/lib/types";

/**
 * useChatEngine
 * -------------
 * Wraps the /api/chat streaming endpoint.
 *
 * Two entry points:
 *   - sendUserQuery(text): free-form chat. System prompt = chat prompt.
 *   - sendSuggestionClick(card): detailed-answer mode. Uses the detailed
 *     answer prompt and the full transcript as grounding.
 *
 * Both paths push a user message, open an assistant placeholder, and stream
 * tokens into the placeholder. The UI only has to render whatever is in the
 * store — the engine owns all the side-effects.
 */
export function useChatEngine() {
  const addUserMessage = useCopilotStore((s) => s.addUserMessage);
  const addAssistantPlaceholder = useCopilotStore((s) => s.addAssistantPlaceholder);
  const appendAssistantToken = useCopilotStore((s) => s.appendAssistantToken);
  const setAssistantContent = useCopilotStore((s) => s.setAssistantContent);
  const setError = useCopilotStore((s) => s.setError);

  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(
    async (opts: {
      system: string;
      messages: { role: "user" | "assistant"; content: string }[];
      assistantId: string;
      temperature?: number;
    }) => {
      const state = useCopilotStore.getState();
      if (!state.groqApiKey) {
        setAssistantContent(opts.assistantId, "⚠️ Paste your Groq API key in Settings.");
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Groq-Key": state.groqApiKey,
          },
          body: JSON.stringify({
            system: opts.system,
            messages: opts.messages,
            temperature: opts.temperature ?? 0.3,
          }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`chat ${res.status}: ${text.slice(0, 300)}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) appendAssistantToken(opts.assistantId, chunk);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = `⚠️ ${(err as Error).message}`;
        // If we already streamed some tokens, append the error; otherwise replace.
        const latest = useCopilotStore
          .getState()
          .chat.find((m) => m.id === opts.assistantId);
        if (latest && latest.content.length > 0) {
          appendAssistantToken(opts.assistantId, `\n\n${msg}`);
        } else {
          setAssistantContent(opts.assistantId, msg);
        }
        setError((err as Error).message);
      }
    },
    [appendAssistantToken, setAssistantContent, setError],
  );

  /** Free-form chat. The user typed `text` into the chat box. */
  const sendUserQuery = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      addUserMessage(trimmed);
      const assistantId = addAssistantPlaceholder();

      const state = useCopilotStore.getState();
      const fullTranscript = selectTranscriptText(state).slice(-state.chatContextChars);
      const system = buildChatSystemMessage(fullTranscript, state.chatPrompt);

      const history = state.chat
        .filter((m) => m.id !== assistantId) // don't send the empty placeholder
        .map((m) => ({ role: m.role, content: m.content }));

      await runStream({ system, messages: history, assistantId, temperature: 0.3 });
    },
    [addAssistantPlaceholder, addUserMessage, runStream],
  );

  /** Suggestion click → detailed long-form answer. */
  const sendSuggestionClick = useCallback(
    async (card: SuggestionCard): Promise<void> => {
      const stateBefore = useCopilotStore.getState();
      const history = stateBefore.chat.map((m) => ({ role: m.role, content: m.content }));
      const visibleUserText = `${card.title}\n\n${card.content}`;
      addUserMessage(visibleUserText, card.id);
      const assistantId = addAssistantPlaceholder();

      const state = useCopilotStore.getState();
      const fullTranscript = selectTranscriptText(state).slice(-state.detailedAnswerContextChars);
      const userPayload = buildDetailedAnswerUserMessage({
        fullTranscript,
        suggestionTitle: card.title,
        suggestionContent: card.content,
      });

      await runStream({
        system: state.detailedAnswerPrompt,
        messages: [...history, { role: "user", content: userPayload }],
        assistantId,
        temperature: 0.25,
      });
    },
    [addAssistantPlaceholder, addUserMessage, runStream],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { sendUserQuery, sendSuggestionClick, cancel };
}
