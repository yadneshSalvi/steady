import { readFileSync } from "node:fs";
import type { Browser, BrowserContextOptions } from "@playwright/test";

type StorageState = Exclude<
  NonNullable<BrowserContextOptions["storageState"]>,
  string
>;

/** Share deployment protection, never application authentication. */
export function deploymentStorageState(
  baseURL = process.env.TEST_BASE_URL || "http://localhost:3000",
): StorageState | undefined {
  const path = process.env.TEST_DEPLOYMENT_STORAGE_STATE;
  if (!path) return undefined;
  const invalid = () =>
    new Error(
      "Deployment test state must contain only a host-scoped Vercel protection cookie and no app authentication or origins.",
    );
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as StorageState;
    const host = new URL(baseURL).hostname;
    if (
      !Array.isArray(state.cookies) ||
      !state.cookies.length ||
      !Array.isArray(state.origins) ||
      state.origins.length
    )
      throw invalid();
    if (
      !state.cookies.every(
        (cookie) =>
          cookie.name === "_vercel_jwt" &&
          cookie.domain === host &&
          cookie.path === "/" &&
          typeof cookie.value === "string" &&
          cookie.value.length > 0 &&
          typeof cookie.expires === "number" &&
          Number.isFinite(cookie.expires) &&
          typeof cookie.httpOnly === "boolean" &&
          cookie.secure === true &&
          ["Lax", "Strict", "None"].includes(cookie.sameSite),
      )
    )
      throw invalid();
    return {
      cookies: state.cookies.map(
        ({
          name,
          value,
          domain,
          path,
          expires,
          httpOnly,
          secure,
          sameSite,
        }) => ({
          name,
          value,
          domain,
          path,
          expires,
          httpOnly,
          secure,
          sameSite,
        }),
      ),
      origins: [],
    };
  } catch {
    // Do not disclose parser errors, private files, or cookie values.
    throw invalid();
  }
}

export async function newIsolatedAppContext(
  browser: Browser,
  options: Omit<BrowserContextOptions, "storageState"> = {},
) {
  const baseURL =
    options.baseURL || process.env.TEST_BASE_URL || "http://localhost:3000";
  return browser.newContext({
    ...options,
    baseURL,
    storageState: deploymentStorageState(baseURL),
  });
}
