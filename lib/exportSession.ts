import type { ChatMessage, SuggestionBatch, TranscriptLine } from "./types";

export interface SessionExport {
  metadata: {
    exportedAt: string;
    application: "TwinMind Live Suggestions";
    transcriptCharCount: number;
    batchCount: number;
    chatMessageCount: number;
  };
  transcript: TranscriptLine[];
  transcriptText: string;
  suggestionBatches: SuggestionBatch[];
  chat: ChatMessage[];
}

export function buildSessionExport(state: {
  transcript: TranscriptLine[];
  suggestionBatches: SuggestionBatch[];
  chat: ChatMessage[];
}): SessionExport {
  const transcriptText = state.transcript.map((l) => l.text).join(" ");
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      application: "TwinMind Live Suggestions",
      transcriptCharCount: transcriptText.length,
      batchCount: state.suggestionBatches.length,
      chatMessageCount: state.chat.length,
    },
    transcript: state.transcript,
    transcriptText,
    suggestionBatches: state.suggestionBatches,
    chat: state.chat,
  };
}

export function downloadJson(payload: unknown, filename: string): void {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
