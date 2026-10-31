/** Shared browser/server contracts. A virtual preview can never be an actual capture. */
export type Motion = "tapping" | "blending" | "short_strokes";
export type Comfort = "comfortable" | "avoid" | "unknown";
export type ToolId = "fingertips" | "sponge" | "wide_brush" | "lip_brush";
export type ProductId = "cream_blush" | "powder_blush" | "lip_color";
export type Region = "left_cheek" | "right_cheek" | "lips";
export type LookId = "rose" | "terracotta" | "berry";
export type Provenance =
  "synthetic_inspiration" | "actual_capture" | "virtual_preview";
export type SessionStage =
  | "choosing"
  | "ready"
  | "applying"
  | "paused"
  | "adapting"
  | "reviewing"
  | "completed"
  | "stopped";

export interface Preferences {
  movements: Record<Motion, Comfort>;
  hand: "left" | "right" | "either";
  pace: "my_pace" | "offer_breaks";
  audio: boolean;
  mirror: boolean;
}

export interface SetupInput {
  lookId: LookId;
  includeLips: boolean;
  preferences: Preferences;
  tools: ToolId[];
  products: ProductId[];
  mode: "personal" | "sample";
  consent: boolean;
  sourceAssetId?: string;
}

export interface StudioAsset {
  id: string;
  url: string;
  provenance: Provenance;
  purpose: "baseline" | "checkpoint" | "final" | "preview";
  createdAt: string;
  width: number;
  height: number;
  /** A previously generated provider preview, never an actual result capture. */
  recordedAt?: string;
  providerRequestHash?: string;
}

export interface LookDefinition {
  id: LookId;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  lipColor: string;
  image: string;
  attributes: string[];
}

export interface PlanAction {
  id: string;
  techniqueId: string;
  techniqueVersion: number;
  validation: "draft";
  title: string;
  instruction: string;
  detail: string;
  stoppingCue: string;
  region: Region;
  motion: Motion;
  tool: ToolId;
  product: ProductId;
  dependsOn: string[];
  alternativeIds: string[];
  evidencePolicy: "user_judgment";
}

export interface CandidatePlan {
  id: string;
  routeId: "tap" | "sweep" | "sponge";
  name: string;
  tagline: string;
  description: string;
  tools: ToolId[];
  attributes: string[];
  tradeoffs: string[];
  actions: PlanAction[];
  previewStatus:
    | "not_requested"
    | "queued"
    | "processing"
    | "ready"
    | "failed"
    | "cancelled";
  previewAsset?: StudioAsset;
  previewJobId?: string;
  previewError?: string;
  recipe: MakeupEffect[];
}

/** Exact provider effect fields are validated in the server-only adapter. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type MakeupEffect = Record<string, JsonValue> & { category: string };

export interface PlanningConflict {
  code: string;
  message: string;
  resolution: string;
  motion?: Motion;
  tool?: ToolId;
}

export interface CheckpointObservation {
  id: string;
  actionId: string;
  assetId?: string;
  state:
    | "insufficient_evidence"
    | "unsupported_action"
    | "ai_observation"
    | "optional_adjustment";
  reason: string;
  method: "user_judgment_only_v1" | "vision_assistant_v1";
  model?: string;
  reasons?: string[];
  suggestedActionId?: string;
  createdAt: string;
}

export interface SessionEvent {
  id: string;
  type: string;
  at: string;
  actionId?: string;
  detail?: string;
  provenance?: "user_confirmed" | "system";
}

export interface AdaptationProposal {
  id: string;
  reason: "movement" | "tool" | "softer";
  fromCandidateId: string;
  candidate: CandidatePlan;
  preservedActionIds: string[];
  removedActionIds: string[];
  explanation: string;
  changesGoal: boolean;
  revisedPreferences: Preferences;
}

export interface Outcome {
  classification:
    "original_completed" | "adapted_completed" | "accepted_partial" | "stopped";
  satisfaction: "yes" | "partly" | "not_yet";
  comfort: "comfortable" | "mixed" | "difficult" | "not_assessed";
  assistance: "none" | "verbal" | "physical" | "not_assessed";
  note: string;
  finalAssetId?: string;
  createdAt: string;
}

export interface StudioSession {
  id: string;
  revision: number;
  schemaVersion: 1;
  stage: SessionStage;
  mode: "personal" | "sample";
  createdAt: string;
  updatedAt: string;
  lookId: LookId;
  includeLips: boolean;
  preferences: Preferences;
  tools: ToolId[];
  products: ProductId[];
  assets: StudioAsset[];
  sourceAssetId?: string;
  candidates: CandidatePlan[];
  conflicts: PlanningConflict[];
  selectedCandidateId?: string;
  activePlan?: CandidatePlan;
  completedActionIds: string[];
  observations: CheckpointObservation[];
  events: SessionEvent[];
  adaptation?: AdaptationProposal;
  goalChanged: boolean;
  outcome?: Outcome;
  savedMethod: boolean;
  resumeRequired: boolean;
}

export type SessionCommand =
  | { type: "approve_candidate"; candidateId: string }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume"; confirmedPhysicalState: boolean }
  | { type: "checkpoint"; actionId: string; assetId?: string }
  | { type: "complete_action"; actionId: string }
  | {
      type: "propose_adaptation";
      reason: "movement" | "tool" | "softer";
      routeId?: CandidatePlan["routeId"];
    }
  | { type: "accept_adaptation"; proposalId: string }
  | { type: "decline_adaptation" }
  | { type: "review" }
  | {
      type: "finish";
      satisfaction: Outcome["satisfaction"];
      comfort: Outcome["comfort"];
      assistance: Outcome["assistance"];
      note: string;
      finalAssetId?: string;
    }
  | { type: "stop" }
  | { type: "save_method" }
  | { type: "set_preferences"; preferences: Preferences }
  | { type: "attach_asset"; asset: StudioAsset };

export interface PublicConfig {
  persistence: "cloud" | "unavailable";
  livePreviews: boolean;
  maxUploadBytes: number;
  sampleAvailable: boolean;
}

export interface SavedMethod {
  sessionId: string;
  lookId: LookId;
  name: string;
  savedAt: string;
  actions: PlanAction[];
  tools: ToolId[];
  outcome?: Outcome;
}
