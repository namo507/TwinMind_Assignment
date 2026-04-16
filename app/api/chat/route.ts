import { NextRequest } from "next/server";
import { GROQ_BASE_URL, GROQ_LLM_MODEL, getApiKeyFromHeaders } from "@/lib/groq";

/**
 * POST /api/chat
 *
 * Streams a gpt-oss-120b completion as plain text (one token/fragment per
 * chunk). The client appends each chunk to the active assistant message in the
 * Zustand store, producing a typing effect with first-token latency bounded by
 * Groq's TTFT (~150-400ms in practice).
 *
 * Edge runtime is intentional: the body is short JSON, the response is a
 * streamed text/plain body, and Edge gives the lowest TTFB on Vercel.
 *
 * Body shape:
 *   { system: string, messages: {role, content}[] }
 *   - `system` is the pre-composed system string (the caller decides whether
 *     to inline the full transcript or a window; see lib/prompts.ts).
 *   - `messages` is the running chat history (user/assistant turns only).
 */

export const runtime = "edge";
export const maxDuration = 60;

interface ChatRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
}

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = getApiKeyFromHeaders(req.headers);
  if (!apiKey) {
    return new Response("Missing X-Groq-Key header", { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.system || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response("Missing system or messages", { status: 400 });
  }

  const payload = {
    model: GROQ_LLM_MODEL,
    stream: true,
    temperature: body.temperature ?? 0.3,
    messages: [
      { role: "system", content: body.system },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  const upstream = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(`Groq error ${upstream.status}: ${text.slice(0, 400)}`, {
      status: upstream.status || 502,
    });
  }

  // Transform Groq's SSE stream into a plain text stream. Each SSE "data: {...}"
  // line carries a chat completion delta; we extract .choices[0].delta.content
  // and forward just that text.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buf = "";
      try {
        // Keep-alive guard: if nothing arrives for 30s, close cleanly.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // Process complete SSE events (separated by double-newlines).
          let sep = buf.indexOf("\n\n");
          while (sep !== -1) {
            const event = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            sep = buf.indexOf("\n\n");
            for (const rawLine of event.split("\n")) {
              const line = rawLine.trim();
              if (!line || !line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(payload) as {
                  choices?: { delta?: { content?: string } }[];
                };
                const token = json.choices?.[0]?.delta?.content ?? "";
                if (token) controller.enqueue(encoder.encode(token));
              } catch {
                // Non-JSON keepalive line — ignore.
              }
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
