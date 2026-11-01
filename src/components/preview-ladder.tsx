"use client";
import Image from "next/image";
import type { CandidatePlan, PreviewLevel } from "@/lib/contracts";
import { PREVIEW_LEVELS } from "@/lib/youcam/recipes";

export function PreviewLadder({
  candidate,
  onChoose,
  disabled = false,
  compact = false,
}: {
  candidate: CandidatePlan;
  onChoose: (level: PreviewLevel) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  if (!candidate.previewVariants?.length) return null;
  return (
    <fieldset
      className={`preview-ladder ${compact ? "preview-ladder--compact" : ""}`}
      disabled={disabled}
    >
      <legend>Stop at</legend>
      <div
        style={{
          gridTemplateColumns: `repeat(${candidate.previewVariants.length}, minmax(0,1fr))`,
        }}
      >
        {PREVIEW_LEVELS.filter(({ id }) =>
          candidate.previewVariants!.some((variant) => variant.id === id),
        ).map(({ id, label }) => {
          const variant = candidate.previewVariants!.find(
            (item) => item.id === id,
          );
          const chosen = (candidate.selectedPreviewVariantId ?? "full") === id;
          const asset = variant?.previewAsset;
          // The optimizer can fetch public recordings. Personal assets need the
          // owning browser's cookies, so keep their authenticated URL untouched.
          const publicRecording =
            asset?.provenance === "virtual_preview" &&
            !!asset.recordedAt &&
            /^\/examples\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(
              asset.url,
            );
          return (
            <button
              key={id}
              type="button"
              className={chosen ? "is-selected" : ""}
              aria-pressed={chosen}
              aria-label={`Stop at ${label} for ${candidate.name}`}
              onClick={() => onChoose(id)}
            >
              {!compact &&
                (asset ? (
                  <Image
                    src={asset.url}
                    alt={`${label} color target`}
                    width={160}
                    height={180}
                    sizes="(max-width: 740px) 28vw, (max-width: 1100px) 15vw, 10vw"
                    unoptimized={!publicRecording}
                  />
                ) : (
                  <span className="ladder-placeholder" aria-hidden>
                    {variant?.previewStatus === "queued" ||
                    variant?.previewStatus === "processing"
                      ? "…"
                      : "○"}
                  </span>
                ))}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
