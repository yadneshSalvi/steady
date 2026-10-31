import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizePhoto } from "./assets";
import { transaction } from "./db";
import { ApiError } from "./auth";
import { readJson } from "./http";
const schema = z
  .object({ image: z.string().min(1).max(2_900_000), consent: z.literal(true) })
  .strict();
export async function selectedImage(request: Request) {
  const { image } = schema.parse(await readJson(request, 3_000_000));
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match)
    throw new ApiError(
      422,
      "IMAGE_REQUIRED",
      "Choose a JPEG, PNG, or WebP image.",
    );
  const photo = await normalizePhoto(Buffer.from(match[2], "base64"), match[1]);
  return { bytes: photo.bytes, contentType: "image/jpeg" };
}
export async function reserveAIRequest(ownerId: string, purpose: string) {
  const voice = purpose === "voice_command";
  const category = voice ? "voice" : "vision";
  const auditedPurpose = voice
    ? "voice_command:deepgram-consent-v1"
    : `${purpose}:gemini-openai-consent-v1`;
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `ai:${ownerId}:${category}`,
    ]);
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM ai_requests WHERE owner_id=$1 AND created_at>now()-interval '1 hour' AND (purpose LIKE 'voice_command%')=$2",
      [ownerId, voice],
    );
    if (Number(count.rows[0].count) >= (voice ? 360 : 60))
      throw new ApiError(
        429,
        "AI_REQUEST_LIMIT",
        `Please take a short break from ${voice ? "voice commands" : "image analysis"}. All manual controls remain available.`,
        true,
      );
    await client.query(
      "INSERT INTO ai_requests(id,owner_id,purpose) VALUES($1,$2,$3)",
      [randomUUID(), ownerId, auditedPurpose],
    );
  });
}
