/**
 * Thin wrappers around the Groq REST API.
 *
 * We don't use the `groq-sdk` package on purpose:
 *   1. This app has no server-side API key — the user pastes their own and it
 *      is forwarded per-request via the `X-Groq-Key` header. The SDK wants
 *      construction-time credentials.
 *   2. Raw `fetch` works on Edge runtime without extra polyfills.
 *   3. Fewer deps = smaller install = faster cold starts on Vercel.
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Models are fixed by the assignment — DO NOT parameterise these. */
export const GROQ_WHISPER_MODEL = "whisper-large-v3";
export const GROQ_LLM_MODEL = "openai/gpt-oss-120b";

export function getApiKeyFromHeaders(headers: Headers): string | null {
  return headers.get("x-groq-key") || headers.get("X-Groq-Key");
}

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqChatOpts {
  apiKey: string;
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  stream?: boolean;
  signal?: AbortSignal;
}

/** Low-level Groq chat.completions call. Returns the raw Response. */
export async function groqChatRaw(opts: GroqChatOpts): Promise<Response> {
  const body: Record<string, unknown> = {
    model: GROQ_LLM_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    stream: !!opts.stream,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  return fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
}

/** Non-streaming helper — returns the assistant text content. */
export async function groqChatComplete(opts: GroqChatOpts): Promise<string> {
  const res = await groqChatRaw({ ...opts, stream: false });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq chat error ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Groq Whisper transcription. Returns plain text. */
export async function groqTranscribe(opts: {
  apiKey: string;
  audioBlob: Blob;
  filename?: string;
  language?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const form = new FormData();
  form.append("file", opts.audioBlob, opts.filename ?? "audio.webm");
  form.append("model", GROQ_WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  if (opts.language) form.append("language", opts.language);
  // Slightly deterministic: no temperature drift between 30s chunks.
  form.append("temperature", "0");

  const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq transcribe error ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
