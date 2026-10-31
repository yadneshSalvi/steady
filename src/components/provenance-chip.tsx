"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { X } from "lucide-react";

export type ProvenanceKind =
  "recorded" | "fresh" | "photo" | "synthetic" | "simulated";
const explanations: Record<
  ProvenanceKind,
  { label: string; description: string }
> = {
  recorded: {
    label: "Recorded YouCam",
    description:
      "A real YouCam render saved from an earlier request. The source and exact recipe are verified before reuse. It illustrates the chosen appearance.",
  },
  fresh: {
    label: "Fresh YouCam",
    description:
      "A new YouCam render of your selected source and exact recipe. It is a visual target, not a photo of makeup you applied.",
  },
  photo: {
    label: "Your photo",
    description:
      "A photo you selected or captured. Local checkpoint frames stay in this browser; only photos you explicitly choose to save or send for a second opinion leave it.",
  },
  synthetic: {
    label: "Synthetic sample",
    description:
      "A fictional adult portrait with an example setup. The sample lets you explore the complete studio without a camera. No participant outcome is represented.",
  },
  simulated: {
    label: "Simulated checkpoint",
    description:
      "A lighter, recorded YouCam render is measured against the original source and your chosen target. The numbers come from those pixels; they demonstrate the measurement flow, not physical application.",
  },
};

export function ProvenanceChip({
  kind,
  className = "",
}: {
  kind: ProvenanceKind;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const item = explanations[kind];
  return (
    <>
      <button
        type="button"
        className={`provenance ${className}`}
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
      >
        <span aria-hidden />
        {item.label}
      </button>
      <dialog
        ref={dialog}
        className="provenance-dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="provenance-dialog-heading">
          <h2 id={titleId}>{item.label}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close image explanation"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p>{item.description}</p>
        <Link href="/evidence" onClick={() => dialog.current?.close()}>
          Evidence &amp; limits
        </Link>
      </dialog>
    </>
  );
}
