import { describe, expect, it } from "vitest";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import type {
  SessionCommand,
  StudioAsset,
  StudioSession,
} from "../src/lib/contracts";
import {
  applyCommand,
  createSession,
  currentAction,
  DomainError,
} from "../src/lib/planner";

const assessment = {
  satisfaction: "yes",
  comfort: "comfortable",
  assistance: "none",
  note: "User report",
} as const;
function start(mode: "sample" | "personal" = "personal"): StudioSession {
  let session = createSession(
    { ...structuredClone(SAMPLE_SETUP), mode, consent: mode === "personal" },
    "test-session",
    "2026-10-31T00:00:00.000Z",
  );
  session = applyCommand(session, {
    type: "approve_candidate",
    candidateId: session.candidates.find((plan) => plan.routeId === "tap")!.id,
  });
  return applyCommand(session, { type: "start" });
}
function completeCurrent(session: StudioSession): StudioSession {
  return applyCommand(session, {
    type: "complete_action",
    actionId: currentAction(session)!.id,
  });
}
function completeAll(session: StudioSession): StudioSession {
  while (currentAction(session)) session = completeCurrent(session);
  return session;
}
function image(
  purpose: StudioAsset["purpose"],
  id: string = purpose,
): StudioAsset {
  return {
    id,
    purpose,
    url: `/api/assets/${id}`,
    provenance: "actual_capture",
    createdAt: "2026-10-31T00:00:00.000Z",
    width: 800,
    height: 1000,
  };
}
function attachFinal(session: StudioSession): StudioSession {
  return applyCommand(session, { type: "attach_asset", asset: image("final") });
}

describe("physical-state transition invariants", () => {
  it.each(["sample", "personal"] as const)(
    "advances both %s steps by explicit confirmation without requesting or inventing a measurement",
    (mode) => {
      const first = start(mode);
      const originalActions = JSON.stringify(first.activePlan!.actions);
      expect(first.observations).toEqual([]);
      const second = completeCurrent(first);
      expect(second.stage).toBe("applying");
      expect(currentAction(second)?.region).toBe("right_cheek");
      expect(second.completedActionIds).toEqual([
        first.activePlan!.actions[0].id,
      ]);
      expect(second.events.at(-1)).toMatchObject({
        actionId: first.activePlan!.actions[0].id,
        provenance: "user_confirmed",
      });
      expect(second.observations).toEqual([]);
      const review = completeCurrent(second);
      expect(review.stage).toBe("reviewing");
      expect(review.completedActionIds).toEqual(
        first.activePlan!.actions.map((action) => action.id),
      );
      expect(review.observations).toEqual([]);
      expect(review.outcome).toBeUndefined();
      expect(JSON.stringify(review.activePlan!.actions)).toBe(originalActions);
    },
  );

  it("uses immutable snapshots, one revision per accepted command and only the active action", () => {
    const session = start();
    const snapshot = structuredClone(session);
    expect(() =>
      applyCommand(session, {
        type: "complete_action",
        actionId: session.activePlan!.actions[1].id,
      }),
    ).toThrow(DomainError);
    const next = completeCurrent(session);
    expect(session).toEqual(snapshot);
    expect(next.revision).toBe(session.revision + 1);
    expect(next.events).toHaveLength(session.events.length + 1);
    expect(() =>
      applyCommand(next, {
        type: "complete_action",
        actionId: session.activePlan!.actions[0].id,
      }),
    ).toThrow(DomainError);
  });

  it("keeps evidence abstention separate from a user's confirmation", () => {
    let session = start();
    const actionId = currentAction(session)!.id;
    session = applyCommand(session, { type: "checkpoint", actionId });
    expect(session.observations[0].state).toBe("insufficient_evidence");
    session = applyCommand(session, {
      type: "attach_asset",
      asset: image("checkpoint"),
    });
    session = applyCommand(session, {
      type: "checkpoint",
      actionId,
      assetId: "checkpoint",
    });
    expect(session.observations[1].state).toBe("unsupported_action");
    session = completeCurrent(session);
    expect(session.completedActionIds).toContain(actionId);
    expect(
      session.observations.map((observation) => observation.state),
    ).toEqual(["insufficient_evidence", "unsupported_action"]);
  });

  it("requires an explicit physical-state confirmation after a pause", () => {
    let session = applyCommand(start(), { type: "pause" });
    expect(session.resumeRequired).toBe(true);
    expect(() =>
      applyCommand(session, { type: "resume", confirmedPhysicalState: false }),
    ).toThrow(DomainError);
    session = applyCommand(session, {
      type: "resume",
      confirmedPhysicalState: true,
    });
    expect(session.stage).toBe("applying");
    expect(session.resumeRequired).toBe(false);
  });

  it("repairs only remaining work, preserves completed action bytes and avoids the difficult motion", () => {
    let session = completeCurrent(start());
    const applied = structuredClone(session.activePlan!.actions[0]);
    const originalRecipe = structuredClone(session.activePlan!.recipe);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "sweep",
    });
    expect(session.stage).toBe("adapting");
    expect(session.preferences.movements.tapping).toBe("avoid");
    expect(session.activePlan!.actions[0]).toEqual(applied);
    const proposal = session.adaptation!;
    expect(proposal.candidate.actions[0]).toEqual(applied);
    expect(proposal.candidate.actions[1]).toMatchObject({
      motion: "blending",
      tool: "wide_brush",
      product: "powder_blush",
      dependsOn: [applied.id],
    });
    expect(proposal.candidate.recipe).not.toEqual(originalRecipe);
    expect(proposal.candidate.previewAsset).toBeUndefined();
    expect(proposal.productChangeNote).toContain("cream blush");
    expect(proposal.productChangeNote).toContain("may look different");
    expect(() =>
      applyCommand(session, { type: "accept_adaptation", proposalId: "stale" }),
    ).toThrow(DomainError);
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: proposal.id,
    });
    expect(session.stage).toBe("paused");
    session = applyCommand(session, {
      type: "resume",
      confirmedPhysicalState: true,
    });
    session = completeCurrent(session);
    expect(session.completedActionIds[0]).toBe(applied.id);
    expect(session.goalChanged).toBe(false);
    session = attachFinal(session);
    session = applyCommand(session, {
      type: "finish",
      ...assessment,
      finalAssetId: "final",
    });
    expect(session.outcome?.classification).toBe("original_completed");
  });

  it("does not silently unavoid a reported movement when a repair is declined or unavailable", () => {
    let session = applyCommand(start(), {
      type: "propose_adaptation",
      reason: "movement",
    });
    const active = structuredClone(session.activePlan);
    session = applyCommand(session, { type: "decline_adaptation" });
    expect(session.preferences.movements.tapping).toBe("avoid");
    expect(session.activePlan).toEqual(active);
    expect(() =>
      applyCommand(session, { type: "resume", confirmedPhysicalState: true }),
    ).toThrow(DomainError);
    const input = structuredClone(SAMPLE_SETUP);
    input.tools = ["fingertips"];
    let noAlternative = createSession(input, "no-alternative");
    noAlternative = applyCommand(noAlternative, {
      type: "approve_candidate",
      candidateId: noAlternative.candidates[0].id,
    });
    noAlternative = applyCommand(noAlternative, { type: "start" });
    noAlternative = applyCommand(noAlternative, {
      type: "propose_adaptation",
      reason: "movement",
    });
    expect(noAlternative.stage).toBe("paused");
    expect(noAlternative.adaptation).toBeUndefined();
    expect(noAlternative.conflicts.length).toBeGreaterThan(0);
    expect(noAlternative.preferences.movements.tapping).toBe("avoid");
  });

  it("repairs a lip-only suffix without rechecking already-applied cheek movements or tools", () => {
    for (const reason of ["movement", "tool"] as const) {
      const input = structuredClone(SAMPLE_SETUP);
      input.includeLips = true;
      input.tools = ["fingertips", "lip_brush"];
      input.products = ["cream_blush", "lip_color"];
      let session = createSession(input, `lip-repair-${reason}`);
      session = applyCommand(session, {
        type: "approve_candidate",
        candidateId: session.candidates[0].id,
      });
      session = applyCommand(session, { type: "start" });
      session = completeCurrent(completeCurrent(session));
      const cheeks = structuredClone(session.activePlan!.actions.slice(0, 2));
      expect(currentAction(session)).toMatchObject({
        region: "lips",
        tool: "fingertips",
      });
      session = applyCommand(session, { type: "propose_adaptation", reason });
      expect(session.stage).toBe("adapting");
      expect(session.adaptation!.candidate.actions.slice(0, 2)).toEqual(cheeks);
      expect(session.adaptation!.candidate.actions[2]).toMatchObject({
        tool: "lip_brush",
        motion: "short_strokes",
      });
    }
  });

  it("selects a replacement baseline before approval and discards preview identities from the old source", () => {
    let session = createSession(
      structuredClone(SAMPLE_SETUP),
      "baseline-change",
    );
    session = applyCommand(session, {
      type: "attach_asset",
      asset: image("baseline", "first"),
    });
    session.candidates[0].previewStatus = "processing";
    session.candidates[0].previewJobId = "old-job";
    session = applyCommand(session, {
      type: "attach_asset",
      asset: image("baseline", "second"),
    });
    expect(session.sourceAssetId).toBe("second");
    expect(
      session.candidates.every(
        (candidate) =>
          candidate.previewStatus === "not_requested" &&
          !candidate.previewJobId,
      ),
    ).toBe(true);
    expect(session.assets.map((asset) => asset.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("changes a goal only on acceptance and never implies removal of applied product", () => {
    let session = start();
    const target = structuredClone(session.activePlan);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "softer",
    });
    expect(session.activePlan).toEqual(target);
    expect(session.goalChanged).toBe(false);
    expect(session.adaptation!.candidate.recipe).not.toEqual(target!.recipe);
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: session.adaptation!.id,
    });
    expect(session.goalChanged).toBe(true);
    session = applyCommand(session, {
      type: "resume",
      confirmedPhysicalState: true,
    });
    session = completeAll(session);
    session = attachFinal(session);
    expect(
      applyCommand(session, {
        type: "finish",
        ...assessment,
        finalAssetId: "final",
      }).outcome?.classification,
    ).toBe("adapted_completed");
    let applied = completeCurrent(start());
    const physical = structuredClone(applied.activePlan!.actions[0]);
    applied = applyCommand(applied, {
      type: "propose_adaptation",
      reason: "softer",
    });
    expect(applied.adaptation!.candidate.selectedPreviewVariantId).toBe(
      "light",
    );
    expect(applied.adaptation!.explanation).toContain("remaining area");
    expect(applied.adaptation!.candidate.actions[0]).toEqual(physical);
    expect(applied.activePlan!.actions[0]).toEqual(physical);
    expect(applied.goalChanged).toBe(false);
  });

  it("classifies complete, accepted-partial, stopped and unassessed sample outcomes distinctly", () => {
    const complete = completeAll(start());
    expect(() =>
      applyCommand(complete, { type: "finish", ...assessment }),
    ).toThrow(DomainError);
    expect(
      applyCommand(attachFinal(complete), {
        type: "finish",
        ...assessment,
        finalAssetId: "final",
      }).outcome?.classification,
    ).toBe("original_completed");
    const partial = applyCommand(start(), { type: "review" });
    expect(
      applyCommand(partial, { type: "finish", ...assessment }).outcome
        ?.classification,
    ).toBe("accepted_partial");
    expect(
      applyCommand(complete, {
        type: "finish",
        ...assessment,
        satisfaction: "partly",
      }).outcome?.classification,
    ).toBe("accepted_partial");
    const stopped = applyCommand(start(), { type: "stop" });
    expect(stopped.outcome).toMatchObject({
      classification: "stopped",
      comfort: "not_assessed",
      assistance: "not_assessed",
    });
    const sample = applyCommand(completeAll(start("sample")), {
      type: "finish",
      ...assessment,
    });
    expect(sample.stage).toBe("completed");
    expect(sample.outcome).toBeUndefined();
    expect(sample.events.at(-1)?.type).toBe("sample_walkthrough_finished");
  });

  it("prevents generated/sample finals, provenance replacement and terminal mutations", () => {
    const session = start();
    for (const provenance of [
      "virtual_preview",
      "synthetic_inspiration",
    ] as const) {
      expect(() =>
        applyCommand(session, {
          type: "attach_asset",
          asset: { ...image("final"), provenance },
        }),
      ).toThrow(DomainError);
    }
    const checkpoint = applyCommand(session, {
      type: "attach_asset",
      asset: image("checkpoint"),
    });
    expect(() =>
      applyCommand(checkpoint, {
        type: "attach_asset",
        asset: { ...image("checkpoint"), url: "/replacement.jpg" },
      }),
    ).toThrow(DomainError);
    expect(() =>
      applyCommand(session, { type: "attach_asset", asset: image("baseline") }),
    ).toThrow(DomainError);
    const terminal = applyCommand(attachFinal(completeAll(session)), {
      type: "finish",
      ...assessment,
      finalAssetId: "final",
    });
    for (const command of [
      { type: "start" },
      { type: "stop" },
      { type: "attach_asset", asset: image("final", "new") },
    ] as SessionCommand[]) {
      expect(() => applyCommand(terminal, command)).toThrow(DomainError);
    }
    expect(applyCommand(terminal, { type: "save_method" }).outcome).toEqual(
      terminal.outcome,
    );
  });
});
