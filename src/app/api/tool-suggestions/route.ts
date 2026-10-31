import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { recognizeTools } from "@/lib/server/vision-assistant";
import { selectedImage, reserveAIRequest } from "@/lib/server/ai-input";
import { handle, json } from "@/lib/server/http";
export const maxDuration = 90;
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = await selectedImage(request);
    await reserveAIRequest(ownerId, "tools");
    return json(await recognizeTools(input));
  });
}
