import { z } from "zod";

const comfort = z.enum(["comfortable", "avoid", "unknown"]);
export const preferencesSchema = z
  .object({
    movements: z
      .object({ tapping: comfort, blending: comfort, short_strokes: comfort })
      .strict(),
    hand: z.enum(["left", "right", "either"]),
    pace: z.enum(["my_pace", "offer_breaks"]),
    audio: z.boolean(),
    mirror: z.boolean(),
  })
  .strict();
export const setupSchema = z
  .object({
    lookId: z.enum(["rose", "terracotta", "berry", "eyes"]),
    includeLips: z.boolean(),
    preferences: preferencesSchema,
    tools: z
      .array(
        z.enum([
          "fingertips",
          "sponge",
          "wide_brush",
          "lip_brush",
          "liner_pen",
        ]),
      )
      .max(5),
    products: z
      .array(
        z.enum([
          "cream_blush",
          "powder_blush",
          "lip_color",
          "eye_liner",
          "eye_shadow",
        ]),
      )
      .max(5),
    mode: z.enum(["personal", "sample"]),
    consent: z.literal(true),
    sourceAssetId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "sample" && value.includeLips)
      context.addIssue({
        code: "custom",
        path: ["includeLips"],
        message:
          "Recorded samples cover cheeks or eyes. Lip color is available in a personal studio.",
      });
    if (value.lookId === "eyes" && value.includeLips)
      context.addIssue({
        code: "custom",
        path: ["includeLips"],
        message:
          "Defined eyes is an eye-only goal. Leave optional lip color off.",
      });
  });
const id = z.string().min(1).max(150);
export const measurementSchema = z
  .object({
    version: z.literal(1),
    geometryVersion: z
      .enum(["landmark-polygon-v1", "cheekbone-oval-v2"])
      .optional(),
    sampleCheckpointId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    region: z.enum([
      "left_cheek",
      "right_cheek",
      "lips",
      "left_eye",
      "right_eye",
    ]),
    verdict: z.enum(["build", "at_target", "over", "insufficient"]),
    progress: z.number().min(0).max(1.5).nullable(),
    deltaA: z.number().min(-200).max(200).nullable(),
    deltaE00: z.number().min(0).max(200).nullable(),
    uniformity: z.number().min(0).max(1).nullable(),
    lagging: z
      .enum(["inner", "outer", "upper", "lower", "left", "right"])
      .nullable(),
    reason: z.string().max(600).optional(),
    provenance: z.enum(["local_camera", "simulated"]),
    reportedPass: z.boolean(),
    targetLevel: z.enum(["light", "build", "full"]),
    targetAssetId: z.string().min(1).max(240),
    elapsedMs: z.number().min(0).max(120000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.verdict !== "insufficient" &&
      (value.progress === null ||
        value.deltaA === null ||
        value.deltaE00 === null ||
        value.uniformity === null)
    )
      context.addIssue({
        code: "custom",
        message: "Measured observations require all scalar measurements.",
      });
    if (
      value.verdict === "insufficient" &&
      (!value.reason || value.progress !== null)
    )
      context.addIssue({
        code: "custom",
        message:
          "Insufficient observations require a reason and no progress claim.",
      });
  });
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve_candidate"), candidateId: id }).strict(),
  z
    .object({
      type: z.literal("select_preview_level"),
      candidateId: id,
      level: z.enum(["light", "build", "full"]),
    })
    .strict(),
  z.object({ type: z.literal("update_setup"), setup: setupSchema }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z
    .object({ type: z.literal("resume"), confirmedPhysicalState: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("checkpoint"),
      actionId: id,
      assetId: z.string().uuid().optional(),
      measurement: measurementSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("complete_action"), actionId: id }).strict(),
  z
    .object({
      type: z.literal("propose_adaptation"),
      reason: z.enum(["movement", "tool", "softer"]),
      routeId: z
        .enum(["tap", "sweep", "sponge", "buff", "liner", "shadow"])
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("accept_adaptation"), proposalId: id }).strict(),
  z.object({ type: z.literal("decline_adaptation") }).strict(),
  z.object({ type: z.literal("review") }).strict(),
  z
    .object({
      type: z.literal("finish"),
      satisfaction: z.enum(["yes", "partly", "not_yet"]),
      comfort: z.enum(["comfortable", "mixed", "difficult", "not_assessed"]),
      assistance: z.enum(["none", "verbal", "physical", "not_assessed"]),
      note: z.string().max(1000),
      finalAssetId: z.string().uuid().optional(),
    })
    .strict(),
  z.object({ type: z.literal("stop") }).strict(),
  z.object({ type: z.literal("save_method") }).strict(),
  z
    .object({
      type: z.literal("set_preferences"),
      preferences: preferencesSchema,
    })
    .strict(),
]);
export const commandEnvelopeSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    command: commandSchema,
  })
  .strict();
export const revisionSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export const finalizeSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    sessionId: z.string().uuid(),
    purpose: z.enum(["baseline", "checkpoint", "final"]),
  })
  .strict();
