"use client";

import { useEffect, useState } from "react";
import { X, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useCopilotStore } from "@/store/useCopilotStore";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const groqApiKey = useCopilotStore((s) => s.groqApiKey);
  const setGroqApiKey = useCopilotStore((s) => s.setGroqApiKey);

  const suggestionPrompt = useCopilotStore((s) => s.suggestionPrompt);
  const setSuggestionPrompt = useCopilotStore((s) => s.setSuggestionPrompt);
  const detailedAnswerPrompt = useCopilotStore((s) => s.detailedAnswerPrompt);
  const setDetailedAnswerPrompt = useCopilotStore((s) => s.setDetailedAnswerPrompt);
  const chatPrompt = useCopilotStore((s) => s.chatPrompt);
  const setChatPrompt = useCopilotStore((s) => s.setChatPrompt);

  const suggestionContextChars = useCopilotStore((s) => s.suggestionContextChars);
  const setSuggestionContextChars = useCopilotStore((s) => s.setSuggestionContextChars);
  const detailedAnswerContextChars = useCopilotStore((s) => s.detailedAnswerContextChars);
  const setDetailedAnswerContextChars = useCopilotStore((s) => s.setDetailedAnswerContextChars);
  const chatContextChars = useCopilotStore((s) => s.chatContextChars);
  const setChatContextChars = useCopilotStore((s) => s.setChatContextChars);

  const refreshIntervalMs = useCopilotStore((s) => s.refreshIntervalMs);
  const setRefreshIntervalMs = useCopilotStore((s) => s.setRefreshIntervalMs);
  const audioChunkMs = useCopilotStore((s) => s.audioChunkMs);
  const setAudioChunkMs = useCopilotStore((s) => s.setAudioChunkMs);

  const resetPrompts = useCopilotStore((s) => s.resetPrompts);

  const [showKey, setShowKey] = useState(false);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-50">Settings</h2>
            <p className="text-xs text-ink-400">
              Stored in your browser&rsquo;s localStorage. Nothing is sent anywhere except Groq, using your key.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-panel flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Section title="Groq API key" hint="Required. Paste your own — we never ship a key.">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  placeholder="gsk_…"
                  className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 pr-9 font-mono text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-200"
                  aria-label={showKey ? "Hide" : "Show"}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              Get one at{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent-300 underline underline-offset-2 hover:text-accent-200"
              >
                console.groq.com/keys
              </a>
              .
            </p>
          </Section>

          <Section
            title="Timing"
            hint="Audio chunk length and suggestion refresh cadence."
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Audio chunk (ms)"
                value={audioChunkMs}
                onChange={setAudioChunkMs}
                min={5000}
                max={60000}
                step={1000}
              />
              <NumberField
                label="Auto-refresh (ms)"
                value={refreshIntervalMs}
                onChange={setRefreshIntervalMs}
                min={5000}
                max={120000}
                step={1000}
              />
            </div>
          </Section>

          <Section
            title="Context windows (characters)"
            hint="How much transcript to pass to each prompt. Larger = more context, slower & more tokens."
          >
            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="Suggestions window"
                value={suggestionContextChars}
                onChange={setSuggestionContextChars}
                min={400}
                max={12000}
                step={100}
              />
              <NumberField
                label="Detailed-answer window"
                value={detailedAnswerContextChars}
                onChange={setDetailedAnswerContextChars}
                min={1000}
                max={120000}
                step={500}
              />
              <NumberField
                label="Chat window"
                value={chatContextChars}
                onChange={setChatContextChars}
                min={1000}
                max={120000}
                step={500}
              />
            </div>
          </Section>

          <Section
            title="Prompts"
            hint="Editable. Reset to defaults any time."
            action={
              <button
                type="button"
                onClick={resetPrompts}
                className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
              >
                <RotateCcw className="h-3 w-3" />
                Reset prompts
              </button>
            }
          >
            <TextareaField
              label="Live-suggestion system prompt"
              value={suggestionPrompt}
              onChange={setSuggestionPrompt}
              rows={10}
            />
            <TextareaField
              label="Detailed-answer system prompt (suggestion clicked)"
              value={detailedAnswerPrompt}
              onChange={setDetailedAnswerPrompt}
              rows={6}
            />
            <TextareaField
              label="Chat system prompt (free-form)"
              value={chatPrompt}
              onChange={setChatPrompt}
              rows={6}
            />
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-800 bg-ink-900/80 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          {hint && <p className="text-xs text-ink-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-400">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="scroll-panel w-full rounded-md border border-ink-700 bg-ink-950 p-2.5 font-mono text-xs leading-relaxed text-ink-100 focus:border-accent-500 focus:outline-none"
      />
    </label>
  );
}
