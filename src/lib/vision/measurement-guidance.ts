import type {
  PlanAction,
  StoredMeasurement,
  StudioSession,
} from "../contracts";
import type { MeasurementResult } from "./measure";

/** Secondary cheek evidence never replaces the dominant measured lagging area. */
export function secondarySpatialGuidance(
  measurement: Pick<
    MeasurementResult,
    "region" | "verdict" | "lagging" | "regionalProgress"
  >,
  action?: Pick<PlanAction, "motion">,
): string | null {
  if (
    measurement.verdict !== "build" ||
    (measurement.region !== "left_cheek" &&
      measurement.region !== "right_cheek") ||
    (measurement.lagging !== "upper" && measurement.lagging !== "lower")
  )
    return null;
  const inner = measurement.regionalProgress?.find(
    (part) => part.subregion === "inner",
  );
  const outer = measurement.regionalProgress?.find(
    (part) => part.subregion === "outer",
  );
  if (
    !inner ||
    !outer ||
    [inner, outer].some(
      (part) =>
        !Number.isFinite(part.progress) ||
        part.progress < 0 ||
        part.progress > 1.5 ||
        !Number.isFinite(part.pixels) ||
        part.pixels < 1,
    )
  )
    return null;
  if (Math.abs(inner.progress - outer.progress) < 0.12) return null;
  const [lighter] =
    inner.progress < outer.progress ? [inner, outer] : [outer, inner];
  return lighter.subregion === "outer"
    ? action?.motion === "blending"
      ? "One more broad pass toward your ear."
      : action?.motion === "tapping"
        ? "Tap gently toward your ear."
        : "Work gently toward your ear."
    : "Work gently toward the center of the guide.";
}

/** One short per-area line, on the axis the main guidance names. */
export function areaReading(
  measurement: Pick<
    MeasurementResult,
    "region" | "verdict" | "lagging" | "regionalProgress"
  >,
): string | null {
  if (measurement.region === "lips" || measurement.verdict === "insufficient")
    return null;
  const part = (id: MeasurementResult["lagging"]) =>
    measurement.regionalProgress?.find(
      (item) =>
        item.subregion === id &&
        Number.isFinite(item.progress) &&
        Number.isFinite(item.pixels) &&
        item.pixels >= 1,
    );
  const [first, second] =
    measurement.lagging === "upper" || measurement.lagging === "lower"
      ? (["upper", "lower"] as const)
      : (["outer", "inner"] as const);
  const a = part(first),
    b = part(second);
  if (!a || !b) return null;
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return `${first[0].toUpperCase()}${first.slice(1)} ${percent(a.progress)} · ${second} ${percent(b.progress)}`;
}

export function checkpointGuidance(
  measurement: Pick<
    StoredMeasurement,
    "verdict" | "progress" | "lagging" | "reason" | "targetLevel"
  >,
  action: PlanAction,
): string {
  if (measurement.verdict === "insufficient")
    return (
      measurement.reason ||
      "Keep the original baseline position and check again in even light."
    );
  if (action.region === "left_eye" || action.region === "right_eye") {
    if (measurement.verdict === "at_target") return "Keep this eye intensity.";
    if (measurement.verdict === "over") return "Stop adding color.";
    return action.product === "eye_liner"
      ? "Add one short stroke above your upper lashes."
      : "Tap gently across the upper lid.";
  }
  if (measurement.verdict === "at_target")
    return "Keep this intensity, or soften the edge.";
  if (measurement.verdict === "over")
    return "Stop adding color and soften with a clean tool.";
  if (measurement.lagging === "upper") return "Work up along the cheekbone.";
  if (measurement.lagging === "outer")
    return action.motion === "blending"
      ? "One more broad pass toward your ear."
      : action.motion === "tapping"
        ? "Tap gently toward your ear."
        : "Add short strokes toward your ear.";
  if (measurement.lagging === "inner")
    return "Work gently toward the center of the guide.";
  if (measurement.lagging === "lower")
    return "Work gently along the lower edge of the guide.";
  return action.motion === "blending"
    ? "Add one light, broad pass inside the guide."
    : action.motion === "short_strokes"
      ? "Add one short, gentle stroke inside the guide."
      : action.tool === "sponge"
        ? "Add one gentle sponge pass inside the guide."
        : "Add a few light taps inside the guide.";
}

export function stalledCheckpoint(
  session: StudioSession,
  actionId: string,
): boolean {
  const measured = session.observations
    .filter((item) => item.actionId === actionId && item.measurement)
    .slice(-2)
    .map((item) => item.measurement!);
  return (
    measured.length === 2 &&
    measured.every(
      (item) =>
        item.reportedPass && item.verdict === "build" && item.progress !== null,
    ) &&
    measured[0].targetAssetId === measured[1].targetAssetId &&
    measured[0].targetLevel === measured[1].targetLevel &&
    measured[0].geometryVersion === measured[1].geometryVersion &&
    measured[0].sampleCheckpointId === measured[1].sampleCheckpointId &&
    measured[1].targetAssetId === session.activePlan?.previewAsset?.id &&
    measured[1].targetLevel ===
      (session.activePlan?.selectedPreviewVariantId ?? "full") &&
    measured[1].progress! - measured[0].progress! < 0.1
  );
}

/** A later unsaved capture must never be displayed as a persisted observation. */
export function sameStoredMeasurement(
  left: StoredMeasurement,
  right: StoredMeasurement,
): boolean {
  const fields = [
    "version",
    "region",
    "verdict",
    "progress",
    "deltaA",
    "deltaE00",
    "uniformity",
    "lagging",
    "reason",
    "provenance",
    "reportedPass",
    "targetLevel",
    "targetAssetId",
    "elapsedMs",
    "geometryVersion",
    "sampleCheckpointId",
  ] as const;
  return fields.every((field) => left[field] === right[field]);
}
