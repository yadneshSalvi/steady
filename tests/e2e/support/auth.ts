import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

/** Fresh test browsers share an IP; honor the real sign-in guard between them. */
export async function signInAnonymous(
  request: APIRequestContext,
  origin = process.env.TEST_BASE_URL || "http://localhost:3000",
): Promise<APIResponse> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post("/api/auth/sign-in/anonymous", {
      data: {},
      headers: { Origin: origin },
    });
    if (response.status() !== 429) {
      expect(
        response.ok(),
        `Anonymous sign-in returned ${response.status()}`,
      ).toBe(true);
      return response;
    }
    const seconds = Number(
      response.headers()["x-retry-after"] ||
        response.headers()["retry-after"] ||
        10,
    );
    const delay = Number.isFinite(seconds)
      ? Math.min(15, Math.max(1, seconds))
      : 10;
    await new Promise((resolve) => setTimeout(resolve, delay * 1000 + 100));
  }
  throw new Error(
    "Anonymous test sign-in remained rate limited after its retry window.",
  );
}
