import { describe, expect, it } from "vitest";
import { SAMPLE_SETUP } from "@/lib/catalog";
import type { StoredMeasurement, StudioSession } from "@/lib/contracts";
import { createSession } from "@/lib/planner";
import {
  sameStoredMeasurement,
  stalledCheckpoint,
} from "@/lib/vision/measurement-guidance";

function measured(
  overrides: Partial<StoredMeasurement> = {},
): StoredMeasurement {
  return {
    version: 1,
    region: "left_cheek",
    verdict: "build",
    progress: 0.4,
    deltaA: 2,
    deltaE00: 3,
    uniformity: 0.6,
    lagging: "outer",
    provenance: "simulated",
    reportedPass: true,
    targetLevel: "full",
    targetAssetId: "target",
    elapsedMs: 40,
    ...overrides,
  };
}
function sessionWith(
  first: StoredMeasurement,
  second: StoredMeasurement,
): StudioSession {
  const session = createSession(
    structuredClone(SAMPLE_SETUP),
    "geometry-history",
  );
  session.activePlan = structuredClone(session.candidates[0]);
  session.activePlan.previewAsset = {
    id: "target",
    url: "/fixture.png",
    provenance: "virtual_preview",
    purpose: "preview",
    width: 1024,
    height: 1280,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  session.stage = "applying";
  const action = session.activePlan.actions[0];
  session.observations = [first, second].map((measurement, index) => ({
    id: `observation-${index}`,
    actionId: action.id,
    actionSnapshot: action,
    state: "measured_checkpoint",
    reason: "Synthetic test observation",
    method: "local_color_v1",
    measurement,
    createdAt: "2026-11-01T00:00:00.000Z",
  }));
  return session;
}

describe("measurement geometry and recorded-frame identity", () => {
  it("compares both geometry scope and exact simulated checkpoint identity", () => {
    const base = measured({
      geometryVersion: "cheekbone-oval-v2",
      sampleCheckpointId: "recording-a",
    });
    expect(sameStoredMeasurement(base, { ...base })).toBe(true);
    expect(
      sameStoredMeasurement(base, {
        ...base,
        geometryVersion: "landmark-polygon-v1",
      }),
    ).toBe(false);
    expect(
      sameStoredMeasurement(base, {
        ...base,
        sampleCheckpointId: "recording-b",
      }),
    ).toBe(false);
    expect(sameStoredMeasurement(measured(), measured())).toBe(true);
  });

  it("does not call a change between masks stalled progress", () => {
    const session = sessionWith(
      measured({ geometryVersion: "landmark-polygon-v1" }),
      measured({ progress: 0.42, geometryVersion: "cheekbone-oval-v2" }),
    );
    expect(stalledCheckpoint(session, session.activePlan!.actions[0].id)).toBe(
      false,
    );
  });

  it.each([
    ["first-pass-a", "first-pass-b"],
    ["first-pass-a", undefined],
    [undefined, "first-pass-a"],
  ])(
    "does not compare distinct recorded frames %s and %s as a stall",
    (firstId, secondId) => {
      const session = sessionWith(
        measured({
          geometryVersion: "cheekbone-oval-v2",
          sampleCheckpointId: firstId,
        }),
        measured({
          geometryVersion: "cheekbone-oval-v2",
          sampleCheckpointId: secondId,
          progress: 0.42,
        }),
      );
      expect(
        stalledCheckpoint(session, session.activePlan!.actions[0].id),
      ).toBe(false);
    },
  );

  it("retains repeated-pass detection on the same recorded frame", () => {
    const session = sessionWith(
      measured({
        geometryVersion: "cheekbone-oval-v2",
        sampleCheckpointId: "first-pass-a",
      }),
      measured({
        geometryVersion: "cheekbone-oval-v2",
        sampleCheckpointId: "first-pass-a",
        progress: 0.42,
      }),
    );
    expect(stalledCheckpoint(session, session.activePlan!.actions[0].id)).toBe(
      true,
    );
  });

  it("retains consecutive-pass checks within one new or legacy geometry scope", () => {
    for (const geometryVersion of [
      undefined,
      "landmark-polygon-v1",
      "cheekbone-oval-v2",
    ] as const) {
      const session = sessionWith(
        measured({ geometryVersion }),
        measured({ geometryVersion, progress: 0.42 }),
      );
      expect(
        stalledCheckpoint(session, session.activePlan!.actions[0].id),
      ).toBe(true);
    }
  });
});
