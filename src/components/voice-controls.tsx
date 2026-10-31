"use client";

import { ChevronDown, Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { VoiceCommand } from "@/lib/voice";
import { Button, Notice } from "./ui";

interface VoiceControlsProps {
  contextKey: string;
  blocked: boolean;
  onCommand: (command: VoiceCommand) => Promise<void> | void;
}

const formats = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Audio remains in memory; only detected utterances are sent after explicit consent. */
export function VoiceControls({
  contextKey,
  blocked,
  onCommand,
}: VoiceControlsProps) {
  const [consent, setConsent] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Microphone off");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const current = useRef({ contextKey, blocked, onCommand });
  useEffect(() => {
    current.current = { contextKey, blocked, onCommand };
  }, [contextKey, blocked, onCommand]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    let audioContext: AudioContext | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    let restart: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let lastCommand = "";
    let lastCommandAt = 0;
    const stop = () => {
      setEnabled(false);
      setStatus("Microphone off");
    };
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("offline", stop);
    document.addEventListener("visibilitychange", onVisibility);

    async function start() {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined" ||
        typeof AudioContext === "undefined"
      ) {
        setError(
          "Voice recording isn’t available in this browser. All visible controls still work.",
        );
        stop();
        return;
      }
      const mimeType = formats.find((format) =>
        MediaRecorder.isTypeSupported(format),
      );
      if (!mimeType) {
        setError(
          "This browser’s audio format isn’t supported. Please use the visible controls.",
        );
        stop();
        return;
      }
      setStatus("Opening your microphone…");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        audioContext = new AudioContext();
        await audioContext.resume();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const cycle = () => {
          if (disposed || !stream) return;
          if (current.current.blocked || window.speechSynthesis?.speaking) {
            setStatus("Waiting for the studio…");
            restart = setTimeout(cycle, 300);
            return;
          }
          const capturedContext = current.current.contextKey;
          const began = performance.now();
          let speechHeard = false;
          let lastSound = began;
          const chunks: Blob[] = [];
          recorder = new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 48_000,
          });
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          recorder.onerror = () => {
            if (!disposed) {
              setError(
                "The microphone stopped. Please try again or use the visible controls.",
              );
              stop();
            }
          };
          recorder.onstop = async () => {
            if (tick) clearInterval(tick);
            if (disposed) return;
            const clip = new Blob(chunks, { type: mimeType });
            if (
              speechHeard &&
              clip.size >= 128 &&
              capturedContext === current.current.contextKey &&
              !current.current.blocked
            ) {
              setStatus("Listening to your command…");
              request = new AbortController();
              try {
                const result = await api<{
                  command: VoiceCommand | null;
                  heard: string | null;
                }>("/api/voice/transcribe", {
                  method: "POST",
                  body: clip,
                  headers: {
                    "Content-Type": mimeType,
                    "X-Steady-Voice-Consent": "deepgram-v1",
                  },
                  signal: request.signal,
                });
                if (disposed) return;
                if (
                  capturedContext !== current.current.contextKey ||
                  current.current.blocked
                )
                  setHeard(
                    "The step changed while listening. Please say your command again.",
                  );
                else if (!result.command)
                  setHeard(
                    "No exact studio command heard. Try “Steady, pause.”",
                  );
                else if (
                  result.command !== lastCommand ||
                  Date.now() - lastCommandAt > 1_500
                ) {
                  lastCommand = result.command;
                  lastCommandAt = Date.now();
                  setHeard(result.heard || `Steady, ${result.command}`);
                  await current.current.onCommand(result.command);
                  if (result.command === "stop") stop();
                }
              } catch (cause) {
                if (!disposed && !request.signal.aborted) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "That command couldn’t be heard. Please use the visible controls.",
                  );
                  stop();
                  return;
                }
              }
            }
            if (!disposed) restart = setTimeout(cycle, 250);
          };
          recorder.start();
          setStatus("Listening · say “Steady” and a command");
          tick = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            const rms = Math.sqrt(
              samples.reduce((sum, value) => sum + value * value, 0) /
                samples.length,
            );
            const now = performance.now();
            if (rms > 0.018) {
              speechHeard = true;
              lastSound = now;
            }
            if (window.speechSynthesis?.speaking) speechHeard = false;
            const finished =
              speechHeard && now - lastSound > 700 && now - began > 700;
            if (
              finished ||
              now - began > 6_000 ||
              capturedContext !== current.current.contextKey ||
              current.current.blocked ||
              window.speechSynthesis?.speaking
            ) {
              if (tick) clearInterval(tick);
              if (recorder?.state === "recording") recorder.stop();
            }
          }, 80);
        };
        cycle();
      } catch {
        if (!disposed) {
          setError(
            "Microphone permission wasn’t available. You can allow it in browser settings, or keep using the visible controls.",
          );
          stop();
        }
      }
    }
    void start();
    return () => {
      disposed = true;
      if (tick) clearInterval(tick);
      if (restart) clearTimeout(restart);
      request?.abort();
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      void audioContext?.close().catch(() => undefined);
      window.removeEventListener("offline", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return (
    <details className="photo-assist voice-controls">
      <summary>
        <Mic size={18} aria-hidden />
        <span>Voice controls · {enabled ? "microphone on" : "optional"}</span>
        <ChevronDown size={17} aria-hidden />
      </summary>
      <div className="photo-assist-body">
        <p>
          Say <strong>“Steady, pause”</strong>, “repeat”, “check”, “help”,
          “next”, or “stop”. “Next” confirms a checked step; “stop” opens a
          confirmation.
        </p>
        <p className="field-note">
          While enabled, short audio clips are sent to Deepgram through STEADY
          to recognize commands. Audio and free-form transcripts aren’t saved by
          STEADY. Recognition may miss a phrase; the visible controls remain
          available.
        </p>
        <label className="checkbox-label" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={consent}
            disabled={enabled}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I agree to send short microphone clips to Deepgram while voice
            controls are on.
          </span>
        </label>
        <div className="button-row" style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            disabled={!enabled && (!consent || blocked)}
            onClick={() => {
              setError("");
              setHeard("");
              setEnabled(!enabled);
              if (enabled) setStatus("Microphone off");
            }}
          >
            {enabled ? (
              <MicOff size={18} aria-hidden />
            ) : (
              <Mic size={18} aria-hidden />
            )}
            {enabled ? "Turn microphone off" : "Enable voice controls"}
          </Button>
        </div>
        <p className="small" role="status" style={{ marginTop: 16 }}>
          {status}
          {heard ? ` · ${heard}` : ""}
        </p>
        {error ? <Notice kind="error">{error}</Notice> : null}
      </div>
    </details>
  );
}
