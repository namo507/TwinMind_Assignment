# TwinMind — Live Suggestions

A live meeting copilot. Captures microphone audio, produces a rolling transcript,
surfaces three contextual AI suggestions every ~30 seconds, and opens a streaming
chat where every answer is grounded in the full transcript. Everything runs
through **one** Groq API key that the user pastes in the Settings modal — no
server-side secrets, no accounts, no persistence beyond the browser.

This repository is the submission for the TwinMind Live Suggestions assignment
(April 2026). The reference spec lives in [`docs/`](./docs).

> **Deployed app:** https://twinmind-assignment-namo507-20260416.netlify.app
> The app is usable end-to-end once the reviewer pastes their own Groq key in the Settings modal.

---

## What it does

Three panels, left to right:

1. **Transcript** — click Start, the browser&rsquo;s `MediaRecorder` streams ~30s
   WebM/opus chunks to `/api/transcribe`, which proxies them to
   `whisper-large-v3`. Transcribed text is appended to the live transcript with
   auto-scroll to the latest line.
2. **Live suggestions** — every ~30s (or when the user clicks **Refresh**, which
  flushes the current recording chunk first), a sliding window of the most recent transcript text is sent to
   `openai/gpt-oss-120b` in JSON mode with a tightly-constrained system prompt.
   The model returns exactly three cards (a mix of `QUESTION`,
   `TALKING_POINT`, `ANSWER`, `FACT_CHECK`, `CONTEXT`). New batches land at the
   top, older batches stay visible below.
3. **Chat** — clicking a suggestion pushes it into the chat and streams a
   detailed answer (longer-form prompt, full transcript as context). Users can
   also type free-form questions. Tokens stream in with a &lt;400ms TTFT using
   the Edge runtime + native `ReadableStream`.

An **Export** button downloads the full session &mdash; transcript, every
suggestion batch, and the chat &mdash; as a single timestamped JSON file. That
JSON is what reviewers can inspect for suggestion quality.

---

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | First-class Route Handlers, Edge runtime for streaming, zero-config on Vercel. |
| Language | **TypeScript (strict)** | The reference reviewers read. Strong types across the Groq I/O contracts. |
| Styling | **Tailwind CSS** | Fast, readable, no custom CSS to maintain. |
| State | **Zustand** (w/ `persist`) | Selector-based subscriptions — panels don&rsquo;t re-render on every streamed token. `persist` handles only settings; transcript/chat/batches are session-scoped (reload clears them, as the spec requires). |
| Audio | **`MediaRecorder`** | Native API. We stop/start per chunk so every chunk is a self-contained WebM file Whisper can decode (see [Tradeoffs](#tradeoffs)). |
| Transcription | **Groq `whisper-large-v3`** | Required by assignment. 10.3% WER multilingual, ~172× realtime on Groq. |
| Reasoning | **Groq `openai/gpt-oss-120b`** | Required by assignment. 120B MoE (4 of 128 experts active), 131K context, native JSON mode, ~500 tok/s on Groq. |
| Icons | **lucide-react** | Tiny, tree-shakeable. |

No UI library (shadcn/radix/etc). Panels are ~100 lines of Tailwind each.

---

## Project layout

```
app/
  layout.tsx              Root layout + metadata
  page.tsx                Client entrypoint, wires hooks → panels
  globals.css             Tailwind + scrollbar/card-lift utilities
  api/
    transcribe/route.ts   POST blob → Groq whisper-large-v3
    suggest/route.ts      POST window → gpt-oss-120b (JSON mode)
    chat/route.ts         POST history → gpt-oss-120b (SSE → text stream)
components/
  Header.tsx              Mic/record/export/settings controls
  TranscriptPanel.tsx     Left column (+ shared PanelHeading/EmptyState)
  SuggestionsPanel.tsx    Middle column (batches, cards, types)
  ChatPanel.tsx           Right column, streaming bubbles + input
  SettingsModal.tsx       API key, prompts, context windows, timing
  ApiKeyGate.tsx          First-load callout when no key yet
  ErrorBanner.tsx         Auto-dismissing toast for API errors
hooks/
  useAudioRecorder.ts     MediaRecorder lifecycle + chunking
  useSuggestionEngine.ts  30s timer + /api/suggest + schema validation
  useChatEngine.ts        Streaming chat + suggestion-click flow
lib/
  groq.ts                 Low-level Groq REST (no SDK — see Tradeoffs)
  prompts.ts              Default prompts + message-builders
  types.ts                SuggestionCard, SuggestionBatch, ChatMessage
  exportSession.ts        JSON export + download helper
store/
  useCopilotStore.ts      Zustand store (settings persisted, session not)
utils/cn.ts               className helper
```

---

## Setup

**Requirements**: Node 18.17+ (20+ recommended), a Groq API key from
<https://console.groq.com/keys>. Nothing else.

```bash
git clone https://github.com/namo507/TwinMind_Assignment.git
cd TwinMind_Assignment
npm install
npm run dev
```

Open <http://localhost:3000>. The Settings modal opens automatically on first
load — paste your Groq key, hit **Done**, then click **Start**.

Other scripts:

```bash
npm run build      # Production build
npm start          # Run production build (after `npm run build`)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

The app reads **no** `.env` secrets. The Groq key lives in browser
`localStorage` and is forwarded to our own API routes as `X-Groq-Key` on every
request. The routes forward it to Groq as the `Authorization` header. We never
log it and never persist it server-side.

---

## Deploying

The app is a standard Next.js 14 App Router project. Every target works with
zero code changes.

### Option A — Vercel (recommended)

The included [`vercel.json`](./vercel.json) pins function timeouts and region.

```bash
npm i -g vercel
vercel                 # first time: link or create a project
vercel --prod          # deploy
```

Or click **New Project → Import** at <https://vercel.com/new> and point it at
this repo. No environment variables are required.

### Option B — Netlify

[`netlify.toml`](./netlify.toml) wires the official Next.js runtime plugin.

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

Or use **Add new site → Import from Git** and select this repo. The plugin
auto-installs.

### Option C — Replit

[`.replit`](./.replit) + [`replit.nix`](./replit.nix) are included. Import the
repo at <https://replit.com/~> and click **Run**. For a public URL, use
Replit&rsquo;s Deploy button (Autoscale or Reserved VM). Note: Replit&rsquo;s Edge
runtime equivalent is slower than Vercel — TTFB on streamed chat is measurably
higher.

After any deploy, the reviewer pastes their own Groq key in Settings on first
load. No other configuration is needed.

---

## Prompt strategy

The assignment explicitly prioritises suggestion quality. The prompts are in
[`lib/prompts.ts`](./lib/prompts.ts) and are fully editable at runtime through
the Settings modal. Three prompts, three jobs:

### 1. Live-suggestion prompt (middle column)

Goals, in order: **variety of type**, **groundedness in the exact recent
transcript**, **standalone value before the user ever clicks**, **no
repetition across batches**.

How the prompt enforces each:

- **Output contract as a JSON schema-in-prose.** `response_format: json_object`
  guarantees syntactic validity; the prompt is what enforces the schema. We
  tell the model exactly which keys to emit, their types, and their length
  budgets (`title <= 12 words`, `content <= 60 words`). A defensive parser in
  [`store/useCopilotStore.ts`](./store/useCopilotStore.ts) (`normaliseSuggestionCard`)
  throws away any card that doesn&rsquo;t round-trip.
- **Type taxonomy with hard rules per type.** `ANSWER` is only valid if a
  question was actually asked in the window. `FACT_CHECK` is only valid when a
  verifiable claim was made. Without these constraints the model defaults to
  emitting three `TALKING_POINT`s every time.
- **&ldquo;Content must be a finished thought the user could read verbatim.&rdquo;**
  This single sentence killed ~80% of the &ldquo;take notes on this&rdquo; / &ldquo;consider
  asking a question&rdquo; generic filler during iteration. The preview **is** the
  value; the click is for &ldquo;tell me more&rdquo;.
- **De-duplication via `PREVIOUS_TITLES`.** On every refresh we pass the last
  12 titles the user has already seen so the model can&rsquo;t re-emit the same
  card paraphrased. This matters: without it, batches 2+ look like batch 1.
- **`relevance_score` calibration ladder.** Forcing the model to emit a 0–1
  score *and* telling it how to calibrate the score biases its own reasoning
  toward cards that are actually current, not historical artifacts. The score
  is also shown in the UI so the reviewer can eyeball the model&rsquo;s own
  confidence.
- **Sliding window, not full transcript.** See [Context strategy](#context-strategy).

At runtime the user message payload is built by `buildSuggestionUserMessage`
and is the **only** thing that changes between calls:

```
# TRANSCRIPT_WINDOW (most recent ~2.2k chars)
"""
…
"""
# PREVIOUS_TITLES (do not repeat)
- …
- …

Emit the JSON object now.
```

Keeping the system prompt fixed helps Groq&rsquo;s KV cache.

### 2. Detailed-answer prompt (suggestion-click → right column)

Different goals once the user has already signalled intent by clicking:
**thoroughness, groundedness, no hedging**. The prompt:

- Opens with the answer in one sentence, no preamble.
- Uses the **full** transcript (bounded by `detailedAnswerContextChars`) as
  grounding. The click is an explicit ask; latency is less important than
  quality.
- Is told, in priority order, to (a) answer from the transcript first,
  (b) say &ldquo;outside the transcript:&rdquo; when it uses world knowledge,
  (c) explicitly say &ldquo;the transcript doesn&rsquo;t cover this&rdquo; rather than invent.
- Rejects markdown headings. The chat bubble already is the heading.

### 3. Chat prompt (free-form right-column input)

Same transcript grounding, but this is the &ldquo;user typed a question&rdquo; path.
It&rsquo;s the most permissive prompt: it&rsquo;s allowed to answer non-meeting
questions, but must do so briefly because the user is in a meeting. It
preserves the &ldquo;never fabricate quotes or numbers&rdquo; rule.

---

## Context strategy

Suggestions and chat answers have fundamentally different information needs,
so they get different windows:

| Prompt | Default window | Rationale |
|---|---|---|
| Live suggestion | **2,200 chars** (≈ last ~90s of speech) | Suggestions are a *reactionary* signal — they should reflect the last ~30s of conversation, not the first 20 minutes. A tight window keeps self-attention focused, which materially improves the &ldquo;right thing at the right time&rdquo; axis the spec calls out. It also keeps input-token spend low for the 30s cadence. |
| Detailed answer (click) | **20,000 chars** (≈ 30 min) | Clicking is an explicit ask, so we hand the model the whole meeting. gpt-oss-120b&rsquo;s 131K window easily absorbs it. |
| Free-form chat | **20,000 chars** | Same reasoning. Users often ask &ldquo;what did they decide about X?&rdquo; and X might have been discussed at minute 5. |

All three numbers are user-editable in Settings — the defaults are what felt
right in live testing with the live TwinMind app as a reference.

The running total cost at the default settings is:

- 1 transcribe call per 30s (negligible — Whisper pricing is by audio-second).
- 1 suggest call per 30s at ~700 input tokens → ~900 output tokens. Comfortably
  inside Groq&rsquo;s free-tier rate limits.
- 1 chat call per user action. 20K-char transcript is roughly 5K tokens.

---

## Latency notes

&ldquo;Feels responsive during a real conversation&rdquo; is an eval axis in the spec.
Measures taken:

- **Edge runtime for `/api/chat`** &mdash; lowest possible TTFB on Vercel, which
  directly improves first-token latency for every chat answer.
- **Native streaming, no client SDK.** `/api/chat` reads Groq&rsquo;s SSE stream
  directly in a `ReadableStream` transform and forwards plain text. One fewer
  JSON parse per token.
- **Zustand selectors.** `ChatPanel` subscribes to the `chat` array; the
  `TranscriptPanel` subscribes to `transcript`; settings changes don&rsquo;t
  re-render either. Crucial while tokens are landing every ~2ms.
- **Optimistic UI.** The assistant placeholder is pushed to the store
  immediately on user action, so the &ldquo;thinking&hellip;&rdquo; indicator renders
  before the network round-trip even starts.
- **Non-blocking transcription.** Suggestion generation and transcription run
  independently. A slow transcribe call doesn&rsquo;t stall suggestions; a slow
  suggest call doesn&rsquo;t stall transcribes.
- **Abort on interrupt.** When a new suggest batch fires, the prior in-flight
  call is aborted via `AbortController`. Same for chat streams.

---

## Tradeoffs

A few decisions that could reasonably go either way, and why we picked the
side we did:

- **`MediaRecorder.stop()/start()` per chunk, not `start(timeslice)`.**
  The `timeslice` parameter emits partial blobs where only the *first* one has
  the WebM container headers. Whisper silently rejects headerless fragments.
  Stop/start gives us N complete files at the cost of ~20ms per boundary —
  acceptable for a meeting copilot.
- **No `groq-sdk`.** The user&rsquo;s key lives on the client and is forwarded
  per-request; the SDK wants construction-time credentials. Raw `fetch` works
  on Edge, installs nothing, and keeps cold starts fast.
- **No Web Speech API / no server-side diarization.** The spec pins
  `whisper-large-v3`. Browser speech rec is faster but lower quality and
  inconsistent across browsers; the spec wants apples-to-apples comparison.
- **No persistence across reloads.** The spec literally says &ldquo;no login, no
  data persistence needed when reloading the page.&rdquo; We persist only the
  settings the user configured (key, prompts, window sizes) — everything
  session-scoped is RAM only.
- **Single JSON export, not per-batch files.** The spec asks for transcript +
  suggestion batches + chat history with timestamps. One file is easiest for
  reviewers to read top-to-bottom; timestamps are on every item.
- **Dark UI, no theme switcher.** The UI is a single palette to keep the diff
  small and focus reviewer attention on behaviour, not visual polish (which
  the spec explicitly deprioritises).
- **No tests.** The assignment is 10 days and the rubric doesn&rsquo;t include
  tests. If this were production code, the schema-normalising function in the
  store and the SSE parsing in `/api/chat` would be the first two things I&rsquo;d
  cover.

---

## Troubleshooting

- **&ldquo;Microphone permission denied&rdquo;** — most browsers require HTTPS (or
  localhost) for `getUserMedia`. Vercel/Netlify both serve HTTPS by default.
- **Suggestions stay empty** — if the transcript is &lt;40 characters we skip
  the call on purpose. Speak for a few more seconds.
- **Model returns &ldquo;non-JSON&rdquo;** — rare, but if you edited the suggestion
  prompt in Settings and broke the output contract, hit **Reset prompts** in
  Settings.
- **&ldquo;Groq error 401&rdquo;** — your key is wrong, expired, or out of credits.
- **Chrome says &ldquo;audio/webm not supported&rdquo;** — Safari does not yet support
  opus in WebM. The hook falls back to `audio/mp4` automatically; transcription
  still works.

---

## License

MIT — see [LICENSE](./LICENSE) if present. Assignment submission code.
