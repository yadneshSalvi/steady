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
        <strong>{level[0].toUpperCase() + level.slice(1)} target</strong>
      </figcaption>
    </figure>
  );
}

export function HeatmapLegend() {
  return (
    <div
      className="measurement-legend"
      aria-label="Heatmap color scale: 0% to 150%, target at 100%"
    >
      <div
        className="heatmap-scale"
        style={{
          background: `linear-gradient(to right, ${HEATMAP_COLORS.join(", ")})`,
        }}
      >
        <span
          className="heatmap-target-marker"
          style={{ left: `${100 / 1.5}%` }}
        >
          100% target
        </span>
      </div>
      <div className="heatmap-endpoints">
        <span>Less</span>
        <span>More</span>
      </div>
    </div>
  );
}

export function CheckpointImage({
  local,
  heatmap = true,
  full = false,
}: {
  local: LocalCheckpoint;
  heatmap?: boolean;
  full?: boolean;
}) {
  const maskId = useId().replaceAll(":", "");
  const polygon = regionPolygon(local.landmarks, local.measurement.region);
  const crop = full
    ? null
    : regionCrop(local.landmarks, local.measurement.region, 0.28);
  const overlay =
    heatmap && local.result.heatmap.length ? (
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
              points={cell.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
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
    ) : null;
  const label = local.isSample
    ? "Measured region of the recorded sample checkpoint"
    : "Measured region of your local checkpoint";
  return full ? (
    <svg
      className="mirror-checkpoint-image"
      viewBox={`0 0 ${local.width} ${local.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <image
        href={local.checkpointUrl}
        width={local.width}
        height={local.height}
      />
      {overlay}
    </svg>
  ) : (
    <RegionImage
      src={local.checkpointUrl}
      width={local.width}
      height={local.height}
      crop={crop}
      label={label}
    >
      {overlay}
    </RegionImage>
  );
}

export function MeasurementVisual({
  measurement,
  local,
  action,
  targetAsset,
  compact = false,
  showImages = true,
}: {
  measurement: StoredMeasurement;
  local?: LocalCheckpoint | null;
  action: PlanAction;
  targetAsset?: StudioAsset;
  compact?: boolean;
  showImages?: boolean;
}) {
  const [heatmap, setHeatmap] = useState(true);
  const progress = measurement.progress;
  const percent = progress === null ? null : Math.round(progress * 100);
  const verdict =
    measurement.verdict === "insufficient"
      ? "Need a clearer view"
      : measurement.verdict === "at_target"
        ? "At your target"
        : measurement.verdict === "over"
          ? "Beyond your target"
          : "toward your target";
  return (
    <div
      className={`measurement-visual ${compact ? "measurement-visual--compact" : ""}`}
    >
      <div className="measurement-heading">
        {percent !== null ? (
          <strong className="measurement-percent">{percent}%</strong>
        ) : null}
        <span>{verdict}</span>
      </div>
      {progress !== null ? (
        <div className="measurement-progress">
          <div
            role="progressbar"
            aria-label="Color change toward your chosen target"
            aria-valuemin={0}
            aria-valuemax={150}
            aria-valuenow={Math.max(0, Math.min(150, percent!))}
            aria-valuetext={`${percent}% of ${measurement.targetLevel} target`}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (progress / 1.5) * 100))}%`,
              }}
            />
            <i style={{ left: `${100 / 1.5}%` }} />
          </div>
          <div className="measurement-scale">
            <span>Baseline</span>
            <span style={{ left: `${100 / 1.5}%` }}>100% target</span>
          </div>
        </div>
      ) : null}
      {!compact ? (
        <p className="measurement-guidance">
          {checkpointGuidance(measurement, action)}
        </p>
      ) : null}
      {showImages && local ? (
        <div className="measurement-images">
          <figure>
            <div className="measurement-still">
              <CheckpointImage local={local} heatmap={heatmap} />
            </div>
            {local.result.heatmap.length ? (
              <figcaption>
                <button
                  type="button"
                  className="text-link"
                  aria-pressed={heatmap}
                  onClick={() => setHeatmap(!heatmap)}
                >
                  {heatmap ? "Hide heatmap" : "Show heatmap"}
                </button>
              </figcaption>
            ) : null}
          </figure>
          {!compact && targetAsset ? (
            <RegionTarget
              asset={targetAsset}
              landmarks={local.targetLandmarks}
              region={measurement.region}
              level={measurement.targetLevel}
            />
          ) : null}
        </div>
      ) : null}
      {showImages && local && heatmap && local.result.heatmap.length ? (
        <HeatmapLegend />
      ) : null}
      {!compact ? (
        <details className="measurement-details">
          <summary>Measurement details</summary>
          {local && secondarySpatialGuidance(local.result) ? (
            <p className="measurement-spatial-guidance">
              {secondarySpatialGuidance(local.result)}
            </p>
          ) : null}
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
              <dt>Measured in</dt>
              <dd>{Math.round(measurement.elapsedMs)} ms</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}
