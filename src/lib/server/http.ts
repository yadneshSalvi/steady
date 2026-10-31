import "server-only";
import { ZodError } from "zod";
import { ApiError } from "./auth";
import { DomainError } from "@/lib/planner";

export async function readJson(
  request: Request,
  limit = 65_536,
): Promise<unknown> {
  const text = await request.text();
  if (text.length > limit)
    throw new ApiError(413, "REQUEST_TOO_LARGE", "This request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "This request could not be read.");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error: unknown): Response {
  if (error instanceof ApiError)
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      error.status,
    );
  if (error instanceof ZodError)
    return json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Please check your choices and try again.",
          retryable: false,
        },
      },
      400,
    );
  if (error instanceof DomainError)
    return json(
      {
        error: {
          code: error.code.toUpperCase(),
          message: error.message,
          retryable: false,
        },
      },
      422,
    );
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z_]+$/.test(error.code)
  )
    return json(
      { error: { code: error.code, message: error.message, retryable: false } },
      422,
    );
  const unavailable =
    error instanceof Error &&
    ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"].includes(error.message);
  console.error(
    `[api] ${unavailable ? "configuration_unavailable" : "request_error"}`,
  );
  return json(
    {
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        message:
          "Your studio could not connect just now. Your saved work is still here. Please try again.",
        retryable: true,
      },
    },
    503,
  );
}
export async function handle(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return failure(error);
  }
}
