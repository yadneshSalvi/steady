import type {
  PlanAction,
  StoredMeasurement,
  StudioSession,
} from "../contracts";

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
    if (measurement.verdict === "at_target")
      return "You’re at your chosen eye intensity. You can keep it and finish this step.";
    if (measurement.verdict === "over")
      return "Deeper than your eye preview. Stop adding color. Keep it, or use an eye-safe remover according to its directions if you choose to remove it.";
    const movement =
      action.product === "eye_liner"
        ? "one short stroke on the skin above your upper lashes"
        : "a few gentle taps on the upper lid with your eye-labeled shadow";
    return `About ${Math.round((measurement.progress ?? 0) * 100)}% of your ${measurement.targetLevel} eye target. If you want more definition, try ${movement}, then check again. Keep product away from the eye and waterline; stop whenever the movement feels uncomfortable.`;
  }
  if (measurement.verdict === "at_target")
    return "You’re at your preview’s intensity. Keep it, or gently soften the edge with a clean tool.";
  if (measurement.verdict === "over")
    return "Deeper than your preview. If you want to soften it, gently tap with a clean sponge or suitable brush to lift excess color.";
  const area =
    measurement.lagging === "outer"
      ? "The outer part is lighter; work gently toward your ear."
      : measurement.lagging === "inner"
        ? "The inner part is lighter; keep the movement inside the guide."
        : measurement.lagging === "upper"
          ? "The upper part is lighter; keep the movement inside the guide."
          : measurement.lagging === "lower"
            ? "The lower part is lighter; keep the movement inside the guide."
            : "Build gradually within the guide.";
  const motion =
    action.motion === "blending"
      ? "Try one light, broad pass"
      : action.motion === "short_strokes"
        ? "Try one short, gentle stroke"
        : action.tool === "sponge"
          ? "Try one gentle sponge pass"
          : "Try a few light taps";
  return `About ${Math.round((measurement.progress ?? 0) * 100)}% of your ${measurement.targetLevel} target. ${area} ${motion}, then check again if you want more color.`;
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
  ] as const;
  return fields.every((field) => left[field] === right[field]);
}
