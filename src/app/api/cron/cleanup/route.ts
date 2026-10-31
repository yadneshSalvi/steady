import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/server/auth";
import { cleanExpiredData } from "@/lib/server/cleanup";
import { handle, json } from "@/lib/server/http";
export const maxDuration = 300;
export async function GET(request: Request) {
  return handle(async () => {
    const actual = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
    if (
      !process.env.CRON_SECRET ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "This maintenance route requires authorization.",
      );
    return json(await cleanExpiredData());
  });
}
