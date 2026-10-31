import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizePhoto } from "./assets";
import { transaction } from "./db";
import { ApiError, requesterHash } from "./auth";
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
function hourlyLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(100_000, Math.floor(value)))
    : 0;
}

export async function reserveAIRequest(
  ownerId: string,
  purpose: string,
  request: Request,
) {
  const voice = purpose === "voice_command";
  const category = voice ? "voice" : "vision";
  const prefix = voice ? "VOICE" : "AI";
  const ipHash = requesterHash(request);
  const auditedPurpose = voice
    ? "voice_command:deepgram-consent-v1"
    : `${purpose}:gemini-openai-consent-v1`;
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `ai:${category}`,
    ]);
    const counts = await client.query<{
      global: string;
      owner: string;
      ip: string;
    }>(
      "SELECT count(*) AS global,count(*) FILTER (WHERE owner_id=$1) AS owner,count(*) FILTER (WHERE ip_hash=$2) AS ip FROM ai_requests WHERE created_at>now()-interval '1 hour' AND (purpose LIKE 'voice_command%')=$3",
      [ownerId, ipHash, voice],
    );
    const usage = counts.rows[0];
    if (
      Number(usage.global) >=
        hourlyLimit(`${prefix}_HOURLY_REQUEST_LIMIT`, voice ? 720 : 120) ||
      Number(usage.owner) >=
        hourlyLimit(`${prefix}_OWNER_HOURLY_REQUEST_LIMIT`, voice ? 360 : 60) ||
      Number(usage.ip) >=
        hourlyLimit(`${prefix}_IP_HOURLY_REQUEST_LIMIT`, voice ? 180 : 30)
    )
      throw new ApiError(
        429,
        "AI_REQUEST_LIMIT",
        `Please take a short break from ${voice ? "voice commands" : "image analysis"}. All manual controls remain available.`,
        true,
      );
    await client.query(
      "INSERT INTO ai_requests(id,owner_id,purpose,ip_hash) VALUES($1,$2,$3,$4)",
      [randomUUID(), ownerId, auditedPurpose, ipHash],
    );
  });
}
