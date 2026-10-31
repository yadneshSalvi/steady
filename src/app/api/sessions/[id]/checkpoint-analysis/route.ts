import { z } from "zod";
import { assertSameOrigin, requireOwner, ApiError } from "@/lib/server/auth";
import { analyzeCheckpoint } from "@/lib/server/vision-assistant";
import { reserveAIRequest } from "@/lib/server/ai-input";
import { readAssetBytes } from "@/lib/server/assets";
import {
  ownedSession,
  expectRevision,
  persistSession,
} from "@/lib/server/sessions";
import { transaction } from "@/lib/server/db";
import { currentAction, applyCommand } from "@/lib/planner";
import { handle, json, readJson } from "@/lib/server/http";
const schema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    actionId: z.string().min(1).max(150),
    assetId: z.string().uuid(),
    consent: z.literal(true),
  })
  .strict();
export const maxDuration = 90;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    const input = schema.parse(await readJson(request));
    const session = await ownedSession(ownerId, id);
    expectRevision(session, input.expectedRevision);
    if (session.stage !== "applying")
      throw new ApiError(
        409,
        "STUDIO_PAUSED",
        "Continue your studio before requesting a fresh checkpoint assessment.",
      );
    const action = currentAction(session);
    if (!action || action.id !== input.actionId)
      throw new ApiError(
        409,
        "STEP_CHANGED",
        "This step has changed. Please use the current instruction.",
      );
    const selected = session.assets.find(
      (asset) =>
        asset.id === input.assetId &&
        asset.provenance === "actual_capture" &&
        asset.purpose === "checkpoint",
    );
    if (!selected || !session.sourceAssetId)
      throw new ApiError(
        422,
        "CHECKPOINT_REQUIRED",
        "Choose an actual checkpoint photo from this studio.",
      );
    await reserveAIRequest(ownerId, "checkpoint");
    const [baseline, checkpoint] = await Promise.all([
      readAssetBytes(ownerId, session.sourceAssetId),
      readAssetBytes(ownerId, input.assetId),
    ]);
    const availableActions = (session.activePlan?.actions || []).filter(
      (candidate) => !session.completedActionIds.includes(candidate.id),
    );
    const assessment = await analyzeCheckpoint({
      baseline: { bytes: baseline, contentType: "image/jpeg" },
      checkpoint: { bytes: checkpoint, contentType: "image/jpeg" },
      action,
      availableActions,
    });
    const next = await transaction(async (client) => {
      const current = await ownedSession(ownerId, id, client, true);
      expectRevision(current, input.expectedRevision);
      const updated = applyCommand(current, {
        type: "checkpoint",
        actionId: input.actionId,
        assetId: input.assetId,
      });
      const observation = updated.observations.at(-1)!;
      observation.state = assessment.state;
      observation.reason = assessment.summary;
      observation.reasons = assessment.reasons;
      observation.model = assessment.model;
      observation.method = "vision_assistant_v1";
      if (
        assessment.suggestedActionId &&
        current.activePlan?.actions.some(
          (candidate) =>
            candidate.id === assessment.suggestedActionId &&
            !current.completedActionIds.includes(candidate.id),
        )
      )
        observation.suggestedActionId = assessment.suggestedActionId;
      await persistSession(client, updated, current.events);
      return updated;
    });
    return json(next);
  });
}
