import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { mutateSession } from "@/lib/server/sessions";
import { commandEnvelopeSchema } from "@/lib/server/validation";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    const { expectedRevision, command } = commandEnvelopeSchema.parse(
      await readJson(request),
    );
    return json(await mutateSession(ownerId, id, expectedRevision, command));
  });
}
