import { start } from "workflow/api";
import { eraseSessionWorkflow } from "@/workflows/erase-session";
import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { ownedSession, markSessionDeleted } from "@/lib/server/sessions";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () =>
    json(
      await ownedSession(
        await requireOwner(request),
        (await context.params).id,
      ),
    ),
  );
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    await markSessionDeleted(ownerId, id);
    await start(eraseSessionWorkflow, [id]);
    return json({ deleted: true, cleanup: "queued" });
  });
}
