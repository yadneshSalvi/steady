import type { SavedMethod } from "@/lib/contracts";
import { requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { listSessions } from "@/lib/server/sessions";
export async function GET(request: Request) {
  return handle(async () => {
    const sessions = await listSessions(await requireOwner(request));
    const methods: SavedMethod[] = sessions
      .filter((s) => s.savedMethod && s.activePlan)
      .map((s) => ({
        sessionId: s.id,
        lookId: s.lookId,
        name: s.activePlan!.name,
        savedAt: s.updatedAt,
        actions: s.activePlan!.actions,
        tools: s.activePlan!.tools,
        outcome: s.outcome,
      }));
    return json({ methods });
  });
}
