import { LOOKS, MOTION_LABELS, PRODUCT_LABELS, TOOL_LABELS } from "../catalog";
import type {
  CandidatePlan,
  PlanAction,
  PlanningConflict,
  Region,
  SetupInput,
  ToolId,
} from "../contracts";
import {
  makeRecipe,
  makePreviewVariants,
  validateEffects,
} from "../youcam/recipes";
import { TECHNIQUES, techniqueById, type TechniqueDefinition } from "./library";

export type PlanningConflictCode =
  | "unknown_look"
  | "motion_unconfirmed"
  | "motion_avoided"
  | "tool_unconfirmed"
  | "product_unconfirmed"
  | "lip_requirements"
  | "eye_requirements"
  | "invalid_plan"
  | "unknown_technique"
  | "invalid_dependency"
  | "physical_state_changed"
  | "target_requires_removal"
  | "no_alternative";

export function planningConflict(
  code: PlanningConflictCode,
  message: string,
  resolution: string,
  fields: Partial<Pick<PlanningConflict, "tool" | "motion">> = {},
): PlanningConflict {
  return { code, message, resolution, ...fields };
}

function requirements(
  technique: TechniqueDefinition,
  setup: SetupInput,
): PlanningConflict[] {
  const problems: PlanningConflict[] = [];
  const comfort = setup.preferences.movements[technique.motion];
  if (comfort !== "comfortable") {
    problems.push(
      planningConflict(
        comfort === "avoid" ? "motion_avoided" : "motion_unconfirmed",
        comfort === "avoid"
          ? `${MOTION_LABELS[technique.motion]} is marked avoid.`
          : `${MOTION_LABELS[technique.motion]} has not been confirmed comfortable.`,
        comfort === "avoid"
          ? "Choose a method using another movement, change this choice yourself, or ask for assistance."
          : "Confirm this movement yourself, optionally after practice away from your face, or choose another method.",
        { motion: technique.motion },
      ),
    );
  }
  if (!setup.tools.includes(technique.tool)) {
    problems.push(
      planningConflict(
        "tool_unconfirmed",
        `${TOOL_LABELS[technique.tool]} is not confirmed available.`,
        "Confirm the tool you actually have, or choose a method using another confirmed tool.",
        { tool: technique.tool },
      ),
    );
  }
  if (!setup.products.includes(technique.product)) {
    problems.push(
      planningConflict(
        "product_unconfirmed",
        `${PRODUCT_LABELS[technique.product]} is not confirmed available.`,
        "Confirm a product suitable for this labeled use, or choose a method with an available product.",
      ),
    );
  }
  return problems;
}

function uniqueConflicts(problems: PlanningConflict[]): PlanningConflict[] {
  return problems.filter(
    (problem, index) =>
      problems.findIndex(
        (other) =>
          other.code === problem.code && other.message === problem.message,
      ) === index,
  );
}

function makeAction(
  technique: TechniqueDefinition,
  region: Region,
  id: string,
  dependency?: string,
): PlanAction {
  return {
    id,
    techniqueId: technique.id,
    techniqueVersion: technique.version,
    validation: technique.validation,
    title:
      region === "lips"
        ? technique.title
        : region === "left_eye" || region === "right_eye"
          ? `Your ${region === "left_eye" ? "left" : "right"} upper lid`
          : `Your ${region === "left_cheek" ? "left" : "right"} cheek`,
    instruction: technique.instruction(region),
    detail:
      technique.regionKind === "eye"
        ? "Use only products and tools labeled for eyelid makeup. Apply to comfortably closed upper-lid skin, then move your hands away and match your baseline eye position before checking. You can pause or skip."
        : "Follow your product and tool labels for preparation. Pause whenever you want to check the color or change the method.",
    stoppingCue: technique.stoppingCue,
    region,
    motion: technique.motion,
    ...(technique.precision ? { precision: technique.precision } : {}),
    tool: technique.tool,
    product: technique.product,
    dependsOn: dependency ? [dependency] : [],
    alternativeIds: [...technique.alternatives],
    evidencePolicy: "user_judgment",
  };
}

function regionKind(region: Region): TechniqueDefinition["regionKind"] {
  return region === "lips"
    ? "lips"
    : region === "left_eye" || region === "right_eye"
      ? "eye"
      : "cheek";
}

function compileEyes(
  setup: SetupInput,
  technique: TechniqueDefinition,
): CandidatePlan {
  const routeId = technique.routeId!;
  const id = `eyes-${routeId}-${technique.id}-v1`;
  const left = makeAction(technique, "left_eye", `${id}:left_eye`);
  const right = makeAction(technique, "right_eye", `${id}:right_eye`, left.id);
  return {
    id,
    routeId,
    name: technique.title,
    tagline:
      routeId === "liner"
        ? "Fine upper line · short strokes"
        : "Soft eye shadow · tapping",
    description:
      routeId === "liner"
        ? "Defines the upper lash line with precise short strokes and your confirmed eyeliner pen."
        : "Keeps eye emphasis with a softly tapped shadow edge instead of a fine line.",
    tools: [technique.tool],
    attributes: [
      "Eye emphasis",
      routeId === "liner" ? "Fine upper line" : "Soft upper-lid shadow",
    ],
    tradeoffs: [
      routeId === "liner"
        ? "Uses high precision short strokes you confirmed comfortable."
        : "Uses low precision tapping; the soft edge changes the fine-line appearance.",
      `Requires ${PRODUCT_LABELS[technique.product].toLowerCase()} and ${TOOL_LABELS[technique.tool].toLowerCase()} suitable for eyelid makeup.`,
    ],
    actions: [left, right],
    previewStatus: "not_requested",
    recipe: makeRecipe("eyes", routeId, false),
    previewVariants: makePreviewVariants("eyes", routeId, false),
    selectedPreviewVariantId: "full",
  };
}

function planEyes(setup: SetupInput): {
  candidates: CandidatePlan[];
  conflicts: PlanningConflict[];
} {
  if (setup.includeLips)
    return {
      candidates: [],
      conflicts: [
        planningConflict(
          "eye_requirements",
          "Defined eyes is an eye-only goal.",
          "Leave optional lip color off for this goal.",
        ),
      ],
    };
  const techniques = TECHNIQUES.filter(
    (technique) =>
      technique.regionKind === "eye" &&
      technique.lookIds.includes(setup.lookId),
  );
  const plans = techniques
    .filter((technique) => !requirements(technique, setup).length)
    .map((technique) => compileEyes(setup, technique))
    .filter((plan) => validatePlan(plan, setup).valid)
    .sort(
      (a, b) => resourceCost(a) - resourceCost(b) || a.id.localeCompare(b.id),
    );
  const best = new Map<CandidatePlan["routeId"], CandidatePlan>();
  for (const plan of plans)
    if (!best.has(plan.routeId)) best.set(plan.routeId, plan);
  const candidates = [...best.values()].sort(
    (a, b) =>
      ["liner", "shadow"].indexOf(a.routeId) -
      ["liner", "shadow"].indexOf(b.routeId),
  );
  return {
    candidates,
    conflicts: candidates.length
      ? []
      : uniqueConflicts(
          techniques.flatMap((technique) => requirements(technique, setup)),
        ),
  };
}

function compile(
  setup: SetupInput,
  cheek: TechniqueDefinition,
  lip?: TechniqueDefinition,
): CandidatePlan {
  const look = LOOKS.find((entry) => entry.id === setup.lookId)!;
  const routeId = cheek.routeId!;
  const id = `${setup.lookId}-${routeId}${lip ? `-${lip.id}` : ""}-v1`;
  const left = makeAction(cheek, "left_cheek", `${id}:left_cheek`);
  const right = makeAction(cheek, "right_cheek", `${id}:right_cheek`, left.id);
  const actions = [
    left,
    right,
    ...(lip ? [makeAction(lip, "lips", `${id}:lips`, right.id)] : []),
  ];
  return {
    id,
    routeId,
    name: cheek.title,
    tagline:
      routeId === "sweep"
        ? "Powder blush · broad blending"
        : routeId === "sponge"
          ? "Cream blush · sponge tapping"
          : routeId === "buff"
            ? "Cream blush · broad brush blending"
            : "Cream blush · fingertip tapping",
    description: `${look.attributes[0]} using your ${TOOL_LABELS[cheek.tool].toLowerCase()} and the ${MOTION_LABELS[cheek.motion].toLowerCase()} movement you confirmed comfortable.`,
    tools: [...new Set(actions.map((action) => action.tool))],
    attributes: [
      ...look.attributes.filter(
        (attribute) => setup.includeLips || attribute !== "Optional lip tint",
      ),
    ],
    tradeoffs: [
      routeId === "sweep"
        ? "Uses a wide brush and powder rather than tapping cream blush."
        : routeId === "sponge"
          ? "Uses a sponge rather than direct fingertip application."
          : routeId === "buff"
            ? "Uses a wide brush to blend cream blush."
            : "Uses fingertips rather than a separate cheek tool.",
      routeId === "sweep"
        ? "Requires powder blush and a wide blush brush."
        : routeId === "sponge"
          ? "Requires cream blush and a makeup sponge."
          : routeId === "buff"
            ? "Requires cream blush and a wide brush suitable for cream products."
            : "Requires cream blush; no separate cheek tool.",
      ...(lip
        ? [
            `Lip color uses ${TOOL_LABELS[lip.tool].toLowerCase()} and ${MOTION_LABELS[lip.motion].toLowerCase()}.`,
          ]
        : []),
    ],
    actions,
    previewStatus: "not_requested",
    recipe: makeRecipe(setup.lookId, routeId, Boolean(lip)),
    previewVariants: makePreviewVariants(setup.lookId, routeId, Boolean(lip)),
    selectedPreviewVariantId: "full",
  };
}

function resourceCost(plan: CandidatePlan): number {
  const changes = plan.actions.reduce(
    (count, action, index) =>
      count + (index && action.tool !== plan.actions[index - 1].tool ? 1 : 0),
    0,
  );
  // Deterministic tie-break for resource changes, not a comfort/success score.
  return changes * 10 + plan.tools.length;
}

export function planCandidates(setup: SetupInput): {
  candidates: CandidatePlan[];
  conflicts: PlanningConflict[];
} {
  if (!LOOKS.some((look) => look.id === setup.lookId)) {
    return {
      candidates: [],
      conflicts: [
        planningConflict(
          "unknown_look",
          "This look is outside the current method library.",
          "Choose one of the listed color families.",
        ),
      ],
    };
  }
  if (setup.lookId === "eyes") return planEyes(setup);
  const cheeks = TECHNIQUES.filter(
    (technique) =>
      technique.regionKind === "cheek" &&
      technique.lookIds.includes(setup.lookId),
  );
  const lips = TECHNIQUES.filter(
    (technique) =>
      technique.regionKind === "lips" &&
      technique.lookIds.includes(setup.lookId),
  );
  const feasibleCheeks = cheeks.filter(
    (technique) => requirements(technique, setup).length === 0,
  );
  const feasibleLips = lips.filter(
    (technique) => requirements(technique, setup).length === 0,
  );
  if (setup.includeLips && !feasibleLips.length) {
    return {
      candidates: [],
      conflicts: uniqueConflicts([
        planningConflict(
          "lip_requirements",
          "Lip color was requested, but no lip method meets the confirmed setup.",
          "Confirm lip color and a compatible fingertip-tapping or lip-brush method, or choose to leave lips out.",
        ),
        ...lips.flatMap((technique) => requirements(technique, setup)),
      ]),
    };
  }
  // Enumerate the finite combinations and retain the fewest resource changes
  // for each genuinely different cheek method. No prerequisites are relaxed.
  const combinations = feasibleCheeks.flatMap((cheek) =>
    setup.includeLips
      ? feasibleLips.map((lip) => compile(setup, cheek, lip))
      : [compile(setup, cheek)],
  );
  const bestByRoute = new Map<CandidatePlan["routeId"], CandidatePlan>();
  for (const plan of combinations.sort(
    (a, b) => resourceCost(a) - resourceCost(b) || a.id.localeCompare(b.id),
  )) {
    if (!bestByRoute.has(plan.routeId)) bestByRoute.set(plan.routeId, plan);
  }
  const candidates = [...bestByRoute.values()].sort(
    (a, b) =>
      ["tap", "sweep", "sponge", "buff"].indexOf(a.routeId) -
      ["tap", "sweep", "sponge", "buff"].indexOf(b.routeId),
  );
  const valid = candidates
    .filter((plan) => validatePlan(plan, setup).valid)
    .slice(0, 3);
  return valid.length
    ? { candidates: valid, conflicts: [] }
    : {
        candidates: [],
        conflicts: uniqueConflicts(
          cheeks.flatMap((technique) => requirements(technique, setup)),
        ),
      };
}

/** Compile the unfinished suffix directly. Requiring an already completed cheek
 * method to remain feasible would wrongly block, for example, a lip-tool change.
 */
export function repairCandidates(
  original: CandidatePlan,
  setup: SetupInput,
  completed: readonly PlanAction[],
  options: {
    avoidTool?: ToolId;
    routeId?: CandidatePlan["routeId"];
    keepMethod?: boolean;
  },
): { candidates: CandidatePlan[]; conflicts: PlanningConflict[] } {
  const remaining = original.actions.slice(completed.length);
  const problems: PlanningConflict[] = [];
  const choices = remaining.map((action) => {
    const relevant = TECHNIQUES.filter(
      (technique) =>
        technique.regionKind === regionKind(action.region) &&
        technique.lookIds.includes(setup.lookId),
    );
    return relevant.filter((technique) => {
      const unmet = requirements(technique, setup);
      problems.push(...unmet);
      return (
        !unmet.length &&
        technique.tool !== options.avoidTool &&
        (!options.keepMethod || technique.id === action.techniqueId) &&
        (action.region === "lips" ||
          !options.routeId ||
          technique.routeId === options.routeId)
      );
    });
  });
  let combinations: TechniqueDefinition[][] = [[]];
  for (const variants of choices)
    combinations = combinations.flatMap((prefix) =>
      variants.map((technique) => [...prefix, technique]),
    );
  const candidates = combinations
    .filter((combination) => {
      const paired = combination.filter(
        (technique) => technique.regionKind !== "lips",
      );
      return (
        !paired.length ||
        paired.every((technique) => technique.id === paired[0].id)
      );
    })
    .map((combination) => {
      const candidate = structuredClone(original);
      const remainingCheek = combination.find(
        (technique) => technique.regionKind !== "lips",
      );
      candidate.routeId = remainingCheek?.routeId ?? original.routeId;
      candidate.id = `${setup.lookId}-${candidate.routeId}-repair-${combination.map((technique) => technique.id).join("-")}`;
      candidate.name = remainingCheek?.title ?? combination[0].title;
      candidate.tagline = remainingCheek
        ? `${PRODUCT_LABELS[remainingCheek.product]} · ${MOTION_LABELS[remainingCheek.motion].toLowerCase()}`
        : `Lip color · ${MOTION_LABELS[combination[0].motion].toLowerCase()}`;
      candidate.description = `Keeps confirmed work and uses ${TOOL_LABELS[combination[0].tool].toLowerCase()} for the next action.`;
      candidate.actions = [...completed];
      for (const [index, technique] of combination.entries()) {
        const previousId = candidate.actions.at(-1)?.id;
        candidate.actions.push(
          makeAction(
            technique,
            remaining[index].region,
            `${candidate.id}:${remaining[index].region}`,
            previousId,
          ),
        );
      }
      candidate.tools = [
        ...new Set(candidate.actions.map((action) => action.tool)),
      ];
      candidate.tradeoffs = [
        ...new Set(
          combination.map(
            (technique) =>
              `Uses ${TOOL_LABELS[technique.tool].toLowerCase()} with ${PRODUCT_LABELS[technique.product].toLowerCase()} and ${MOTION_LABELS[technique.motion].toLowerCase()}.`,
          ),
        ),
      ];
      // A new physical method must carry its own target recipe. Completed
      // actions remain untouched; the preview describes the unfinished region.
      candidate.previewVariants = makePreviewVariants(
        setup.lookId,
        candidate.routeId,
        setup.includeLips,
      );
      candidate.selectedPreviewVariantId = candidate.previewVariants.some(
        (variant) => variant.id === original.selectedPreviewVariantId,
      )
        ? original.selectedPreviewVariantId!
        : "full";
      candidate.recipe = structuredClone(
        candidate.previewVariants.find(
          (variant) => variant.id === candidate.selectedPreviewVariantId,
        )!.recipe,
      );
      candidate.previewStatus = "not_requested";
      delete candidate.previewAsset;
      delete candidate.previewJobId;
      delete candidate.previewError;
      return candidate;
    })
    .filter((candidate) => validatePlan(candidate, setup, completed).valid)
    .sort((a, b) => {
      const productChanges = (plan: CandidatePlan) =>
        plan.actions
          .slice(completed.length)
          .reduce(
            (count, action, index) =>
              count + Number(action.product !== remaining[index].product),
            0,
          );
      return (
        productChanges(a) - productChanges(b) ||
        resourceCost(a) - resourceCost(b) ||
        a.id.localeCompare(b.id)
      );
    });
  return {
    candidates,
    conflicts: candidates.length ? [] : uniqueConflicts(problems),
  };
}

/** Independent of enumeration; also checks repaired mixed-method plans. */
export function validatePlan(
  plan: CandidatePlan,
  setup: SetupInput,
  completedActions: readonly PlanAction[] = [],
): { valid: boolean; conflicts: PlanningConflict[] } {
  const problems: PlanningConflict[] = [];
  const completed = new Map(
    completedActions.map((action) => [action.id, action]),
  );
  const ids = new Set<string>();
  const regions =
    setup.lookId === "eyes"
      ? ["left_eye", "right_eye"]
      : setup.includeLips
        ? ["left_cheek", "right_cheek", "lips"]
        : ["left_cheek", "right_cheek"];
  if (
    (setup.lookId === "eyes" && setup.includeLips) ||
    !plan.actions.length ||
    plan.actions.length !== regions.length ||
    plan.actions.some((action, index) => action.region !== regions[index])
  ) {
    problems.push(
      planningConflict(
        "invalid_plan",
        "Actions must cover the agreed anatomical regions in order.",
        setup.lookId === "eyes"
          ? "Rebuild the eye-only plan with left and right upper lids."
          : "Rebuild the plan with left cheek, right cheek and optional lips.",
      ),
    );
  }
  for (const [index, action] of plan.actions.entries()) {
    if (!action.id || ids.has(action.id))
      problems.push(
        planningConflict(
          "invalid_plan",
          "Action identifiers must be unique.",
          "Rebuild this plan.",
        ),
      );
    if (
      action.dependsOn.some((id) => !ids.has(id)) ||
      (index > 0 && !action.dependsOn.includes(plan.actions[index - 1].id))
    ) {
      problems.push(
        planningConflict(
          "invalid_dependency",
          "An action depends on unavailable or later physical work.",
          "Rebuild the ordered plan; completed work cannot be bypassed.",
        ),
      );
    }
    ids.add(action.id);
    const technique = techniqueById(action.techniqueId);
    if (!technique || action.techniqueVersion !== technique.version) {
      problems.push(
        planningConflict(
          "unknown_technique",
          "An action is outside the versioned method library.",
          "Use a listed technique version.",
        ),
      );
      continue;
    }
    if (
      action.validation !== "draft" ||
      action.evidencePolicy !== "user_judgment" ||
      action.motion !== technique.motion ||
      action.precision !== technique.precision ||
      action.tool !== technique.tool ||
      action.product !== technique.product ||
      regionKind(action.region) !== technique.regionKind ||
      action.instruction !== technique.instruction(action.region) ||
      action.stoppingCue !== technique.stoppingCue ||
      JSON.stringify(action.alternativeIds) !==
        JSON.stringify(technique.alternatives)
    ) {
      problems.push(
        planningConflict(
          "invalid_plan",
          "An action changes a method's fixed prerequisites or evidence status.",
          "Use the original versioned method definition.",
        ),
      );
    }
    if (!technique.lookIds.includes(setup.lookId))
      problems.push(
        planningConflict(
          "invalid_plan",
          "This method does not support the selected look.",
          "Choose a supported look or method.",
        ),
      );
    if (
      setup.lookId === "eyes" &&
      !completed.has(action.id) &&
      technique.routeId !== plan.routeId
    )
      problems.push(
        planningConflict(
          "invalid_plan",
          "An unfinished eye uses a different appearance method from its target.",
          "Use the selected eye method for unfinished work; preserve completed eyes separately.",
        ),
      );
    if (!completed.has(action.id))
      problems.push(...requirements(technique, setup));
  }
  completedActions.forEach((action, index) => {
    if (JSON.stringify(plan.actions[index]) !== JSON.stringify(action)) {
      problems.push(
        planningConflict(
          "physical_state_changed",
          "The proposed plan changes or removes a completed physical action.",
          "Keep completed actions exactly as recorded; removal needs a separate supported action.",
        ),
      );
    }
  });
  const actualTools = [
    ...new Set(plan.actions.map((action) => action.tool)),
  ].sort();
  if (
    JSON.stringify([...new Set(plan.tools)].sort()) !==
    JSON.stringify(actualTools)
  ) {
    problems.push(
      planningConflict(
        "invalid_plan",
        "The plan's tool list does not match its actions.",
        "Rebuild the resource list from the confirmed actions.",
      ),
    );
  }
  try {
    const effects = validateEffects(plan.recipe);
    const eyeGoal = setup.lookId === "eyes";
    const expectedCategory = eyeGoal
      ? plan.routeId === "liner"
        ? "eye_liner"
        : "eye_shadow"
      : "blush";
    if (
      !effects.some((effect) => effect.category === expectedCategory) ||
      (eyeGoal && plan.routeId !== "liner" && plan.routeId !== "shadow") ||
      (!eyeGoal && (plan.routeId === "liner" || plan.routeId === "shadow"))
    )
      throw new Error("Appearance family mismatch");
    if (
      effects.some((effect) => effect.category === "lip_color") !==
      setup.includeLips
    )
      throw new Error("Lip mismatch");
  } catch {
    problems.push(
      planningConflict(
        "invalid_plan",
        "The appearance recipe is outside the supported schema or agreed regions.",
        "Rebuild the recipe with smoothing explicitly disabled.",
      ),
    );
  }
  return { valid: problems.length === 0, conflicts: uniqueConflicts(problems) };
}
