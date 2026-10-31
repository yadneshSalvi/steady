"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });
let authentication: Promise<void> | null = null;

export async function ensureAuthenticated(): Promise<void> {
  if (!authentication) {
    authentication = (async () => {
      const current = await authClient.getSession();
      if (current.data?.user) return;
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
