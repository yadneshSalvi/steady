import { describe, expect, it } from "vitest";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import type { StoredMeasurement } from "../src/lib/contracts";
import { applyCommand, createSession, currentAction } from "../src/lib/planner";
import { attachRecordedSamplePreviews } from "../src/lib/server/recorded-previews";
import { commandSchema } from "../src/lib/server/validation";
import {
  checkpointGuidance,
  sameStoredMeasurement,
  stalledCheckpoint,
} from "../src/lib/vision/measurement-guidance";

async function ready() {
  let session = createSession(
    { ...structuredClone(SAMPLE_SETUP), consent: true },
    "review-test",
  );
  session.sourceAssetId = "sample-portrait-v1";
  session.assets.push({
    id: session.sourceAssetId,
    url: "/images/studio-portrait.jpg",
    provenance: "synthetic_inspiration",
    purpose: "baseline",
    createdAt: session.createdAt,
    width: 1024,
    height: 1280,
  });
  await attachRecordedSamplePreviews(session);
  session = applyCommand(session, {
    type: "approve_candidate",
    candidateId: session.candidates[0].id,
  });
  return session;
}
function measured(targetAssetId: string, progress = 0.38): StoredMeasurement {
  return {
    version: 1,
    region: "left_cheek",
    verdict: "build",
    progress,
    deltaA: 2.4,
    deltaE00: 2.1,
    uniformity: 0.91,
    lagging: null,
    provenance: "simulated",
    reportedPass: true,
    targetLevel: "full",
    targetAssetId,
    elapsedMs: 155,
  };
}

describe("review-driven studio invariants", () => {
  it("keeps a recorded source while editing setup, without reusing an in-flight job", async () => {
    const session = await ready();
    const first = session.candidates[0];
    first.previewVariants![0].previewStatus = "processing";
    first.previewVariants![0].previewJobId = "queued-under-old-candidate";
    first.previewVariants![0].previewAsset = undefined;
    const next = applyCommand(session, {
      type: "update_setup",
      setup: {
        ...structuredClone(SAMPLE_SETUP),
        consent: true,
        tools: ["sponge"],
        products: ["cream_blush"],
      },
    });
    expect(next.id).toBe(session.id);
    expect(next.sourceAssetId).toBe(session.sourceAssetId);
    expect(next.assets).toEqual(session.assets);
    expect(next.candidates).toHaveLength(1);
    expect(next.candidates[0].routeId).toBe("sponge");
    expect(
      next.candidates[0].previewVariants!.some(
        (variant) => variant.previewJobId === "queued-under-old-candidate",
      ),
    ).toBe(false);
    expect(next.stage).toBe("choosing");
    const invalid = {
      ...structuredClone(SAMPLE_SETUP),
      preferences: {
        ...SAMPLE_SETUP.preferences,
        movements: {
          tapping: "unknown" as const,
          blending: "unknown" as const,
          short_strokes: "unknown" as const,
        },
      },
    };
    expect(() =>
      applyCommand(session, { type: "update_setup", setup: invalid }),
    ).toThrow(/Confirm a comfortable movement/);
  });
  it("ranks a cream brush before powder when a cream tap movement is avoided", async () => {
    let session = applyCommand(await ready(), { type: "start" });
    const physical = structuredClone(currentAction(session)!);
    session = applyCommand(session, {
      type: "complete_action",
      actionId: physical.id,
    });
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
    });
    expect(session.adaptation?.candidate.actions[1]).toMatchObject({
      product: "cream_blush",
      motion: "blending",
      tool: "wide_brush",
    });
    expect(session.adaptation?.candidate.actions[0]).toEqual(physical);
    expect(session.adaptation?.productChangeNote).toBeUndefined();
    expect(session.adaptation?.candidate.previewAsset?.id).toBe(
      session.activePlan!.previewAsset!.id,
    );
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: session.adaptation!.id,
    });
    expect(session.candidates).toHaveLength(3);
    expect(
      new Set(session.candidates.map((candidate) => candidate.id)).size,
    ).toBe(3);
  });
  it("uses the adapted method's exact texture target instead of the old picture", async () => {
    let session = applyCommand(await ready(), { type: "start" });
    const original = session.activePlan!.previewAsset;
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "sweep",
    });
    expect(session.adaptation!.candidate.previewAsset?.url).toContain(
      "rose-matte-full",
    );
    expect(session.adaptation!.candidate.previewAsset?.id).not.toBe(
      original!.id,
    );
  });
  it("stores scalar measured evidence and an immutable action snapshot without advancing", async () => {
    let session = applyCommand(await ready(), { type: "start" });
    const action = currentAction(session)!;
    const measurement = measured(session.activePlan!.previewAsset!.id);
    session = applyCommand(session, {
      type: "checkpoint",
      actionId: action.id,
      measurement,
    });
    expect(session.completedActionIds).toEqual([]);
    expect(session.observations[0]).toMatchObject({
      state: "measured_checkpoint",
      method: "local_color_v1",
      measurement,
      actionSnapshot: action,
    });
    expect(session.events.at(-1)?.measurement).toEqual(measurement);
    expect(JSON.stringify(session.events.at(-1))).not.toMatch(
      /imageData|landmarks|data:image|heatmap/,
    );
    expect(
      commandSchema.safeParse({
        type: "checkpoint",
        actionId: action.id,
        measurement: { ...measurement, landmarks: [] },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "checkpoint",
        actionId: action.id,
        measurement: { ...measurement, progress: 2 },
      }).success,
    ).toBe(false);
  });
  it("rejects a different target, wrong level, or false sample provenance", async () => {
    const session = applyCommand(await ready(), { type: "start" });
    const actionId = currentAction(session)!.id;
    const base = measured(session.activePlan!.previewAsset!.id);
    const other = session.candidates[1].previewAsset!.id;
    for (const measurement of [
      { ...base, targetAssetId: other },
      { ...base, targetLevel: "light" as const },
      { ...base, provenance: "local_camera" as const },
    ])
      expect(() =>
        applyCommand(session, { type: "checkpoint", actionId, measurement }),
      ).toThrow();
  });
  it("offers adaptation only after two reported low-gain passes toward the same target", async () => {
    let session = applyCommand(await ready(), { type: "start" });
    const actionId = currentAction(session)!.id;
    const first = measured(session.activePlan!.previewAsset!.id);
    session = applyCommand(session, {
      type: "checkpoint",
      actionId,
      measurement: first,
    });
    expect(stalledCheckpoint(session, actionId)).toBe(false);
    session = applyCommand(session, {
      type: "checkpoint",
      actionId,
      measurement: { ...first, progress: 0.42 },
    });
    expect(stalledCheckpoint(session, actionId)).toBe(true);
    session.observations[1].measurement!.targetAssetId =
      "different-denominator";
    expect(stalledCheckpoint(session, actionId)).toBe(false);
    session.observations[1].measurement!.targetAssetId = first.targetAssetId;
    session.observations[1].measurement!.reportedPass = false;
    expect(stalledCheckpoint(session, actionId)).toBe(false);
    expect(
      checkpointGuidance(
        { ...first, verdict: "at_target" },
        currentAction(session)!,
      ),
    ).not.toMatch(/more color|another pass/i);
    expect(
      checkpointGuidance(
        {
          ...first,
          verdict: "insufficient",
          progress: null,
          reason: "Return to the original angle.",
        },
        currentAction(session)!,
      ),
    ).toBe("Return to the original angle.");
  });
  it("dismisses an old stall after a new verdict or a changed stopping point", async () => {
    let session = applyCommand(await ready(), { type: "start" });
    const actionId = currentAction(session)!.id;
    const first = measured(session.activePlan!.previewAsset!.id);
    for (const progress of [0.32, 0.34])
      session = applyCommand(session, {
        type: "checkpoint",
        actionId,
        measurement: { ...first, progress },
      });
    expect(stalledCheckpoint(session, actionId)).toBe(true);
    const previous = structuredClone(session);
    for (const verdict of ["at_target", "over", "insufficient"] as const) {
      const next = applyCommand(previous, {
        type: "checkpoint",
        actionId,
        measurement: {
          ...first,
          verdict,
          progress: verdict === "insufficient" ? null : 1,
          reportedPass: false,
        },
      });
      expect(stalledCheckpoint(next, actionId)).toBe(false);
    }
    session = applyCommand(previous, {
      type: "select_preview_level",
      candidateId: previous.activePlan!.id,
      level: "light",
    });
    expect(stalledCheckpoint(session, actionId)).toBe(false);
  });
  it("binds remembered pixels to the exact persisted measurement", () => {
    const saved = measured("same-target");
    expect(sameStoredMeasurement(saved, structuredClone(saved))).toBe(true);
    for (const changed of [
      { elapsedMs: saved.elapsedMs + 1 },
      { progress: 0.7 },
      { targetLevel: "light" as const },
      { reportedPass: false },
      { targetAssetId: "other-target" },
    ])
      expect(sameStoredMeasurement(saved, { ...saved, ...changed })).toBe(
        false,
      );
  });
});
