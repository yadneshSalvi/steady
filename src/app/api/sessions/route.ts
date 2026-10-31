import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { listSessions, newSession } from "@/lib/server/sessions";
import { setupSchema } from "@/lib/server/validation";
export async function GET(request: Request) {
  return handle(async () =>
    json({ sessions: await listSessions(await requireOwner(request)) }),
  );
}
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const setup = setupSchema.parse(await readJson(request));
    return json(await newSession(ownerId, setup), 201);
  });
}
