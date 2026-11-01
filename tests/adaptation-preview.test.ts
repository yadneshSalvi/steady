import { describe, expect, it } from "vitest";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "../src/lib/catalog";
import type {
  PreviewLevel,
  SetupInput,
  StudioSession,
} from "../src/lib/contracts";
import {
  applicationPreviewTarget,
  applyCommand,
  createSession,
  currentAction,
} from "../src/lib/planner";
import { measurementSchema } from "../src/lib/server/validation";

function applying(eyes: boolean, level: PreviewLevel = "full") {
  const setup: SetupInput = {
    ...structuredClone(eyes ? EYE_SAMPLE_SETUP : SAMPLE_SETUP),
    mode: "personal",
    consent: true,
  };
  let session = createSession(setup, "personal-adaptation");
  const candidateId = session.candidates[0].id;
  session = applyCommand(session, {
    type: "select_preview_level",
    candidateId,
    level,
  });
  session = applyCommand(session, { type: "approve_candidate", candidateId });
  session = applyCommand(session, { type: "start" });
  const actionId = currentAction(session)!.id;
  session = applyCommand(session, { type: "checkpoint", actionId });
  return applyCommand(session, { type: "complete_action", actionId });
}

function physicalHistory(session: StudioSession) {
  return JSON.stringify({
    actions: session.activePlan!.actions.filter((action) =>
      session.completedActionIds.includes(action.id),
    ),
    completedActionIds: session.completedActionIds,
    observations: session.observations,
  });
}

describe("personal adaptation preview selection", () => {
  it("requests the selected Full eye target before and after accepting the new method", () => {
    let session = applying(true);
    const history = physicalHistory(session);
    const priorEvents = JSON.stringify(session.events);
    const eventCount = session.events.length;
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "shadow",
    });
    const proposal = session.adaptation!;
    expect(proposal.candidate.recipe[1].category).toBe("eye_shadow");
    expect(applicationPreviewTarget(session)).toEqual({
      candidateId: proposal.candidate.id,
      variantId: "full",
    });
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: proposal.id,
    });
    session = applyCommand(session, {
      type: "resume",
      confirmedPhysicalState: true,
    });
    expect(applicationPreviewTarget(session)).toEqual({
      candidateId: session.activePlan!.id,
      variantId: "full",
    });
    expect(physicalHistory(session)).toBe(history);
    expect(JSON.stringify(session.events.slice(0, eventCount))).toBe(
      priorEvents,
    );
  });

  it("keeps an explicitly selected Light target when the eye method changes", () => {
    const previous = applying(true, "light");
    const session = applyCommand(previous, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "shadow",
    });
    expect(applicationPreviewTarget(session)?.variantId).toBe("light");
    expect(session.adaptation!.candidate.recipe).toEqual(
      session.adaptation!.candidate.previewVariants!.find(
        (variant) => variant.id === "light",
      )!.recipe,
    );
    expect(physicalHistory(session)).toBe(physicalHistory(previous));
  });

  it("requests the remaining powder cheek's Build recipe even without a goal change", () => {
    let session = applying(false, "build");
    const history = physicalHistory(session);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "sweep",
    });
    const proposal = session.adaptation!;
    expect(proposal.changesGoal).toBe(false);
    expect(proposal.candidate.actions[1].product).toBe("powder_blush");
    expect(proposal.candidate.recipe[1].palettes).toEqual([
      expect.objectContaining({ texture: "matte", colorIntensity: 45 }),
    ]);
    expect(applicationPreviewTarget(session)).toEqual({
      candidateId: proposal.candidate.id,
      variantId: "build",
    });
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: proposal.id,
    });
    expect(session.goalChanged).toBe(false);
    expect(applicationPreviewTarget(session)).toEqual({
      candidateId: session.activePlan!.id,
      variantId: "build",
    });
    expect(physicalHistory(session)).toBe(history);
  });

  it("still selects Light for an explicit softer proposal", () => {
    const previous = applying(false);
    const session = applyCommand(previous, {
      type: "propose_adaptation",
      reason: "softer",
    });
    expect(session.adaptation!.changesGoal).toBe(true);
    expect(applicationPreviewTarget(session)?.variantId).toBe("light");
    expect(physicalHistory(session)).toBe(physicalHistory(previous));
  });

  it("offers no application target outside personal unfinished application and never mutates input", () => {
    const session = applying(false);
    const original = JSON.stringify(session);
    expect(applicationPreviewTarget(session)?.variantId).toBe("full");
    expect(JSON.stringify(session)).toBe(original);
    for (const stage of [
      "choosing",
      "ready",
      "reviewing",
      "completed",
      "stopped",
    ] as const)
      expect(applicationPreviewTarget({ ...session, stage })).toBeUndefined();
    expect(
      applicationPreviewTarget({ ...session, mode: "sample" }),
    ).toBeUndefined();
    expect(
      applicationPreviewTarget({ ...session, activePlan: undefined }),
    ).toBeUndefined();
    expect(
      applicationPreviewTarget({
        ...session,
        stage: "adapting",
        adaptation: undefined,
      }),
    ).toBeUndefined();
    expect(
      applicationPreviewTarget({
        ...session,
        completedActionIds: session.activePlan!.actions.map(
          (action) => action.id,
        ),
      }),
    ).toBeUndefined();
  });

  it("keeps the exact Full recipe addressable in a legacy save without a ladder", () => {
    const session = applying(false);
    delete session.activePlan!.previewVariants;
    delete session.activePlan!.selectedPreviewVariantId;
    const original = JSON.stringify(session);
    expect(applicationPreviewTarget(session)).toEqual({
      candidateId: session.activePlan!.id,
      variantId: "full",
    });
    expect(JSON.stringify(session)).toBe(original);
  });

  it("accepts versioned measurement geometry while retaining legacy absence", () => {
    const legacy = {
      version: 1,
      region: "left_cheek",
      verdict: "insufficient",
      reason: "Fixture lighting mismatch.",
      progress: null,
      deltaA: null,
      deltaE00: null,
      uniformity: null,
      lagging: null,
      provenance: "local_camera",
      reportedPass: false,
      targetLevel: "full",
      targetAssetId: "target-id",
      elapsedMs: 120,
    };
    expect(measurementSchema.safeParse(legacy).success).toBe(true);
    for (const geometryVersion of ["landmark-polygon-v1", "cheekbone-oval-v2"])
      expect(
        measurementSchema.safeParse({ ...legacy, geometryVersion }).success,
      ).toBe(true);
    expect(
      measurementSchema.safeParse({ ...legacy, geometryVersion: "unknown" })
        .success,
    ).toBe(false);
    expect(
      measurementSchema.safeParse({
        ...legacy,
        sampleCheckpointId: "a".repeat(64),
      }).success,
    ).toBe(true);
    for (const sampleCheckpointId of [
      "A".repeat(64),
      "a".repeat(63),
      "a".repeat(65),
      "https://example.test/checkpoint.png",
    ])
      expect(
        measurementSchema.safeParse({ ...legacy, sampleCheckpointId }).success,
      ).toBe(false);
  });
});
