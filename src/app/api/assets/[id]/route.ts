import { requireOwner } from "@/lib/server/auth";
import { assetResponse } from "@/lib/server/assets";
import { handle } from "@/lib/server/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () =>
    assetResponse(await requireOwner(request), (await context.params).id),
  );
}
