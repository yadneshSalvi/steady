import "server-only";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { getPool } from "./db";

function buildAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("AUTH_UNAVAILABLE");
  return betterAuth({
    appName: "STEADY",
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    trustedOrigins: [
      process.env.BETTER_AUTH_URL || "http://localhost:3000",
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 40 },
    plugins: [anonymous({ disableDeleteAnonymousUser: true })],
  });
}

let configuredAuth: ReturnType<typeof buildAuth> | undefined;
export function getAuth() {
  return (configuredAuth ??= buildAuth());
}

export async function requireOwner(request: Request): Promise<string> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session)
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "Please reopen your studio to continue.",
    );
  return session.user.id;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([
    requestOrigin,
    process.env.BETTER_AUTH_URL,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ]);
  if (origin && !allowed.has(origin))
    throw new ApiError(
      403,
      "ORIGIN_REJECTED",
      "This request did not come from your studio.",
    );
}
