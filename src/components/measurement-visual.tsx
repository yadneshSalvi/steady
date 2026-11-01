"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type {
  PlanAction,
  PreviewLevel,
  Region,
  StoredMeasurement,
  StudioAsset,
} from "@/lib/contracts";
import type { Point } from "@/lib/vision/geometry";
import type { LocalCheckpoint } from "@/lib/vision/local-checkpoints";
import { regionCrop, regionPolygon } from "@/lib/vision/measure";
import {
  checkpointGuidance,
  secondarySpatialGuidance,
} from "@/lib/vision/measurement-guidance";
import { HEATMAP_COLORS, heatmapColor } from "@/lib/vision/display";
import { RegionImage } from "./region-image";
import { ProvenanceLabel } from "./ui";

export function RegionTarget({
  asset,
  landmarks,
  region,
  level,
}: {
  asset: StudioAsset;
  landmarks: readonly Point[];
  region: Region;
  level: PreviewLevel;
}) {
  const crop = regionCrop(landmarks, region, 0.28);
  return (
    <figure className="region-target">
      <div>
        {crop ? (
          <RegionImage
            src={asset.url}
            width={asset.width}
            height={asset.height}
            crop={crop}
            label={`${level} YouCam target for ${region.replaceAll("_", " ")}`}
          />
        ) : (
          <Image
            src={asset.url}
            alt={`${level} color target`}
            width={asset.width}
            height={asset.height}
            unoptimized
          />
        )}
      </div>
      <figcaption>
        <strong>Stop at {level[0].toUpperCase() + level.slice(1)}</strong>
        <ProvenanceLabel kind="virtual_preview" recordedAt={asset.recordedAt} />
      </figcaption>
    </figure>
  );
}

export function MeasurementVisual({
  measurement,
  local,
  action,
  targetAsset,
  compact = false,
}: {
  measurement: StoredMeasurement;
  local?: LocalCheckpoint | null;
  action: PlanAction;
  targetAsset?: StudioAsset;
  compact?: boolean;
}) {
  const [heatmap, setHeatmap] = useState(true);
  const maskId = useId().replaceAll(":", "");
  const progress = measurement.progress;
  const polygon = local
    ? regionPolygon(local.landmarks, measurement.region)
    : [];
  const crop = local
    ? regionCrop(local.landmarks, measurement.region, 0.28)
    : null;
  const title =
    measurement.verdict === "insufficient"
      ? "Let’s get a clearer view"
      : measurement.verdict === "at_target"
        ? "At your chosen intensity"
        : measurement.verdict === "over"
          ? "Beyond your chosen intensity"
          : `${Math.round((progress ?? 0) * 100)}% toward your target`;
  return (
    <div
      className={`measurement-visual ${compact ? "measurement-visual--compact" : ""}`}
    >
      <div className="measurement-heading">
        <p className="eyebrow">Color checkpoint</p>
        <strong>{title}</strong>
      </div>
      {progress !== null ? (
        <div className="measurement-progress">
          <div
            role="progressbar"
            aria-label="Color change toward your chosen target"
            aria-valuemin={0}
            aria-valuemax={150}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={`${Math.round(progress * 100)}% of ${measurement.targetLevel} target`}
          >
            <span style={{ width: `${(progress / 1.5) * 100}%` }} />
            <i style={{ left: `${100 / 1.5}%` }} />
          </div>
          <div className="measurement-scale">
            <span>Baseline</span>
            <span>Target · 100%</span>
            <span>150%</span>
          </div>
        </div>
      ) : null}
      <p className="measurement-guidance">
        {checkpointGuidance(measurement, action)}
      </p>
      {local && secondarySpatialGuidance(local.result) ? (
        <p className="measurement-spatial-guidance">
          {secondarySpatialGuidance(local.result)}
        </p>
      ) : null}
      {local && heatmap && local.result.heatmap.length ? (
        <div className="measurement-legend" aria-label="Heatmap color scale">
          <span>Less ← change → More</span>
          <i
            aria-hidden
            style={{
              background: `linear-gradient(to right, ${HEATMAP_COLORS.join(", ")})`,
            }}
          />
          <strong>{measurement.targetLevel} target</strong>
        </div>
      ) : null}
      {local ? (
        <div className="measurement-images">
          <figure>
            <div className="measurement-still">
              <RegionImage
                src={local.checkpointUrl}
                width={local.width}
                height={local.height}
                crop={crop}
                label={
                  local.isSample
                    ? "Measured region of the recorded sample checkpoint"
                    : "Measured region of your local checkpoint"
                }
              >
                {heatmap && local.result.heatmap.length ? (
                  <g
                    transform={`scale(${local.width} ${local.height})`}
                    role="img"
                    aria-label="Measured color change heatmap"
                  >
                    <defs>
                      <mask
                        id={maskId}
                        maskUnits="userSpaceOnUse"
                        x="0"
                        y="0"
                        width="1"
                        height="1"
                      >
                        <polygon
                          points={polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="white"
                        />
                        {local.result.exclusions.map((part, index) => (
                          <polygon
                            key={index}
                            points={part.map((p) => `${p.x},${p.y}`).join(" ")}
                            fill="black"
                          />
                        ))}
                      </mask>
                    </defs>
                    <g mask={`url(#${maskId})`}>
                      {local.result.heatmap.map((cell) => (
                        <polygon
                          key={cell.id}
                          points={cell.polygon
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill={heatmapColor(cell.progress)}
                          fillOpacity=".42"
                        />
                      ))}
                    </g>
                    <polygon
                      points={polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#fff8dc"
                      strokeWidth=".0025"
                      strokeLinejoin="round"
                    />
                  </g>
                ) : null}
              </RegionImage>
            </div>
            <figcaption>
              <ProvenanceLabel
                kind={
                  local.isSample ? "simulated_checkpoint" : "actual_capture"
                }
              />
              {local.result.heatmap.length ? (
                <button
                  type="button"
                  className="text-link"
                  aria-pressed={heatmap}
                  onClick={() => setHeatmap(!heatmap)}
                >
                  {heatmap ? "Hide heatmap" : "Show heatmap"}
                </button>
              ) : null}
            </figcaption>
          </figure>
          {targetAsset ? (
            <RegionTarget
              asset={targetAsset}
              landmarks={local.targetLandmarks}
              region={measurement.region}
              level={measurement.targetLevel}
            />
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <details className="measurement-details">
          <summary>Measurement details</summary>
          <dl>
            <div>
              <dt>Redness change · Δa*</dt>
              <dd>{measurement.deltaA?.toFixed(2) ?? "—"}</dd>
            </div>
            <div>
              <dt>Color difference · ΔE00</dt>
              <dd>{measurement.deltaE00?.toFixed(2) ?? "—"}</dd>
            </div>
            <div>
              <dt>Spatial consistency</dt>
              <dd>
                {measurement.uniformity === null
                  ? "—"
                  : `${Math.round(measurement.uniformity * 100)}%`}
              </dd>
            </div>
            <div>
              <dt>Local capture + calculation</dt>
              <dd>{Math.round(measurement.elapsedMs)} ms</dd>
            </div>
          </dl>
          <p className="small">
            Image color change against your chosen preview. Your judgment comes
            first.
          </p>
        </details>
      ) : null}
    </div>
  );
}
