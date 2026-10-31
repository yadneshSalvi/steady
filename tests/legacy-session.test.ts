import { describe, expect, it } from "vitest";
import frozen from "./fixtures/pre-review-sessions.json";
import type { StudioSession } from "../src/lib/contracts";
import {
  applyCommand,
  currentAction,
  TECHNIQUES,
  validatePlan,
} from "../src/lib/planner";

describe("pre-review session compatibility", () => {
  it("keeps every shipped version1 technique byte-for-byte equivalent", () => {
    expect(frozen.sourceCommit).toBe("d8ef475");
    expect(frozen.techniques).toHaveLength(5);
    for (const previous of frozen.techniques) {
      const current = TECHNIQUES.find(
        (technique) => technique.id === previous.id,
      )!;
      expect(JSON.parse(JSON.stringify(current))).toEqual(previous);
      const instruction = frozen.instructions.find(
        (item) => item.id === previous.id,
      )!;
      for (const region of ["left_cheek", "right_cheek", "lips"] as const)
        expect(current.instruction(region)).toBe(instruction[region]);
    }
  });
  for (const saved of frozen.sessions) {
    it(`continues the original ${saved.activePlan!.routeId} ${saved.includeLips ? "cheek/lip" : "cheek"} ${saved.stage} session without rewriting confirmed work`, () => {
      let session = structuredClone(saved) as unknown as StudioSession;
      const confirmed = session.activePlan!.actions.filter((action) =>
        session.completedActionIds.includes(action.id),
      );
      const sourceRecipe = structuredClone(session.activePlan!.recipe);
      expect(
        validatePlan(session.activePlan!, { ...session, consent: true }).valid,
      ).toBe(true);
      session = applyCommand(
        session,
        session.stage === "paused"
          ? { type: "resume", confirmedPhysicalState: true }
          : { type: "start" },
      );
      while (currentAction(session)) {
        const actionId = currentAction(session)!.id;
        session = applyCommand(session, { type: "checkpoint", actionId });
        session = applyCommand(session, { type: "complete_action", actionId });
      }
      expect(
        session.activePlan!.actions.filter((action) =>
          confirmed.some((previous) => previous.id === action.id),
        ),
      ).toEqual(confirmed);
      expect(session.activePlan!.recipe).toEqual(sourceRecipe);
      expect(session.completedActionIds).toHaveLength(
        session.activePlan!.actions.length,
      );
      expect(session.outcome).toBeUndefined();
    });
  }
});
