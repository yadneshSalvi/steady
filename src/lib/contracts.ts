/** Shared browser/server contracts. A virtual preview can never be an actual capture. */
export type Motion = "tapping" | "blending" | "short_strokes";
export type Comfort = "comfortable" | "avoid" | "unknown";
export type ToolId =
  "fingertips" | "sponge" | "wide_brush" | "lip_brush" | "liner_pen";
export type ProductId =
  "cream_blush" | "powder_blush" | "lip_color" | "eye_liner" | "eye_shadow";
export type EyeRegion = "left_eye" | "right_eye";
export type EyeMethod = "liner" | "shadow";
export type Region = "left_cheek" | "right_cheek" | "lips" | EyeRegion;
export type LookId = "rose" | "terracotta" | "berry" | "eyes";
export type PreviewLevel = "light" | "build" | "full";
export type PreviewStatus =
  "not_requested" | "queued" | "processing" | "ready" | "failed" | "cancelled";
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
  precision?: "low" | "high";
  tool: ToolId;
  product: ProductId;
  dependsOn: string[];
  alternativeIds: string[];
  evidencePolicy: "user_judgment";
}

export interface CandidatePlan {
  id: string;
  routeId: "tap" | "sweep" | "sponge" | "buff" | EyeMethod;
  name: string;
  tagline: string;
  description: string;
  tools: ToolId[];
  attributes: string[];
  tradeoffs: string[];
  actions: PlanAction[];
  previewStatus: PreviewStatus;
  previewAsset?: StudioAsset;
  previewJobId?: string;
  previewError?: string;
  previewRetryable?: boolean;
  recipe: MakeupEffect[];
  previewVariants?: PreviewVariant[];
  selectedPreviewVariantId?: PreviewLevel;
}

export interface PreviewVariant {
  id: PreviewLevel;
  intensity: 25 | 45 | 65;
  recipe: MakeupEffect[];
  previewStatus: PreviewStatus;
  previewAsset?: StudioAsset;
  previewJobId?: string;
  previewError?: string;
  previewRetryable?: boolean;
}

/** Scalar local observations only: frames and face coordinates are never stored. */
export interface StoredMeasurement {
  version: 1;
  region: Region;
  verdict: "build" | "at_target" | "over" | "insufficient";
  progress: number | null;
  deltaA: number | null;
  deltaE00: number | null;
  uniformity: number | null;
  lagging: "inner" | "outer" | "upper" | "lower" | "left" | "right" | null;
  reason?: string;
  provenance: "local_camera" | "simulated";
  reportedPass: boolean;
  targetLevel: PreviewLevel;
  targetAssetId: string;
  elapsedMs: number;
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
  actionSnapshot?: PlanAction;
  assetId?: string;
  state:
    | "insufficient_evidence"
    | "unsupported_action"
    | "ai_observation"
    | "optional_adjustment"
    | "measured_checkpoint";
  reason: string;
  method: "user_judgment_only_v1" | "vision_assistant_v1" | "local_color_v1";
  measurement?: StoredMeasurement;
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
  measurement?: StoredMeasurement;
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
  productChangeNote?: string;
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
  previewBatch?: {
    requested: number;
    queued: number;
    deferred: number;
    remaining: number;
    message?: string;
  };
}

export type SessionCommand =
  | { type: "approve_candidate"; candidateId: string }
  | { type: "select_preview_level"; candidateId: string; level: PreviewLevel }
  | { type: "update_setup"; setup: SetupInput }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume"; confirmedPhysicalState: boolean }
  | {
      type: "checkpoint";
      actionId: string;
      assetId?: string;
      measurement?: StoredMeasurement;
    }
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
  livePreviewReason?: "disabled" | "balance_floor" | "balance_unavailable";
  livePreviewMessage?: string;
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
