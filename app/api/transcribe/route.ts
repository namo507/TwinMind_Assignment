import { NextRequest, NextResponse } from "next/server";
import { GROQ_BASE_URL, GROQ_WHISPER_MODEL, getApiKeyFromHeaders } from "@/lib/groq";

// Node runtime (not Edge) because incoming FormData with audio blobs is
// handled more robustly here and we re-use the native FormData → fetch path.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = getApiKeyFromHeaders(req.headers);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing X-Groq-Key header. Paste your Groq API key in Settings." },
      { status: 401 },
    );
  }

  let file: Blob | null = null;
  let language: string | undefined;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }
    file = f;
    const lang = form.get("language");
    if (typeof lang === "string" && lang) language = lang;
  } catch (err) {
    return NextResponse.json(
      { error: `Bad form-data: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // Forward to Groq. We re-package the FormData to ensure the filename + model
  // are present regardless of what the client sent.
  const groqForm = new FormData();
  groqForm.append("file", file, "chunk.webm");
  groqForm.append("model", GROQ_WHISPER_MODEL);
  groqForm.append("response_format", "verbose_json");
  groqForm.append("temperature", "0");
  if (language) groqForm.append("language", language);

  try {
    const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
      // 25s upper bound — Whisper Large V3 transcribes a 30s chunk in < 1s in
      // practice on Groq, but we leave headroom for cold starts.
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Groq error ${res.status}: ${text.slice(0, 400)}` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { text?: string; language?: string; duration?: number };
    const transcribed = (data.text ?? "").trim();
    return NextResponse.json({
      text: transcribed,
      language: data.language,
      duration: data.duration,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Transcription failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
