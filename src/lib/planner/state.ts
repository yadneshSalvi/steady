import type {
  PlanAction,
  Preferences,
  SessionCommand,
  SessionStage,
  SetupInput,
  StudioAsset,
  StudioSession,
} from "../contracts";
import { softerRecipe } from "../youcam/recipes";
import {
  planCandidates,
  planningConflict,
  repairCandidates,
  validatePlan,
} from "./compiler";

export type DomainErrorCode =
  | "consent_required"
  | "invalid_transition"
  | "unknown_candidate"
  | "invalid_plan"
  | "not_active_action"
  | "physical_state_required"
  | "invalid_asset"
  | "final_capture_required"
  | "stale_proposal"
  | "immutable_physical_state"
  | "terminal_session";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

function requireStage(session: StudioSession, allowed: SessionStage[]): void {
  if (!allowed.includes(session.stage))
    throw new DomainError(
      "invalid_transition",
      `This action is not available while the session is ${session.stage}.`,
    );
}

function asSetup(
  session: StudioSession,
  preferences = session.preferences,
): SetupInput {
  return {
    lookId: session.lookId,
    includeLips: session.includeLips,
    preferences,
    tools: session.tools,
    products: session.products,
    mode: session.mode,
    consent: true,
    sourceAssetId: session.sourceAssetId,
  };
}

function completedActions(session: StudioSession): PlanAction[] {
  const actions = session.activePlan?.actions ?? [];
  const completed = session.completedActionIds.map((id) =>
    actions.find((action) => action.id === id),
  );
  if (
    completed.some(
      (action, index) => !action || action.id !== actions[index]?.id,
    )
  ) {
    throw new DomainError(
      "immutable_physical_state",
      "The recorded physical actions do not match the beginning of the active plan.",
    );
  }
  return completed as PlanAction[];
}

function requireValidPlan(
  session: StudioSession,
  preferences = session.preferences,
): void {
  if (!session.activePlan)
    throw new DomainError("invalid_plan", "Choose a method before continuing.");
  const result = validatePlan(
    session.activePlan,
    asSetup(session, preferences),
    completedActions(session),
  );
  if (!result.valid)
    throw new DomainError(
      "invalid_plan",
      result.conflicts[0]?.message ??
        "This plan does not meet the confirmed setup.",
    );
}

export function currentAction(session: StudioSession): PlanAction | undefined {
  return session.activePlan?.actions.find(
    (action) => !session.completedActionIds.includes(action.id),
  );
}

export function createSession(
  setup: SetupInput,
  id: string = globalThis.crypto.randomUUID(),
  now = new Date().toISOString(),
): StudioSession {
  if (setup.mode === "personal" && !setup.consent)
    throw new DomainError(
      "consent_required",
      "Confirm the selected-capture processing choice before creating a personal session.",
    );
  const { candidates, conflicts } = planCandidates(setup);
  return structuredClone({
    id,
    revision: 0,
    schemaVersion: 1,
    stage: "choosing",
    mode: setup.mode,
    createdAt: now,
    updatedAt: now,
    lookId: setup.lookId,
    includeLips: setup.includeLips,
    preferences: setup.preferences,
    tools: setup.tools,
    products: setup.products,
    assets: [],
    sourceAssetId: setup.sourceAssetId,
    candidates,
    conflicts,
    completedActionIds: [],
    observations: [],
    events: [
      {
        id: `${id}:event:0`,
        type: "session_created",
        at: now,
        provenance: "system",
      },
    ],
    goalChanged: false,
    savedMethod: false,
    resumeRequired: false,
  } satisfies StudioSession);
}

function validateAsset(asset: StudioAsset): void {
  if (
    !asset.id ||
    !asset.url ||
    !Number.isFinite(asset.width) ||
    asset.width < 1 ||
    !Number.isFinite(asset.height) ||
    asset.height < 1
  ) {
    throw new DomainError(
      "invalid_asset",
      "This image is missing its identity or dimensions.",
    );
  }
  if (
    (asset.provenance === "virtual_preview") !==
      (asset.purpose === "preview") ||
    ((asset.purpose === "checkpoint" || asset.purpose === "final") &&
      asset.provenance !== "actual_capture")
  ) {
    throw new DomainError(
      "invalid_asset",
      "Checkpoint and final images must be actual captures. Virtual previews retain preview provenance.",
    );
  }
}

function propose(
  session: StudioSession,
  command: Extract<SessionCommand, { type: "propose_adaptation" }>,
): void {
  const active = session.activePlan!;
  const action = currentAction(session);
  if (!action)
    throw new DomainError(
      "not_active_action",
      "There is no remaining action to adapt.",
    );
  const preserved = completedActions(session);
  session.stage = "paused";
  session.resumeRequired = true;
  session.adaptation = undefined;
  if (command.reason === "softer" && preserved.length) {
    session.conflicts = [
      planningConflict(
        "target_requires_removal",
        "A softer full-look preview could imply reducing product already applied.",
        "Keep the current result, change the remaining method, ask for assistance, or finish here. This library has no supported removal method.",
      ),
    ];
    return;
  }
  const preferences: Preferences = structuredClone(session.preferences);
  if (command.reason === "movement")
    preferences.movements[action.motion] = "avoid";
  const proposed = repairCandidates(
    active,
    asSetup(session, preferences),
    preserved,
    {
      avoidTool: command.reason === "tool" ? action.tool : undefined,
      routeId: command.routeId,
      keepMethod: command.reason === "softer",
    },
  );
  const alternatives = proposed.candidates.filter((candidate) => {
    const replacement = candidate.actions.find(
      (item) => item.region === action.region,
    );
    if (!replacement) return false;
    if (command.reason === "movement")
      return replacement.motion !== action.motion;
    if (command.reason === "tool") return replacement.tool !== action.tool;
    return candidate.routeId === active.routeId;
  });
  const chosen = alternatives[0];
  if (!chosen) {
    session.conflicts = proposed.conflicts.length
      ? proposed.conflicts
      : [
          planningConflict(
            "no_alternative",
            "No different method meets the requested change and the confirmed setup.",
            "Confirm another available tool or comfortable motion, rest, ask for assistance, or finish here.",
          ),
        ];
    // The explicitly reported movement remains avoided even when repair fails.
    if (command.reason === "movement") session.preferences = preferences;
    return;
  }
  const candidate = structuredClone(chosen);
  candidate.id = `${chosen.id}:revision:${session.revision + 1}`;
  let previousId: string | undefined;
  candidate.actions = candidate.actions.map((next) => {
    const applied = preserved.find((item) => item.region === next.region);
    const result = applied ?? {
      ...next,
      id: `${candidate.id}:${next.region}`,
      dependsOn: previousId ? [previousId] : [],
    };
    previousId = result.id;
    return result;
  });
  candidate.tools = [...new Set(candidate.actions.map((item) => item.tool))];
  const changesGoal = command.reason === "softer";
  candidate.recipe = changesGoal
    ? softerRecipe(active.recipe)
    : structuredClone(active.recipe);
  // Reusing a target with exactly the same source/recipe is explicit; a new goal
  // never inherits an old preview or an in-flight job's identity.
  candidate.previewStatus = changesGoal
    ? "not_requested"
    : active.previewStatus === "ready"
      ? "ready"
      : "not_requested";
  candidate.previewAsset = changesGoal ? undefined : active.previewAsset;
  candidate.previewJobId = undefined;
  candidate.previewError = undefined;
  candidate.tradeoffs = [
    ...candidate.tradeoffs,
    ...(preserved.length
      ? [
          "Completed areas stay as you applied them. Only remaining actions change.",
        ]
      : []),
    ...(changesGoal
      ? [
          "Proposes a subtler virtual color target. No physical quantity has been inferred.",
        ]
      : []),
  ];
  const check = validatePlan(
    candidate,
    asSetup(session, preferences),
    preserved,
  );
  if (!check.valid) {
    session.conflicts = check.conflicts;
    if (command.reason === "movement") session.preferences = preferences;
    return;
  }
  session.adaptation = {
    id: `${session.id}:adaptation:${session.revision + 1}`,
    reason: command.reason,
    fromCandidateId: active.id,
    candidate,
    preservedActionIds: preserved.map((item) => item.id),
    removedActionIds: active.actions
      .filter((item) => !session.completedActionIds.includes(item.id))
      .map((item) => item.id),
    explanation: changesGoal
      ? "Proposes a softer color target before application. The target changes only after your approval."
      : `Keeps ${preserved.length} confirmed action${preserved.length === 1 ? "" : "s"} and changes the remaining method. No applied makeup is removed.`,
    changesGoal,
    revisedPreferences: preferences,
  };
  // Reporting a difficult motion takes effect immediately; declining a proposal
  // does not silently turn that motion back into a comfortable choice.
  if (command.reason === "movement") session.preferences = preferences;
  session.conflicts = [];
  session.stage = "adapting";
}

/** Pure immutable transition. The persistence API checks its expectedRevision
 * envelope under a database lock before invoking this reducer.
 */
export function applyCommand(
  previous: StudioSession,
  command: SessionCommand,
): StudioSession {
  if (
    (previous.stage === "completed" || previous.stage === "stopped") &&
    command.type !== "save_method"
  ) {
    throw new DomainError(
      "terminal_session",
      "This session has ended. Its physical history and outcome remain recorded.",
    );
  }
  const physicalBefore = completedActions(previous);
  const session = structuredClone(previous);
  const at = new Date().toISOString();
  let actionId: string | undefined;
  let eventType: string = command.type;
  let eventDetail: string | undefined;
  switch (command.type) {
    case "approve_candidate": {
      requireStage(session, ["choosing", "ready"]);
      if (session.completedActionIds.length)
        throw new DomainError(
          "immutable_physical_state",
          "A fresh candidate cannot replace completed physical work.",
        );
      const candidate = session.candidates.find(
        (item) => item.id === command.candidateId,
      );
      if (!candidate)
        throw new DomainError(
          "unknown_candidate",
          "This candidate is no longer available.",
        );
      const check = validatePlan(candidate, asSetup(session));
      if (!check.valid)
        throw new DomainError("invalid_plan", check.conflicts[0].message);
      session.activePlan = structuredClone(candidate);
      session.selectedCandidateId = candidate.id;
      session.conflicts = [];
      session.stage = "ready";
      break;
    }
    case "start":
      requireStage(session, ["ready"]);
      requireValidPlan(session);
      session.stage = "applying";
      session.resumeRequired = false;
      eventType =
        session.mode === "sample"
          ? "sample_walkthrough_started"
          : "application_started";
      break;
    case "pause":
      requireStage(session, ["applying"]);
      session.stage = "paused";
      session.resumeRequired = true;
      break;
    case "resume":
      requireStage(session, ["paused"]);
      if (!command.confirmedPhysicalState)
        throw new DomainError(
          "physical_state_required",
          "Confirm the current physical state before continuing.",
        );
      requireValidPlan(session);
      session.stage = currentAction(session) ? "applying" : "reviewing";
      session.resumeRequired = false;
      session.conflicts = [];
      break;
    case "checkpoint": {
      requireStage(session, ["applying"]);
      if (currentAction(session)?.id !== command.actionId)
        throw new DomainError(
          "not_active_action",
          "A checkpoint must refer to the active action.",
        );
      const asset = command.assetId
        ? session.assets.find((item) => item.id === command.assetId)
        : undefined;
      if (
        command.assetId &&
        (!asset ||
          asset.provenance !== "actual_capture" ||
          asset.purpose !== "checkpoint")
      ) {
        throw new DomainError(
          "invalid_asset",
          "Select an actual checkpoint capture for this action.",
        );
      }
      session.observations.push({
        id: `${session.id}:observation:${session.revision + 1}`,
        actionId: command.actionId,
        assetId: asset?.id,
        state: asset ? "unsupported_action" : "insufficient_evidence",
        reason: asset
          ? "Automatic cosmetic feedback is unavailable for this check. You decide whether to keep this result."
          : "No actual checkpoint was selected. You can choose a capture or use your own judgment.",
        method: "user_judgment_only_v1",
        createdAt: at,
      });
      actionId = command.actionId;
      break;
    }
    case "complete_action": {
      requireStage(session, ["applying"]);
      requireValidPlan(session);
      const action = currentAction(session);
      if (!action || action.id !== command.actionId)
        throw new DomainError(
          "not_active_action",
          "Only the active action can be confirmed. Completed actions cannot be repeated or undone.",
        );
      if (
        action.dependsOn.some((id) => !session.completedActionIds.includes(id))
      )
        throw new DomainError(
          "invalid_plan",
          "Confirm preceding physical work before continuing.",
        );
      session.completedActionIds.push(action.id);
      actionId = action.id;
      eventType =
        session.mode === "sample"
          ? "sample_action_confirmed"
          : "physical_action_user_confirmed";
      if (!currentAction(session)) session.stage = "reviewing";
      break;
    }
    case "propose_adaptation":
      requireStage(session, ["applying", "paused"]);
      if (!session.activePlan)
        throw new DomainError(
          "invalid_plan",
          "Choose a method before changing it.",
        );
      propose(session, command);
      actionId = currentAction(session)?.id;
      eventType = session.adaptation
        ? "adaptation_proposed"
        : "adaptation_unavailable";
      break;
    case "accept_adaptation": {
      requireStage(session, ["adapting"]);
      const proposal = session.adaptation;
      if (
        !proposal ||
        proposal.id !== command.proposalId ||
        proposal.fromCandidateId !== session.activePlan?.id
      )
        throw new DomainError(
          "stale_proposal",
          "This adaptation no longer matches the active plan.",
        );
      if (
        JSON.stringify(proposal.preservedActionIds) !==
        JSON.stringify(session.completedActionIds)
      )
        throw new DomainError(
          "immutable_physical_state",
          "The proposal does not preserve the recorded physical work.",
        );
      const check = validatePlan(
        proposal.candidate,
        asSetup(session, proposal.revisedPreferences),
        physicalBefore,
      );
      if (!check.valid)
        throw new DomainError("invalid_plan", check.conflicts[0].message);
      session.preferences = structuredClone(proposal.revisedPreferences);
      session.activePlan = structuredClone(proposal.candidate);
      session.selectedCandidateId = proposal.candidate.id;
      session.candidates.push(structuredClone(proposal.candidate));
      session.goalChanged ||= proposal.changesGoal;
      session.adaptation = undefined;
      session.stage = "paused";
      session.resumeRequired = true;
      session.conflicts = [];
      break;
    }
    case "decline_adaptation":
      requireStage(session, ["adapting"]);
      session.adaptation = undefined;
      session.stage = "paused";
      session.resumeRequired = true;
      break;
    case "review":
      requireStage(session, ["applying", "paused"]);
      session.stage = "reviewing";
      break;
    case "finish": {
      requireStage(session, ["reviewing"]);
      const final = command.finalAssetId
        ? session.assets.find((item) => item.id === command.finalAssetId)
        : undefined;
      if (
        command.finalAssetId &&
        (!final ||
          final.provenance !== "actual_capture" ||
          final.purpose !== "final")
      )
        throw new DomainError(
          "invalid_asset",
          "A virtual preview or sample image cannot be an actual final result.",
        );
      if (session.mode === "sample") {
        session.stage = "completed";
        session.outcome = undefined;
        eventType = "sample_walkthrough_finished";
        eventDetail =
          "Synthetic walkthrough only; no physical outcome was assessed.";
        break;
      }
      const allWorkComplete =
        Boolean(session.activePlan) && !currentAction(session);
      const completedGoal = allWorkComplete && command.satisfaction === "yes";
      if (completedGoal && !final)
        throw new DomainError(
          "final_capture_required",
          "Choose an actual final capture before recording a completed physical result.",
        );
      session.outcome = {
        classification: completedGoal
          ? session.goalChanged
            ? "adapted_completed"
            : "original_completed"
          : "accepted_partial",
        satisfaction: command.satisfaction,
        comfort: command.comfort,
        assistance: command.assistance,
        note: command.note,
        finalAssetId: final?.id,
        createdAt: at,
      };
      session.stage = "completed";
      break;
    }
    case "stop":
      requireStage(session, [
        "choosing",
        "ready",
        "applying",
        "paused",
        "adapting",
        "reviewing",
      ]);
      session.stage = "stopped";
      session.adaptation = undefined;
      session.outcome =
        session.mode === "sample"
          ? undefined
          : {
              classification: "stopped",
              satisfaction: "not_yet",
              comfort: "not_assessed",
              assistance: "not_assessed",
              note: "Session stopped without an accepted result. Comfort and assistance were not assessed.",
              createdAt: at,
            };
      if (session.mode === "sample") eventType = "sample_walkthrough_stopped";
      break;
    case "save_method":
      requireStage(session, ["completed"]);
      if (!session.activePlan)
        throw new DomainError(
          "invalid_plan",
          "There is no selected method to save.",
        );
      session.savedMethod = true;
      break;
    case "set_preferences": {
      requireStage(session, ["choosing", "ready", "applying", "paused"]);
      session.preferences = structuredClone(command.preferences);
      if (session.stage === "choosing" || session.stage === "ready") {
        const planned = planCandidates(asSetup(session));
        session.candidates = planned.candidates;
        session.conflicts = planned.conflicts;
        session.activePlan = undefined;
        session.selectedCandidateId = undefined;
        session.stage = "choosing";
      } else {
        session.stage = "paused";
        session.resumeRequired = true;
        session.conflicts = session.activePlan
          ? validatePlan(session.activePlan, asSetup(session), physicalBefore)
              .conflicts
          : [];
      }
      break;
    }
    case "attach_asset": {
      validateAsset(command.asset);
      const existing = session.assets.find(
        (item) => item.id === command.asset.id,
      );
      if (
        existing &&
        JSON.stringify(existing) !== JSON.stringify(command.asset)
      )
        throw new DomainError(
          "invalid_asset",
          "An existing image's provenance and content cannot be replaced.",
        );
      if (command.asset.purpose === "baseline" && session.stage !== "choosing")
        throw new DomainError(
          "invalid_asset",
          "An approved target's baseline cannot be replaced. Start a new session to change it.",
        );
      if (!existing) session.assets.push(structuredClone(command.asset));
      if (
        command.asset.purpose === "baseline" &&
        session.sourceAssetId !== command.asset.id
      ) {
        session.sourceAssetId = command.asset.id;
        const planned = planCandidates(asSetup(session));
        session.candidates = planned.candidates;
        session.conflicts = planned.conflicts;
      }
      break;
    }
    default: {
      const exhaustive: never = command;
      throw new DomainError(
        "invalid_transition",
        `Unsupported command: ${String(exhaustive)}`,
      );
    }
  }
  const physicalAfter = completedActions(session);
  if (
    physicalBefore.some(
      (action, index) =>
        JSON.stringify(action) !== JSON.stringify(physicalAfter[index]),
    )
  ) {
    throw new DomainError(
      "immutable_physical_state",
      "A transition attempted to change recorded physical work.",
    );
  }
  session.revision = previous.revision + 1;
  session.updatedAt = at;
  session.events.push({
    id: `${session.id}:event:${session.revision}`,
    type: eventType,
    at,
    actionId,
    detail: eventDetail,
    provenance: command.type === "attach_asset" ? "system" : "user_confirmed",
  });
  return session;
}
