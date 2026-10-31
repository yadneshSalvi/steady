"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createSession } from "@/lib/client";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "@/lib/catalog";

export function QuickSample({
  className = "text-link",
  eyes = false,
}: {
  className?: string;
  eyes?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await createSession({
        ...structuredClone(eyes ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
        consent: true,
      });
      router.push(`/studio/${session.id}/looks`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The sample couldn't open. Try again.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="quick-sample">
      <button
        type="button"
        className={className}
        onClick={() => void open()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy
          ? "Opening sample…"
          : eyes
            ? "Explore the eye sample"
            : "Quick sample"}
        {busy ? (
          <LoaderCircle className="spin" size={17} aria-hidden />
        ) : (
          <ArrowRight size={17} aria-hidden />
        )}
      </button>
      {error ? (
        <p role="alert" className="small">
          {error}
        </p>
      ) : null}
    </div>
  );
}
