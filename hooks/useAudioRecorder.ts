"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCopilotStore } from "@/store/useCopilotStore";

/**
 * useAudioRecorder
 * ----------------
 * Captures the microphone and produces a fresh self-contained WebM blob every
 * `audioChunkMs` ms.
 *
 * Why stop+start instead of `mediaRecorder.start(timeslice)`?
 *   `MediaRecorder.start(ms)` emits `dataavailable` events with partial blobs
 *   — but only the FIRST blob has the WebM container headers. Subsequent
 *   blobs are raw fragments that most decoders (Whisper's preprocessor
 *   included) reject or mis-decode. By stopping and restarting the recorder
 *   on a timer we get N independent, header-complete WebM files at the cost
 *   of ~20ms of audio at each boundary. For a meeting copilot that is
 *   strictly better than "first chunk transcribes, rest silently fails".
 *
 * The hook is idempotent — start/stop are safe to call repeatedly and we
 * always clean up the MediaStream tracks (otherwise the browser's mic
 * indicator stays on).
 */

type ChunkHandler = (blob: Blob, seq: number) => void | Promise<void>;

export function useAudioRecorder(onChunk: ChunkHandler) {
  const audioChunkMs = useCopilotStore((s) => s.audioChunkMs);
  const isRecording = useCopilotStore((s) => s.isRecording);
  const setIsRecording = useCopilotStore((s) => s.setIsRecording);
  const setError = useCopilotStore((s) => s.setError);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seqRef = useRef(0);
  const opChainRef = useRef<Promise<void>>(Promise.resolve());
  // Keep the latest onChunk in a ref so the recorder callbacks always call the
  // current handler (avoids stale closures if the parent rebinds).
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  /** Pick the best mime type this browser supports. */
  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    if (typeof MediaRecorder === "undefined") return "";
    for (const c of candidates) {
      // isTypeSupported lives on the constructor
      if ((MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean }).isTypeSupported?.(c)) {
        return c;
      }
    }
    return "";
  };

  const stopCurrentRecorder = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        recorderRef.current = null;
        return resolve(null);
      }
      const parts: Blob[] = [];
      const mime = rec.mimeType || "audio/webm";
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) parts.push(e.data);
      };
      rec.onstop = () => {
        recorderRef.current = null;
        if (parts.length === 0) return resolve(null);
        resolve(new Blob(parts, { type: mime }));
      };
      try {
        rec.stop();
      } catch {
        recorderRef.current = null;
        resolve(null);
      }
    });
  }, []);

  const startNewRecorder = useCallback(() => {
    if (!streamRef.current) return;
    const mime = pickMimeType();
    const opts: MediaRecorderOptions = mime ? { mimeType: mime } : {};
    try {
      const rec = new MediaRecorder(streamRef.current, opts);
      recorderRef.current = rec;
      rec.start();
    } catch (err) {
      setError(`Could not start recorder: ${(err as Error).message}`);
    }
  }, [setError]);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = opChainRef.current.then(task, task);
    opChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const emitChunk = useCallback(
    async (blob: Blob | null, errorPrefix: string): Promise<boolean> => {
      if (!blob || blob.size <= 500 /* ignore near-silent fragments */) {
        return false;
      }
      const seq = ++seqRef.current;
      try {
        await onChunkRef.current(blob, seq);
        return true;
      } catch (err) {
        setError(`${errorPrefix}: ${(err as Error).message}`);
      }
      return false;
    },
    [setError],
  );

  const rotateRecorder = useCallback(
    async ({ restart, errorPrefix }: { restart: boolean; errorPrefix: string }) => {
      const blob = await stopCurrentRecorder();
      if (restart && streamRef.current) {
        startNewRecorder();
      }
      return emitChunk(blob, errorPrefix);
    },
    [emitChunk, startNewRecorder, stopCurrentRecorder],
  );

  const armInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      void enqueue(() =>
        rotateRecorder({ restart: true, errorPrefix: "Chunk upload failed" }),
      );
    }, audioChunkMs);
  }, [audioChunkMs, enqueue, rotateRecorder]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!streamRef.current) return false;
    const flushed = await enqueue(() =>
      rotateRecorder({ restart: true, errorPrefix: "Manual refresh failed" }),
    );
    if (streamRef.current) {
      armInterval();
    }
    return flushed;
  }, [armInterval, enqueue, rotateRecorder]);

  const start = useCallback(async () => {
    if (isRecording) return;
    setError(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone capture.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (err) {
      setError(`Microphone permission denied: ${(err as Error).message}`);
      return;
    }

    streamRef.current = stream;
    seqRef.current = 0;

    startNewRecorder();
    armInterval();

    setIsRecording(true);
  }, [armInterval, isRecording, setError, setIsRecording, startNewRecorder]);

  const stop = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    await enqueue(() =>
      rotateRecorder({ restart: false, errorPrefix: "Final chunk upload failed" }),
    );
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, [enqueue, rotateRecorder, setIsRecording]);

  // Always clean up on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { start, stop, flush };
}
