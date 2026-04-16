# TwinMind Live Suggestions Assignment — Complete Working Guide

## Overview & What You're Building

The assignment requires a **three-column web app** that:
1. Captures microphone audio and produces a rolling transcript (left column)
2. Generates 3 contextual AI suggestions every ~30 seconds (middle column)
3. Provides a chat interface where clicking a suggestion yields a detailed answer (right column)

The evaluation priority, in order, is: **suggestion quality → chat answer quality → prompt engineering → full-stack engineering → code quality → latency → overall experience**. This means your biggest ROI is on crafting the best possible prompts, not pixel-perfect UI.[^1]

***

## Pre-Work (Do This First)

**Download and use TwinMind before writing a single line of code.** The assignment explicitly flags submissions from candidates who clearly haven't used the product. Specifically:[^1]
- Use it in at least two different meeting types (e.g., a 1:1 discussion vs. a technical deep-dive)
- Observe what suggestions feel useful vs. generic
- Notice the latency between speaking and suggestions appearing
- Note what context window feels right (recent 5 sentences vs. full transcript)

Also open the reference prototype at the provided Claude URL and click the mic. Build to that exact 3-column layout — do not deviate for creative exploration.[^1]

***

## Tech Stack Recommendation

| Layer | Recommended Choice | Rationale |
|---|---|---|
| Frontend Framework | Next.js 14+ (App Router) | Vercel deployment is trivial; API routes handle backend calls securely[^2] |
| Styling | Tailwind CSS + shadcn/ui | Fast, clean, readable — matches "code we'd want in our codebase"[^2] |
| Audio Capture | Browser `MediaRecorder` API | Native, no dependencies; use `timeslice` param to get chunks every ~30s[^3] |
| Transcription | Groq → `whisper-large-v3` | **Required by assignment**; runs at ~172x real-time speed[^4] |
| Suggestions & Chat | Groq → `openai/gpt-oss-120b` | **Required by assignment**; 120B MoE model, 131K context window[^5] |
| Hosting | Vercel | Free tier, instant Next.js deploys, no config needed[^2] |
| State Management | React `useState` / `useRef` | No external store needed for a session-scoped, no-persistence app |

The model IDs you must use are exactly `whisper-large-v3` for transcription and `openai/gpt-oss-120b` for suggestions and chat. The GPT-OSS 120B model uses a Mixture-of-Experts architecture with 120B total parameters and supports the Harmony chat format with System > Developer > User > Assistant role hierarchy.[^6][^7]

***

## Project Structure

```
twinmind-live/
├── app/
│   ├── page.tsx                  # Main 3-column layout
│   ├── api/
│   │   ├── transcribe/route.ts   # POST: audio blob → Groq Whisper
│   │   ├── suggestions/route.ts  # POST: transcript text → 3 suggestions
│   │   └── chat/route.ts         # POST: suggestion + transcript → detailed answer
├── components/
│   ├── TranscriptPanel.tsx       # Left column
│   ├── SuggestionsPanel.tsx      # Middle column
│   ├── ChatPanel.tsx             # Right column
│   └── SettingsModal.tsx         # Prompt editor + API key input
├── lib/
│   ├── groq.ts                   # Groq client factory (uses runtime API key)
│   └── types.ts                  # Shared TypeScript interfaces
├── hooks/
│   └── useAudioRecorder.ts       # MediaRecorder logic + 30s chunking
└── README.md
```

***

## Implementation Phases

### Phase 1 — Core Infrastructure (Day 1–2)

**API Key & Settings Screen**

The settings screen must store the Groq API key in `localStorage` (not hardcoded anywhere). Build a `SettingsModal` component with editable fields for:[^1]
- Groq API key
- Live suggestion system prompt (default pre-filled)
- Detailed answer prompt (default pre-filled)
- Chat system prompt (default pre-filled)
- Context window for suggestions (default: last N characters of transcript)
- Context window for expanded answers (default: full transcript)

Pass the API key from localStorage to your API routes via request headers — never expose it in client-side code that calls Groq directly (use Next.js API routes as a proxy).

**Audio Capture + Chunking**

Use the `MediaRecorder` API with the `timeslice` parameter set to 30000ms (30 seconds). This fires `ondataavailable` every 30 seconds with a Blob you can POST directly to your transcription route.[^3]

```typescript
// hooks/useAudioRecorder.ts
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
});
mediaRecorder.start(30000); // fires ondataavailable every 30s

mediaRecorder.ondataavailable = async (e) => {
  if (e.data.size > 0) {
    await sendChunkForTranscription(e.data);
  }
};
```

**Transcription Route**

Accept the audio Blob, convert it to a File object, and send it to Groq:[^7]

```typescript
// app/api/transcribe/route.ts
const transcription = await groq.audio.transcriptions.create({
  file: audioFile,
  model: 'whisper-large-v3',
  response_format: 'text',
  language: 'en',
  temperature: 0.0,
});
```

### Phase 2 — Live Suggestions (Day 3–4)

This is the **most important phase** — it's what the evaluators weight most heavily.[^1]

**Suggestion Trigger Logic**

After each transcription chunk appends to the transcript, automatically call the suggestions API. Also expose a manual refresh button that calls it on demand.[^1]

**Suggestion Prompt Engineering**

The suggestion prompt is the core differentiator. Here is a high-quality default system prompt to hardcode as your starting point — tune this based on your TwinMind research:

```
You are a real-time meeting copilot. You receive a live transcript and must surface exactly 3 suggestions that would be most useful to the participant RIGHT NOW.

Each suggestion must be one of these types (mix them based on context):
- QUESTION: A clarifying or probing question the user could ask
- TALKING_POINT: A relevant fact, counterpoint, or angle to raise
- ANSWER: A direct answer to a question just asked in the transcript
- FACT_CHECK: A flag on a dubious or imprecise claim just made
- CONTEXT: Background info that makes the current topic clearer

Rules:
1. Read the MOST RECENT transcript segment most carefully — weight recency heavily.
2. Each card preview (1-2 sentences) must deliver standalone value even if not clicked.
3. Vary suggestion types — never return 3 of the same type.
4. Be specific to the content, not generic ("Good question to consider" is not acceptable).
5. Return ONLY valid JSON: {"suggestions": [{"type": "...", "preview": "...", "detail_query": "..."}]}
```

**Context Window Strategy**

Pass the last ~2000 characters of transcript as the primary context, plus a brief summary of the oldest content if the conversation is long. This balances recency with coherence. The `detail_query` field in your JSON output becomes the text sent to the chat route when a card is clicked.[^8]

**Structured Output**

Use `response_format: { type: "json_schema" }` to guarantee the 3-suggestion JSON structure. The GPT-OSS 120B model supports structured outputs with `strict: false` — add a retry loop for validation failures.[^9]

### Phase 3 — Chat Panel (Day 5)

**Click-to-Chat Flow**

When a suggestion card is clicked:[^1]
1. Add the suggestion preview as a "user" message in the chat panel
2. POST to `/api/chat` with the `detail_query` + **full transcript as context**
3. Stream the response back using the Groq SDK's streaming API
4. Append the streamed response token-by-token for low perceived latency

**Chat System Prompt**

```
You are a knowledgeable meeting assistant. The user is in a live meeting.
Below is the full transcript of the conversation so far.

TRANSCRIPT:
{{full_transcript}}

Answer the user's query thoroughly. Use facts, data, and examples where relevant.
Format your response clearly with markdown when appropriate.
```

**Direct User Questions**

The text input in the chat panel sends the same way as a clicked suggestion — just without the pre-filled suggestion text.[^1]

### Phase 4 — Export + Polish (Day 6–7)

**Export Function**

Build a single export button that assembles:[^1]

```typescript
const exportData = {
  session_id: uuid,
  exported_at: new Date().toISOString(),
  transcript: transcriptLines, // [{timestamp, text}]
  suggestion_batches: batches, // [{timestamp, suggestions: [...]}]
  chat_history: messages,      // [{timestamp, role, content}]
};
```

Offer both JSON and plain text (concatenated) formats. This export file is what the evaluators use to grade your submission — make it clean and well-structured.

**Error Handling Checklist**
- Groq API key missing → redirect to settings with an instructive toast
- Microphone permission denied → clear browser-native error message
- Transcription API failure → retry once, then show error in transcript with timestamp
- Suggestion API failure → show a "Refresh failed, tap to retry" state on the suggestion panel
- Chat timeout → display partial streamed content with an error indicator

***

## Prompt Engineering Deep Dive

This is judged as item #3 in the evaluation but underlies items #1 and #2. The key decisions to make and be ready to defend:[^1]

### Context Window Decision
- **Suggestion prompt**: Use last 1500–2500 characters (roughly 3–5 minutes of speech). More context dilutes recency; less misses topic shifts.
- **Chat prompt**: Pass the full transcript — longer context means better answers to specific questions. The GPT-OSS 120B supports up to 131K tokens.[^5]

### Type-Mixing Logic
The assignment says: "You decide what makes sense when. Showing the right mix of suggestions at the right time based on context is what we will be judging."[^1]

Implement a soft rule in your prompt:
- If a direct question was just asked → at least one ANSWER card
- If a controversial or specific claim was made → at least one FACT_CHECK card
- If the conversation is early/exploratory → lean toward QUESTION cards
- If the conversation is deep on a specific topic → lean toward TALKING_POINT and CONTEXT

### Preview Quality
"The preview alone should already deliver value even if not clicked." This means your prompt must explicitly demand that previews are substantive (e.g., "the preview must include a concrete fact, number, or actionable phrase — not a teaser or vague prompt").[^1]

### Structured Output & Stability
Use JSON mode with a defined schema. Hardcode fallback suggestions ("Unable to generate suggestions for this segment. Tap refresh to try again.") for when the model call fails, so the UI never shows raw JSON errors.[^9]

***

## Settings Panel — Recommended Defaults to Hardcode

| Setting | Default Value |
|---|---|
| Suggestion context window | Last 2000 characters of transcript |
| Chat context window | Full transcript (truncated to 80K chars if very long) |
| Suggestions refresh interval | 30 seconds |
| Max suggestion preview length | 120 characters |
| Chat response stream | Enabled |
| Temperature (suggestions) | 0.4 |
| Temperature (chat) | 0.6 |

***

## Latency Optimization

Latency is evaluation criterion #6. Groq runs Whisper large-v3 at approximately 172x real-time speed, so transcription itself is fast. The bottleneck is the suggestion LLM call. To minimize perceived latency:[^4][^1]

- **Stream suggestion text** where possible so cards start populating within ~500ms of the API call
- **Optimistic UI**: Show a skeleton/loading state for the 3 cards immediately on refresh trigger
- **Don't block transcript on suggestions**: Append transcript text as soon as the Whisper call returns, fire the suggestion call in the background
- **Chat streaming**: Start rendering the chat response token-by-token; do not wait for the full response

A well-implemented Groq call for suggestions should return the first token in under 300ms given Groq's inference speed.[^4]

***

## README Requirements

The assignment says "We will read the code" and specifically calls out the README. It must cover:[^1]

1. **Setup**: `npm install`, environment variables (only `GROQ_API_KEY` placeholder), `npm run dev`
2. **Stack choices**: Why Next.js, why Vercel, why Tailwind — keep it concise but reasoned
3. **Prompt strategy**: Document your reasoning for the suggestion prompt design, context window sizes, and type-mixing logic — this is your written defense for the interview
4. **Tradeoffs**: What you chose NOT to do and why (e.g., no WebSocket streaming for audio, no session persistence, no auth)
5. **Known limitations**: Brief and honest (e.g., Whisper hallucination on silence, 30s lag is an inherent architectural constraint)

***

## Deployment Checklist (Day 8–9)

- [ ] Vercel project created and connected to GitHub repo
- [ ] No API keys in code — confirm with `git grep GROQ_API_KEY`
- [ ] Settings screen works end-to-end: paste key → mic → suggestions → chat
- [ ] Export button produces a valid, readable JSON file
- [ ] All three columns visible and functional on a laptop screen without horizontal scroll
- [ ] Error states tested: wrong API key, mic denied, rapid refresh clicks
- [ ] Live URL tested in Chrome and Safari (MediaRecorder codec support differs)[^10]
- [ ] README complete with all four required sections

***

## Interview Preparation

During the interview you will share your screen and demo the deployed app live. Prepare to answer:[^1]

- **"Why did you choose this context window size?"** → Have data: test the same conversation with 500, 1500, and 3000 char windows; note which produced the most relevant suggestions.
- **"Walk me through your suggestion prompt."** → Explain each instruction in the prompt and why it's there.
- **"What would you change if you had more time?"** → Streaming Whisper transcription (vs. 30s chunks) for lower latency; intent detection to auto-classify meeting type; a feedback thumbs-up/down on cards to refine suggestion quality.
- **"What makes your suggestions better than TwinMind's default?"** → Be specific about what you observed in the TwinMind app and what concrete prompt changes address those gaps.

***

## 10-Day Timeline

| Days | Focus |
|---|---|
| Day 1 | Use TwinMind, study prototype, scaffold Next.js project, Settings + API key flow |
| Day 2 | Audio capture with MediaRecorder, Groq Whisper integration, transcript display |
| Day 3–4 | Suggestion prompt design, suggestions API route, card UI, auto-refresh + manual refresh |
| Day 5 | Chat panel, click-to-chat flow, streaming responses, direct user input |
| Day 6 | Export button, error handling, edge cases |
| Day 7 | Prompt tuning (run real conversations, iterate on suggestion quality) |
| Day 8 | Vercel deployment, end-to-end testing on deployed URL |
| Day 9 | README, code cleanup, remove dead code, final polish |
| Day 10 | Buffer / final review — submit deployed URL + GitHub link |

---

## References

1. [TwinMind-Live-Suggestions-Assignment-April-2026.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/32550137/00634933-690e-41a9-a2d5-dadd3e43dfec/TwinMind-Live-Suggestions-Assignment-April-2026.md?AWSAccessKeyId=ASIA2F3EMEYER6LKBHCO&Signature=AWEgKfhGMK8T6S7stTmBm1DXwBs%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEPv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJIMEYCIQCkusctuMvX3fAuDZYt9GGkGC5n0bMzkcAXJj3lG%2B4jdAIhALqc3N1VmUbLw6wSiTk2RylP6%2FAVJaZaeFM9DlAFhwssKvwECMT%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQARoMNjk5NzUzMzA5NzA1IgybquxhmLQTqO7q%2Fw0q0AQplA2gtp5YZdkNNlo2urPeYKvdUgq%2BPZaaP4JFCPAu2kT7RWSmBkGPkwG32HNVdQFdlU7uCFWCvOciBcE4NGchZwGiI6DDqwUSGe7pfllfpFcAgBM6%2FlK1EFtYYykZ5j0MQxVjSWDDavMXpDbgRFLNuFWDLQmOpxL5AeMosfwlXC0x%2FklP1tHrjPX9vr1T3Ar5kxyYYpbpVojobtm4DB5S9cA%2BXUXoaqUhZWRTK9C8TaxeQudgR48bZhzSWyTsmF%2BrufwYyCqlxfdIQ5q6CnRX5lSzkLSodZSDfPwUEBxN9fwyT97MKCm%2FFTF%2BlWDRO2xxaDSPDo7HFaf2V9nKIgeXfzSCjnuMrwgQLZdtu5tM1bcHXLyRWuTCOdG%2BsHLoQVICSRRO3Y3CsuQMo8CVZBNYw%2Bq9Y3v3JpsgsO7JbxKdK76tvA44NtXtf9ZERPePsMUkLhYvtbGK0LkT0tn%2Ft1tvx%2Fq%2Ft5UuPKxeCeY8KBpxqfX2IiFAeQuViCiceazQLQfQ24wy3KY8FEtl7KqAiB%2B1OmvJCFd1FqLG4Z8Cux6rw%2BARflB4dM5MiPMZ2PHblNSJsCFqW7JtrXHft52LbWH%2F9P%2FQETIByNIdLJkHNq1AdVSvwCQ20dkRb2J3F2PQvzeNcfbfDaYFXFg63QFWpr1IeZBSWTFV9JmD80Pd6S%2BsG%2B%2BhTSS10%2Fe%2BcuJ4f6mlZWf8CNz6bi5GaohrjolBdkeGiCsb7Aw%2F9ffoxYRdLVUtq7g%2Br9MeiI21yzFHtc%2F0POPboGe7ij2g6uE53BZXAbWKMKvghM8GOpcBpqAmqlyfi6TYBjS%2FZpzyqZJhpPuRGlzQ%2F8VFPIglicAXIv%2FZ9YN5PgDmziIar9npOs1XqLtbBErpzPmnGNAwoJa2WQfXL4khri0PI8IANE6bS04G5dvxNqkBw8a7Ka3eOTgj2NQwpxvrsThPqLarB%2Fg%2FKEj77VfdOeafkaBoPeLmYcMdw2xae7lCxpaXRYhnQrK%2FefUlnA%3D%3D&Expires=1776369150) - # **TwinMind \- Live Suggestions Assignment**

## **About TwinMind**

TwinMind is an always-on AI me...

2. [Seeking Advice on the Best Tech Stack : r/nextjs - Reddit](https://www.reddit.com/r/nextjs/comments/1irsbwd/seeking_advice_on_the_best_tech_stack/) - The most suitable stack should start with nextjs with clerk auth, drizzle or prisma ORM, shadcn plus...

3. [[AskJS] Audio Recorder as chunks : r/javascript - Reddit](https://www.reddit.com/r/javascript/comments/1d7nime/askjs_audio_recorder_as_chunks/) - I want to make an audio recorder that sends the recorded data as chunks you not the whole file toget...

4. [Switching to Groq Whisper Large V3 for Cost-Effective and Faster ...](https://github.com/savbell/whisper-writer/discussions/57) - Speed: Groq's model operates at approximately 172 times real-time speed, ensuring faster transcripti...

5. [Connect and use GPT OSS 120B from Groq with API Key - TypingMind](https://www.typingmind.com/guide/groq/openai-gpt-oss-120b) - Select GPT OSS 120B from the model dropdown menu; Start typing your message in the chat input; Enjoy...

6. [OpenAI GPT-OSS 120B - GroqDocs - Groq Console](https://console.groq.com/docs/model/openai/gpt-oss-120b) - Leverage the Harmony chat format with proper role hierarchy (System > Developer > User > Assistant) ...

7. [API Reference - GroqDocs - Groq Console](https://console.groq.com/docs/api-reference) - Comprehensive reference documentation for the Groq API, including endpoints, parameters, and example...

8. [LLM Prompt Best Practices for Large Context Windows - Winder.AI](https://winder.ai/llm-prompt-best-practices-large-context-windows/) - In this article we'll explore the side effects of large context windows, examining how they reshape ...

9. [Structured Outputs - GroqDocs - Groq Console](https://console.groq.com/docs/structured-outputs) - Model support, Limited (GPT-OSS 20B, 120B), All Structured Outputs models ; When to use, Production ...

10. [Speech recognition assisted by large language models to command software orally -- Application to an augmented and virtual reality web app for immersive molecular graphics](https://www.semanticscholar.org/paper/6cb665650f2b1154b5a0df394821fbfd0677de09) - This project successfully developed, evaluated and integrated a Voice User Interface (VUI) into a we...

