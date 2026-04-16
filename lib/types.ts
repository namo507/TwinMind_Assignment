/** Shared TypeScript interfaces. */

export type SuggestionType =
  | "QUESTION"
  | "TALKING_POINT"
  | "ANSWER"
  | "FACT_CHECK"
  | "CONTEXT";

export interface SuggestionCard {
  id: string;
  type: SuggestionType;
  title: string;
  content: string;
  relevance_score: number;
}

export interface SuggestionBatch {
  id: string;
  createdAt: number; // epoch ms
  contextChars: number;
  suggestions: SuggestionCard[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  // If the message was produced by clicking a suggestion, reference it for audit.
  sourceSuggestionId?: string;
}

export interface TranscriptLine {
  id: string;
  text: string;
  createdAt: number;
}
