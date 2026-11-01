"use client";
import type { CandidatePlan, PreviewLevel } from "@/lib/contracts";
import type { CropBox } from "@/lib/vision/display";
import { PREVIEW_LEVELS } from "@/lib/youcam/recipes";
import { RegionPhoto } from "./region-image";

// The optimizer can fetch public recordings. Personal assets need the owning
// browser's cookies, so keep their authenticated URL untouched.
export function publicRecording(
  asset: CandidatePlan["previewAsset"] | undefined,
) {
  return (
    asset?.provenance === "virtual_preview" &&
    !!asset.recordedAt &&
    /^\/examples\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(
      asset.url,
    )
  );
}

export function PreviewLadder({
  candidate,
  onChoose,
  disabled = false,
  compact = false,
  crop = null,
}: {
  candidate: CandidatePlan;
  onChoose: (level: PreviewLevel) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Painted-region window; "loading" while the face guide starts. */
  crop?: CropBox | null | "loading";
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
                  <RegionPhoto
                    src={asset.url}
                    alt={`${label} color target`}
                    width={asset.width}
                    height={asset.height}
                    crop={crop === "loading" ? undefined : crop}
                    unoptimized={!publicRecording(asset)}
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
