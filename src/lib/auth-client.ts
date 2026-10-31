"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });
let authentication: Promise<void> | null = null;
const sessionUnavailable =
  "Your existing private session could not be checked. Please try again.";

function retryDelay(response: Response): number | null {
  const value =
    response.headers.get("x-retry-after") ||
    response.headers.get("retry-after");
  if (!value) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value)
    : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 60
    ? seconds * 1000 + 100
    : null;
}

/** A failed session read is not permission to replace this browser's identity. */
async function hasCurrentSession(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch("/api/auth/get-session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(sessionUnavailable);
    }
    if (response.status === 429) {
      const delay = retryDelay(response);
      if (attempt === 0 && delay !== null) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(
        "Your private session is resting briefly. Please try again in a moment.",
      );
    }
    if (response.status !== 200) throw new Error(sessionUnavailable);
    const session: unknown = await response.json().catch(() => {
      throw new Error(sessionUnavailable);
    });
    if (session === null) return false;
    if (
      typeof session === "object" &&
      session !== null &&
      "user" in session &&
      typeof session.user === "object" &&
      session.user !== null &&
      "id" in session.user &&
      typeof session.user.id === "string" &&
      session.user.id.length > 0
    )
      return true;
    throw new Error(sessionUnavailable);
  }
  throw new Error(sessionUnavailable);
}

export async function ensureAuthenticated(): Promise<void> {
  if (!authentication) {
    authentication = (async () => {
      if (await hasCurrentSession()) return;
      const result = await authClient.signIn.anonymous();
      if (result.error)
        throw new Error(
          result.error.status === 429
            ? "A few studios are opening at once. Please wait 10 seconds, then try again. Your choices are still here."
            : "Your private studio could not be opened. Please try again.",
        );
    })().catch((error) => {
      authentication = null;
      throw error;
    });
  }
  await authentication;
}
