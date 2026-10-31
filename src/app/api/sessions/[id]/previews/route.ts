import { start } from "workflow/api";
import { z } from "zod";
import { previewWorkflow } from "@/workflows/preview";
import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { getPool } from "@/lib/server/db";
import {
  queuePreviews,
  requesterHash,
  failJob,
  setPreviewStatus,
  cancelSessionPreviews,
} from "@/lib/server/jobs";
import { ownedSession } from "@/lib/server/sessions";
import { handle, json, readJson } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
const previewRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    candidateId: z.string().min(1).max(200).optional(),
    variantId: z.enum(["light", "build", "full"]).optional(),
  })
  .strict();
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request, { requireOrigin: true });
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    const { expectedRevision, candidateId, variantId } =
      previewRequestSchema.parse(await readJson(request));
    const { jobs } = await queuePreviews(
      ownerId,
      id,
      expectedRevision,
      requesterHash(request),
      { candidateId, variantId },
    );
    for (const job of jobs) {
      try {
        const run = await start(previewWorkflow, [job.id]);
        await getPool().query(
          "UPDATE provider_jobs SET workflow_run_id=$2 WHERE id=$1 AND (workflow_run_id IS NULL OR workflow_run_id=$2)",
          [job.id, run.runId],
        );
      } catch {
        if (job.provider_task_id) {
          await getPool().query(
            "UPDATE provider_jobs SET state='failed',error_code='workflow_interrupted',error_message='The existing preview task could not be resumed. Please try again.',updated_at=now() WHERE id=$1 AND workflow_run_id IS NULL AND state='waiting'",
            [job.id],
          );
          await setPreviewStatus(job.id, "failed");
        } else
          await failJob(
            job.id,
            "dispatch_failed",
            "The preview could not be started. Your choices are saved.",
            false,
            true,
          );
      }
    }
    return json(await ownedSession(ownerId, id), 202);
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    return json(
      await cancelSessionPreviews(
        await requireOwner(request),
        (await context.params).id,
      ),
    );
  });
}
