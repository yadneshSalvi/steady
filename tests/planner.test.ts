import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, SAMPLE_SETUP } from "../src/lib/catalog";
import type {
  Comfort,
  Motion,
  ProductId,
  SetupInput,
  ToolId,
} from "../src/lib/contracts";
import { planCandidates, validatePlan } from "../src/lib/planner";

function setup(): SetupInput {
  return structuredClone(SAMPLE_SETUP);
}

describe("finite method compiler", () => {
  it("starts real preferences unknown and returns actionable conflicts instead of assuming ability", () => {
    const input = {
      ...setup(),
      preferences: structuredClone(DEFAULT_PREFERENCES),
    };
    const planned = planCandidates(input);
    expect(planned.candidates).toHaveLength(0);
    expect(
      planned.conflicts.some(
        (conflict) => conflict.code === "motion_unconfirmed",
      ),
    ).toBe(true);
    expect(
      planned.conflicts.every((conflict) => conflict.resolution.length > 0),
    ).toBe(true);
  });

  it("enumerates genuinely different confirmed methods with draft evidence status", () => {
    const planned = planCandidates(setup());
    expect(planned.conflicts).toEqual([]);
    expect(planned.candidates.map((plan) => plan.routeId)).toEqual([
      "tap",
      "sweep",
      "sponge",
    ]);
    expect(
      new Set(
        planned.candidates.map(
          (plan) =>
            `${plan.actions[0].motion}/${plan.actions[0].tool}/${plan.actions[0].product}`,
        ),
      ).size,
    ).toBe(3);
    for (const plan of planned.candidates) {
      expect(plan.actions.map((action) => action.region)).toEqual([
        "left_cheek",
        "right_cheek",
      ]);
      expect(
        plan.actions.every(
          (action) =>
            action.validation === "draft" &&
            action.evidencePolicy === "user_judgment",
        ),
      ).toBe(true);
      expect(plan.previewStatus).toBe("not_requested");
      expect(plan.previewAsset).toBeUndefined();
    }
  });

  it("checks all 6,912 tool/product/movement/lips combinations without relaxing a hard constraint", () => {
    const tools: ToolId[] = ["fingertips", "sponge", "wide_brush", "lip_brush"];
    const products: ProductId[] = ["cream_blush", "powder_blush", "lip_color"];
    const states: Comfort[] = ["comfortable", "avoid", "unknown"];
    const motions: Motion[] = ["tapping", "blending", "short_strokes"];
    let cases = 0;
    for (let movementMask = 0; movementMask < 27; movementMask++) {
      const preferences = structuredClone(DEFAULT_PREFERENCES);
      motions.forEach((motion, index) => {
        preferences.movements[motion] =
          states[Math.floor(movementMask / 3 ** index) % 3];
      });
      for (let toolMask = 0; toolMask < 16; toolMask++)
        for (let productMask = 0; productMask < 8; productMask++)
          for (const includeLips of [false, true]) {
            const input: SetupInput = {
              ...setup(),
              preferences,
              includeLips,
              tools: tools.filter((_, index) => toolMask & (2 ** index)),
              products: products.filter(
                (_, index) => productMask & (2 ** index),
              ),
            };
            const planned = planCandidates(input);
            const tap = preferences.movements.tapping === "comfortable";
            const blend = preferences.movements.blending === "comfortable";
            const short = preferences.movements.short_strokes === "comfortable";
            const lipAllowed =
              !includeLips ||
              (input.products.includes("lip_color") &&
                ((tap && input.tools.includes("fingertips")) ||
                  (short && input.tools.includes("lip_brush"))));
            const expectedCount = lipAllowed
              ? Number(
                  tap &&
                    input.tools.includes("fingertips") &&
                    input.products.includes("cream_blush"),
                ) +
                Number(
                  tap &&
                    input.tools.includes("sponge") &&
                    input.products.includes("cream_blush"),
                ) +
                Number(
                  blend &&
                    input.tools.includes("wide_brush") &&
                    input.products.includes("powder_blush"),
                ) +
                Number(
                  blend &&
                    input.tools.includes("wide_brush") &&
                    input.products.includes("cream_blush"),
                )
              : 0;
            expect(planned.candidates.length).toBe(Math.min(3, expectedCount));
            if (!expectedCount)
              expect(planned.conflicts.length).toBeGreaterThan(0);
            for (const plan of planned.candidates) {
              expect(validatePlan(plan, input).valid).toBe(true);
              for (const action of plan.actions) {
                expect(input.preferences.movements[action.motion]).toBe(
                  "comfortable",
                );
                expect(input.tools).toContain(action.tool);
                expect(input.products).toContain(action.product);
              }
            }
            cases++;
          }
    }
    expect(cases).toBe(6912);
  }, 30_000);

  it("describes the cream brush's own movement and supplies when it is offered beside fingertips", () => {
    const input = setup();
    input.tools = ["fingertips", "wide_brush"];
    input.products = ["cream_blush"];
    input.preferences.movements = {
      tapping: "comfortable",
      blending: "comfortable",
      short_strokes: "unknown",
    };
    const candidates = planCandidates(input).candidates;
    expect(candidates.map((candidate) => candidate.routeId)).toEqual([
      "tap",
      "buff",
    ]);
    const brush = candidates[1];
    expect(brush.name).toBe("Brush-blended cream");
    expect(brush.tagline).toBe("Cream blush · broad brush blending");
    expect(brush.tools).toEqual(["wide_brush"]);
    expect(brush.tradeoffs).toEqual([
      "Uses a wide brush to blend cream blush.",
      "Requires cream blush and a wide brush suitable for cream products.",
    ]);
    expect(
      brush.actions.every(
        (action) =>
          action.tool === "wide_brush" &&
          action.motion === "blending" &&
          action.product === "cream_blush",
      ),
    ).toBe(true);
  });

  it("requires lip product and an independently compatible lip tool/motion", () => {
    const input = setup();
    input.includeLips = true;
    input.tools = ["wide_brush"];
    input.preferences.movements.tapping = "avoid";
    expect(planCandidates(input).candidates).toEqual([]);
    input.tools.push("lip_brush");
    const plan = planCandidates(input).candidates[0];
    expect(plan.actions.at(-1)).toMatchObject({
      region: "lips",
      tool: "lip_brush",
      product: "lip_color",
      motion: "short_strokes",
    });
    input.products = ["powder_blush"];
    expect(
      planCandidates(input).conflicts.some(
        (conflict) => conflict.code === "lip_requirements",
      ),
    ).toBe(true);
  });

  it("independently rejects invented instructions, changed prerequisites, bad DAGs, smoothing and physical rewrites", () => {
    const input = setup();
    const original = planCandidates(input).candidates[0];
    const mutations = [
      (plan: typeof original) => {
        plan.actions[0].instruction = "Invent a procedure";
      },
      (plan: typeof original) => {
        plan.actions[0].tool = "lip_brush";
      },
      (plan: typeof original) => {
        plan.actions[0].dependsOn = [plan.actions[1].id];
      },
      (plan: typeof original) => {
        plan.actions[1].id = plan.actions[0].id;
      },
      (plan: typeof original) => {
        plan.recipe[0].skinSmoothStrength = 50;
      },
    ];
    for (const mutate of mutations) {
      const plan = structuredClone(original);
      mutate(plan);
      expect(validatePlan(plan, input).valid).toBe(false);
    }
    const changed = structuredClone(original);
    changed.actions[0].id = "new-physical-id";
    expect(
      validatePlan(changed, input, [original.actions[0]]).conflicts.some(
        (conflict) => conflict.code === "physical_state_changed",
      ),
    ).toBe(true);
  });
});
