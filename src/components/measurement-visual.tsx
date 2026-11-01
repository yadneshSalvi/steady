"use client";

import Image from "next/image";
import { ChevronDown } from "lucide-react";
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
  areaReading,
  checkpointGuidance,
  secondarySpatialGuidance,
} from "@/lib/vision/measurement-guidance";
import {
  HEATMAP_COLORS,
  heatmapColor,
  smoothHeatmap,
} from "@/lib/vision/display";
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

export function HeatmapLegend({ compact = false }: { compact?: boolean }) {
  const scale = (
    <div
      className="heatmap-scale"
      style={{
        background: `linear-gradient(to right, ${HEATMAP_COLORS.join(", ")})`,
      }}
    >
      <span className="heatmap-target-marker" style={{ left: `${100 / 1.5}%` }}>
        100% target
      </span>
    </div>
  );
  return compact ? (
    <div
      className="measurement-legend measurement-legend--pill"
      aria-label="Heatmap color scale: 0% to 150%, target at 100%"
    >
      <span>Less</span>
      {scale}
      <span>More</span>
    </div>
  ) : (
    <div
      className="measurement-legend"
      aria-label="Heatmap color scale: 0% to 150%, target at 100%"
    >
      {scale}
      <div className="heatmap-endpoints">
        <span>Less</span>
        <span>More</span>
      </div>
    </div>
  );
}

/** Mirror overlays read from a distance; review crops stay subtler. */
const HEATMAP_OPACITY = { mirror: 0.62, crop: 0.45 } as const;

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
  const blurId = `${maskId}-blur`;
  const polygon = regionPolygon(local.landmarks, local.measurement.region);
  const crop = full
    ? null
    : regionCrop(local.landmarks, local.measurement.region, 0.28);
  const xs = polygon.map((point) => point.x),
    ys = polygon.map((point) => point.y);
  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const tiles =
    heatmap && polygon.length
      ? smoothHeatmap(local.result.heatmap, bounds)
      : [];
  const opacity = full ? HEATMAP_OPACITY.mirror : HEATMAP_OPACITY.crop;
  const overlay =
    heatmap && tiles.length ? (
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
          <filter
            id={blurId}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="1"
            height="1"
          >
            <feGaussianBlur
              stdDeviation={`${bounds.width / 14} ${bounds.height / 14}`}
            />
          </filter>
        </defs>
        {/* Filter applies before the mask, so the blur never leaves the region. */}
        <g mask={`url(#${maskId})`} filter={`url(#${blurId})`}>
          {tiles.map((tile) => (
            <polygon
              key={tile.id}
              points={`${tile.x},${tile.y} ${tile.x + tile.width},${tile.y} ${tile.x + tile.width},${tile.y + tile.height} ${tile.x},${tile.y + tile.height}`}
              fill={heatmapColor(tile.progress)}
              fillOpacity={opacity}
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
  legend = true,
}: {
  measurement: StoredMeasurement;
  local?: LocalCheckpoint | null;
  action: PlanAction;
  targetAsset?: StudioAsset;
  compact?: boolean;
  showImages?: boolean;
  /** Off when a group of checkpoints shares one legend. */
  legend?: boolean;
}) {
  const [heatmap, setHeatmap] = useState(true);
  const progress = measurement.progress;
  const areas = local ? areaReading(local.result) : null;
  const spatial = local ? secondarySpatialGuidance(local.result, action) : null;
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
      {!compact && areas ? <p className="measurement-areas">{areas}</p> : null}
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
      {legend &&
      showImages &&
      local &&
      heatmap &&
      local.result.heatmap.length ? (
        <HeatmapLegend />
      ) : null}
      {!compact ? (
        <details className="measurement-details">
          <summary>
            Measurement details <ChevronDown size={17} aria-hidden />
          </summary>
          {spatial ? (
            <p className="measurement-spatial-guidance">{spatial}</p>
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
