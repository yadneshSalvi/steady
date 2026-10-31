import type { PublicConfig } from "@/lib/contracts";
import { databaseConfigured } from "@/lib/server/db";
import { MAX_UPLOAD_BYTES } from "@/lib/server/assets";
import { json } from "@/lib/server/http";
export async function GET() {
  const config: PublicConfig = {
    persistence: databaseConfigured() ? "cloud" : "unavailable",
    livePreviews:
      process.env.YOUCAM_LIVE_ENABLED === "true" &&
      Boolean(process.env.YOUCAM_API_KEY),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    sampleAvailable: true,
  };
  return json(config);
}
