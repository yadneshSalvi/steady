import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EYE_SAMPLE_SETUP, SAMPLE_SETUP } from "@/lib/catalog";
import type {
  Comfort,
  EyeMethod,
  SetupInput,
  StudioSession,
} from "@/lib/contracts";
import {
  applyCommand,
  createSession,
  currentAction,
  DomainError,
  planCandidates,
  validatePlan,
} from "@/lib/planner";
import { setupSchema, commandSchema } from "@/lib/server/validation";
import {
  EYE_RECIPES,
  makePreviewVariants,
  makeRecipe,
  validateEffects,
} from "@/lib/youcam/recipes";
import patterns from "@/lib/youcam/fixtures/eye-patterns.json";

function setup(): SetupInput {
  return {
    ...structuredClone(EYE_SAMPLE_SETUP),
    mode: "personal",
    consent: true,
  };
}
function start(route: EyeMethod): StudioSession {
  let session = createSession(setup(), `eyes-${route}`);
  session = applyCommand(session, {
    type: "approve_candidate",
    candidateId: session.candidates.find((plan) => plan.routeId === route)!.id,
  });
  return applyCommand(session, { type: "start" });
}
function completeCurrent(session: StudioSession) {
  return applyCommand(session, {
    type: "complete_action",
    actionId: currentAction(session)!.id,
  });
}

describe("Defined eyes domain and physical repair", () => {
  it("offers distinct confirmed fine-liner and low-precision shadow methods", () => {
    const planned = planCandidates(setup());
    expect(planned.conflicts).toEqual([]);
    expect(planned.candidates.map((plan) => plan.routeId)).toEqual([
      "liner",
      "shadow",
    ]);
    for (const candidate of planned.candidates) {
      expect(candidate.actions.map((action) => action.region)).toEqual([
        "left_eye",
        "right_eye",
      ]);
      expect(candidate.actions[1].dependsOn).toEqual([candidate.actions[0].id]);
      expect(candidate.actions[0]).toMatchObject(
        candidate.routeId === "liner"
          ? {
              tool: "liner_pen",
              product: "eye_liner",
              motion: "short_strokes",
              precision: "high",
            }
          : {
              tool: "fingertips",
              product: "eye_shadow",
              motion: "tapping",
              precision: "low",
            },
      );
      expect(
        candidate.actions.every(
          (action) =>
            action.validation === "draft" &&
            action.evidencePolicy === "user_judgment",
        ),
      ).toBe(true);
      expect(candidate.actions[0].instruction).toContain("comfortably closed");
      expect(candidate.actions[0].instruction).toContain("off the waterline");
      const prominent = candidate.actions[0].instruction.split(".")[0];
      expect(prominent).toContain("comfortably closed");
      expect(prominent).toContain("upper lid skin above the lashes");
      expect(prominent).toContain(
        candidate.routeId === "liner" ? "short strokes" : "tap",
      );
      expect(candidate.actions[0].stoppingCue).toContain("off the waterline");
      expect(validatePlan(candidate, setup()).valid).toBe(true);
    }
  });

  it("requires eye-only setup and explicit eye resources at the API boundary", () => {
    expect(setupSchema.safeParse(setup()).success).toBe(true);
    const invalid = { ...setup(), includeLips: true };
    expect(setupSchema.safeParse(invalid).success).toBe(false);
    expect(planCandidates(invalid).conflicts[0].code).toBe("eye_requirements");
    expect(
      planCandidates({ ...setup(), products: ["cream_blush", "lip_color"] })
        .candidates,
    ).toEqual([]);
    expect(
      commandSchema.safeParse({
        type: "propose_adaptation",
        reason: "movement",
        routeId: "shadow",
      }).success,
    ).toBe(true);
  });

  it("checks all 288 relevant eye movement/tool/product combinations", () => {
    const states: Comfort[] = ["comfortable", "avoid", "unknown"];
    const tools = ["liner_pen", "fingertips", "sponge"] as const;
    const products = ["eye_liner", "eye_shadow"] as const;
    let count = 0;
    for (const short of states)
      for (const tap of states)
        for (let toolMask = 0; toolMask < 8; toolMask++)
          for (let productMask = 0; productMask < 4; productMask++) {
            const input = setup();
            input.preferences.movements.short_strokes = short;
            input.preferences.movements.tapping = tap;
            input.tools = tools.filter((_, index) => toolMask & (2 ** index));
            input.products = products.filter(
              (_, index) => productMask & (2 ** index),
            );
            const expected = [];
            if (
              short === "comfortable" &&
              input.tools.includes("liner_pen") &&
              input.products.includes("eye_liner")
            )
              expected.push("liner");
            if (
              tap === "comfortable" &&
              (input.tools.includes("fingertips") ||
                input.tools.includes("sponge")) &&
              input.products.includes("eye_shadow")
            )
              expected.push("shadow");
            const planned = planCandidates(input);
            expect(planned.candidates.map((plan) => plan.routeId)).toEqual(
              expected,
            );
            for (const candidate of planned.candidates)
              expect(validatePlan(candidate, input).valid).toBe(true);
            if (!expected.length)
              expect(planned.conflicts.length).toBeGreaterThan(0);
            count++;
          }
    expect(count).toBe(288);
  });

  it("changes liner to shadow only on remaining work and marks the accepted appearance adaptation", () => {
    let session = completeCurrent(start("liner"));
    const applied = structuredClone(session.activePlan!.actions[0]);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
      routeId: "shadow",
    });
    const proposal = session.adaptation!;
    expect(session.stage).toBe("adapting");
    expect(session.goalChanged).toBe(false);
    expect(proposal.changesGoal).toBe(true);
    expect(proposal.preservedActionIds).toEqual([applied.id]);
    expect(proposal.candidate.actions[0]).toEqual(applied);
    expect(proposal.candidate.actions[1]).toMatchObject({
      region: "right_eye",
      product: "eye_shadow",
      motion: "tapping",
      precision: "low",
      dependsOn: [applied.id],
    });
    expect(proposal.candidate.selectedPreviewVariantId).toBe("full");
    expect(proposal.candidate.recipe[1].category).toBe("eye_shadow");
    expect(proposal.explanation).toContain("fine upper line");
    expect(proposal.productChangeNote).toContain("two sides may differ");
    expect(session.preferences.movements.short_strokes).toBe("avoid");
    session = applyCommand(session, {
      type: "accept_adaptation",
      proposalId: proposal.id,
    });
    expect(session.goalChanged).toBe(true);
    expect(session.activePlan!.actions[0]).toEqual(applied);
    session = applyCommand(session, {
      type: "resume",
      confirmedPhysicalState: true,
    });
    session = completeCurrent(session);
    session = applyCommand(session, {
      type: "attach_asset",
      asset: {
        id: "unit-final",
        purpose: "final",
        provenance: "actual_capture",
        url: "/api/assets/unit-final",
        width: 640,
        height: 800,
        createdAt: "2026-10-31T00:00:00.000Z",
      },
    });
    session = applyCommand(session, {
      type: "finish",
      satisfaction: "yes",
      comfort: "comfortable",
      assistance: "none",
      note: "Synthetic domain test only",
      finalAssetId: "unit-final",
    });
    expect(session.outcome?.classification).toBe("adapted_completed");
    expect(session.activePlan!.actions[0]).toEqual(applied);
  });

  it("prioritizes the same shadow product during a tool-only repair", () => {
    let session = completeCurrent(start("shadow"));
    const applied = structuredClone(session.activePlan!.actions[0]);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "tool",
    });
    expect(session.adaptation!.candidate.actions[0]).toEqual(applied);
    expect(session.adaptation!.candidate.actions[1]).toMatchObject({
      product: "eye_shadow",
      tool: "sponge",
      motion: "tapping",
    });
    expect(session.adaptation!.changesGoal).toBe(false);
    expect(session.adaptation!.productChangeNote).toBeUndefined();
  });

  it("keeps the reported movement avoided when no eye alternative is available", () => {
    const input = setup();
    input.products = ["eye_liner"];
    let session = createSession(input, "no-eye-shadow");
    session = applyCommand(session, {
      type: "approve_candidate",
      candidateId: session.candidates[0].id,
    });
    session = completeCurrent(applyCommand(session, { type: "start" }));
    const applied = structuredClone(session.activePlan!.actions[0]);
    session = applyCommand(session, {
      type: "propose_adaptation",
      reason: "movement",
    });
    expect(session.stage).toBe("paused");
    expect(session.adaptation).toBeUndefined();
    expect(session.preferences.movements.short_strokes).toBe("avoid");
    expect(session.activePlan!.actions[0]).toEqual(applied);
    expect(session.conflicts.length).toBeGreaterThan(0);
  });

  it("rejects altered completed eyes and an unfinished method/target mismatch", () => {
    const input = setup();
    const original = planCandidates(input).candidates[0];
    const changed = structuredClone(original);
    changed.actions[0].precision = "low";
    expect(validatePlan(changed, input, [original.actions[0]]).valid).toBe(
      false,
    );
    const wrongTarget = structuredClone(original);
    wrongTarget.routeId = "shadow";
    wrongTarget.recipe = makeRecipe("eyes", "shadow", false);
    expect(validatePlan(wrongTarget, input).valid).toBe(false);
    const cheek = planCandidates(structuredClone(SAMPLE_SETUP)).candidates[0];
    cheek.recipe = makeRecipe("eyes", "liner", false);
    expect(validatePlan(cheek, SAMPLE_SETUP).valid).toBe(false);
  });

  it("offers only available Light and Full eye stopping points", () => {
    let session = createSession(setup(), "eye-stops");
    const candidate = session.candidates[0];
    expect(candidate.previewVariants?.map((variant) => variant.id)).toEqual([
      "light",
      "full",
    ]);
    expect(() =>
      applyCommand(session, {
        type: "select_preview_level",
        candidateId: candidate.id,
        level: "build",
      }),
    ).toThrow(DomainError);
    session = applyCommand(session, {
      type: "select_preview_level",
      candidateId: candidate.id,
      level: "light",
    });
    expect(session.candidates[0].selectedPreviewVariantId).toBe("light");
    expect(
      makePreviewVariants("rose", "tap", false).map((variant) => variant.id),
    ).toEqual(["light", "build", "full"]);
  });
});

describe("official eye recipe and catalog integrity", () => {
  it("pins the actual single-color catalog labels and excerpt checksum", () => {
    expect(patterns.metadata.provenance).toBe(
      "sanitized_official_catalog_excerpt",
    );
    expect(
      createHash("sha256")
        .update(JSON.stringify(patterns.patterns))
        .digest("hex"),
    ).toBe(patterns.metadata.excerptSha256);
    expect(patterns.patterns.eye_liner).toMatchObject({
      label: "HalfRim19",
      colorNum: 1,
      type: "Upper only",
    });
    expect(patterns.patterns.eye_shadow).toMatchObject({
      label: "1color1",
      colorNum: 1,
    });
    expect(EYE_RECIPES.liner.pattern).toBe(patterns.patterns.eye_liner.label);
    expect(EYE_RECIPES.shadow.pattern).toBe(patterns.patterns.eye_shadow.label);
  });

  it.each(["liner", "shadow"] as const)(
    "uses the frozen %s recipe with explicit zero smoothing",
    (route) => {
      for (const intensity of [25, 65] as const) {
        const recipe = makeRecipe("eyes", route, false, intensity);
        expect(recipe).toEqual([
          {
            category: "skin_smooth",
            skinSmoothStrength: 0,
            skinSmoothColorIntensity: 0,
          },
          {
            category: route === "liner" ? "eye_liner" : "eye_shadow",
            pattern: { name: route === "liner" ? "HalfRim19" : "1color1" },
            palettes: [
              {
                color: route === "liner" ? "#3A2B2B" : "#6B4A40",
                texture: "matte",
                colorIntensity: intensity,
              },
            ],
          },
        ]);
        expect(validateEffects(recipe)).toEqual(recipe);
      }
    },
  );

  it("rejects the failed shadow alias, mixed effects, implicit smoothing, and cross-goal routes", () => {
    const liner = makeRecipe("eyes", "liner", false);
    const shadow = makeRecipe("eyes", "shadow", false);
    expect(() =>
      validateEffects([
        shadow[0],
        { ...shadow[1], pattern: { name: "Shadow1color1" } },
      ]),
    ).toThrow();
    expect(() => validateEffects([liner[0], liner[1], shadow[1]])).toThrow();
    expect(() =>
      validateEffects([
        liner[0],
        liner[1],
        makeRecipe("rose", "tap", false)[1],
      ]),
    ).toThrow();
    expect(() => validateEffects(shadow.slice(1))).toThrow();
    expect(() => makeRecipe("eyes", "liner", true)).toThrow();
    expect(() => makeRecipe("eyes", "tap", false)).toThrow();
    expect(() => makeRecipe("rose", "liner", false)).toThrow();
  });
});
