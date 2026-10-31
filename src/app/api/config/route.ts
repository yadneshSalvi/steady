import type { PublicConfig } from "@/lib/contracts";
import { databaseConfigured } from "@/lib/server/db";
import { MAX_UPLOAD_BYTES } from "@/lib/server/assets";
import { json } from "@/lib/server/http";
import { freshPreviewAvailability } from "@/lib/server/preview-budget";
export async function GET() {
  const budget = await freshPreviewAvailability();
  const config: PublicConfig = {
    persistence: databaseConfigured() ? "cloud" : "unavailable",
    livePreviews: budget.available,
    livePreviewReason: budget.reason,
    livePreviewMessage: budget.message,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    sampleAvailable: true,
  };
  return json(config);
}
