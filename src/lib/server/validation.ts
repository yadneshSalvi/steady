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
    lookId: z.enum(["rose", "terracotta", "berry"]),
    includeLips: z.boolean(),
    preferences: preferencesSchema,
    tools: z
      .array(z.enum(["fingertips", "sponge", "wide_brush", "lip_brush"]))
      .max(4),
    products: z
      .array(z.enum(["cream_blush", "powder_blush", "lip_color"]))
      .max(3),
    mode: z.enum(["personal", "sample"]),
    consent: z.literal(true),
    sourceAssetId: z.string().uuid().optional(),
  })
  .strict();
const id = z.string().min(1).max(150);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve_candidate"), candidateId: id }).strict(),
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
    })
    .strict(),
  z.object({ type: z.literal("complete_action"), actionId: id }).strict(),
  z
    .object({
      type: z.literal("propose_adaptation"),
      reason: z.enum(["movement", "tool", "softer"]),
      routeId: z.enum(["tap", "sweep", "sponge"]).optional(),
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
