import { z } from "zod";
import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { createUploadIntent } from "@/lib/server/assets";
import { handle, json, readJson } from "@/lib/server/http";
const schema = z
  .object({
    sessionId: z.string().uuid(),
    purpose: z.enum(["baseline", "checkpoint", "final"]),
  })
  .strict();
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = schema.parse(await readJson(request));
    return json(
      await createUploadIntent(ownerId, input.sessionId, input.purpose),
    );
  });
}
