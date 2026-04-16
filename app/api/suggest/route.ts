import { NextRequest, NextResponse } from "next/server";
import { groqChatComplete, getApiKeyFromHeaders } from "@/lib/groq";
import { buildSuggestionUserMessage } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SuggestRequest {
  transcriptWindow: string;
  previousTitles?: string[];
  systemPrompt: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = getApiKeyFromHeaders(req.headers);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Groq-Key header." }, { status: 401 });
  }

  let body: SuggestRequest;
  try {
    body = (await req.json()) as SuggestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { transcriptWindow = "", previousTitles = [], systemPrompt } = body;
  if (!systemPrompt) {
    return NextResponse.json({ error: "Missing systemPrompt." }, { status: 400 });
  }

  const userMessage = buildSuggestionUserMessage({
    transcriptWindow,
    previousTitles: previousTitles.slice(0, 12),
  });

  try {
    // JSON mode is the contract enforcer. temperature 0.4 keeps outputs
    // varied enough to not feel robotic across successive 30s batches while
    // staying deterministic enough to keep the schema intact.
    const content = await groqChatComplete({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 900,
      jsonMode: true,
      signal: AbortSignal.timeout(25_000),
    });

    // Defensive parse: JSON mode guarantees syntactic validity, NOT schema.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return NextResponse.json(
        { error: `Model returned non-JSON: ${(err as Error).message}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ raw: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: `Suggestion generation failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
