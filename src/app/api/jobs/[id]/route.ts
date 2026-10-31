import { ApiError, requireOwner } from "@/lib/server/auth";
import { getPool } from "@/lib/server/db";
import { isUuid } from "@/lib/server/sessions";
import { handle, json } from "@/lib/server/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    if (!isUuid(id))
      throw new ApiError(
        404,
        "JOB_NOT_FOUND",
        "This preview job could not be found.",
      );
    const result = await getPool().query(
      'SELECT id,state,error_code AS "errorCode",error_message AS "message",output_asset_id AS "assetId",created_at AS "createdAt" FROM provider_jobs WHERE id=$1 AND owner_id=$2',
      [id, ownerId],
    );
    if (!result.rows[0])
      throw new ApiError(
        404,
        "JOB_NOT_FOUND",
        "This preview job could not be found.",
      );
    return json(result.rows[0]);
  });
}
