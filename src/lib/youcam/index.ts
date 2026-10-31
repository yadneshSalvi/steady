import "server-only";
import type { MakeupEffect } from "../contracts";
import { validateEffects } from "./recipes";
import {
  ErrorResponseSchema,
  FeatureCostsResponseSchema,
  FileResponseSchema,
  SubmitResponseSchema,
  TaskResponseSchema,
} from "./schemas";

export {
  EffectSchema,
  EffectsSchema,
  InvalidRecipeError,
  makeRecipe,
  validateEffects,
} from "./recipes";

export interface YouCamOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export type YouCamErrorCode =
  | "not_configured"
  | "invalid_input"
  | "invalid_response"
  | "authentication_failed"
  | "insufficient_credits"
  | "rate_limited"
  | "unknown_submission"
  | "provider_unavailable"
  | "provider_error"
  | "invalid_task"
  | "task_expired"
  | "upload_failed";

export class YouCamError extends Error {
  readonly submissionUncertain: boolean;
  constructor(
    readonly code: YouCamErrorCode,
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "YouCamError";
    this.submissionUncertain = code === "unknown_submission";
  }
}

export interface UploadInput {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  fileName?: string;
}

export interface RegisteredFile {
  fileId: string;
  /** Private transport details. Do not return or log this signed destination. */
  request: {
    url: string;
    method: "PUT" | "POST";
    headers: Record<string, string>;
  };
}

export type MakeupTaskState =
  | { state: "running" }
  | { state: "success"; outputUrl: string }
  | { state: "error"; code: string; message: string };

export interface FeatureCost {
  description: string;
  amount: number;
  unit: "result_image" | "second";
  procUnit: number;
  runTaskUrl: string;
}

function configuration(options: YouCamOptions): {
  fetcher: typeof fetch;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
} {
  const baseUrl = options.baseUrl ?? process.env.YOUCAM_API_BASE_URL;
  const apiKey = options.apiKey ?? process.env.YOUCAM_API_KEY;
  if (!baseUrl || !apiKey)
    throw new YouCamError(
      "not_configured",
      "Live previews are not configured on this server.",
    );
  try {
    const parsed = new URL(baseUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
  } catch {
    throw new YouCamError(
      "not_configured",
      "The provider server configuration is invalid.",
    );
  }
  return {
    fetcher: options.fetch ?? globalThis.fetch,
    baseUrl,
    apiKey,
    timeoutMs: options.timeoutMs ?? 30_000,
  };
}

function unknownSubmission(status?: number): YouCamError {
  return new YouCamError(
    "unknown_submission",
    "The task submission could not be confirmed. It may have started; do not submit it again until the job has been reconciled.",
    false,
    status,
  );
}

function providerError(
  status: number,
  body: unknown,
  retryAfter?: string | null,
  submission = false,
): YouCamError {
  const parsed = ErrorResponseSchema.safeParse(body);
  const rawCode = parsed.success ? parsed.data.error_code : undefined;
  if (rawCode === "CreditInsufficiency" || rawCode === "InsufficientCredit")
    return new YouCamError(
      "insufficient_credits",
      "The shared preview account has insufficient credits. Your work is saved; no automatic refill will occur.",
      false,
      status,
    );
  if (
    status === 401 ||
    status === 403 ||
    rawCode === "InvalidApiKey" ||
    rawCode === "Unauthorized"
  )
    return new YouCamError(
      "authentication_failed",
      "The preview provider could not authenticate this server.",
      false,
      status,
    );
  if (status === 429 || rawCode === "TooManyRequests") {
    const seconds =
      retryAfter && /^\d+$/.test(retryAfter)
        ? Math.min(Number(retryAfter), 3600)
        : undefined;
    return new YouCamError(
      "rate_limited",
      "The preview provider is busy. Wait before retrying.",
      true,
      status,
      seconds,
    );
  }
  if (rawCode === "InvalidTaskId" || status === 404)
    return new YouCamError(
      "invalid_task",
      "This preview task could not be found. Keep your current plan while it is checked.",
      false,
      status,
    );
  if (rawCode === "TaskTimeout")
    return new YouCamError(
      "task_expired",
      "This provider task is no longer available. An expired link is not a stored result.",
      false,
      status,
    );
  if (submission && (status >= 500 || status === 408))
    return unknownSubmission(status);
  if (status >= 500)
    return new YouCamError(
      "provider_unavailable",
      "The preview provider is temporarily unavailable.",
      true,
      status,
    );
  return new YouCamError(
    "provider_error",
    "The preview provider rejected this request. Your current plan is preserved.",
    false,
    status,
  );
}

async function timedFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  submission = false,
): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      ...init,
      signal: abort.signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    if (submission) throw unknownSubmission();
    throw new YouCamError(
      "provider_unavailable",
      "The provider request did not complete. Your current work is preserved.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequest(
  path: string,
  method: "GET" | "POST",
  body: unknown,
  options: YouCamOptions,
  submission = false,
): Promise<unknown> {
  const config = configuration(options);
  const response = await timedFetch(
    config.fetcher,
    new URL(path, config.baseUrl).toString(),
    {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    config.timeoutMs,
    submission,
  );
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    if (submission && response.ok) throw unknownSubmission(response.status);
    throw providerError(
      response.status >= 400 ? response.status : 502,
      undefined,
      response.headers.get("retry-after"),
      submission,
    );
  }
  const status =
    typeof json === "object" && json !== null && "status" in json
      ? (json as { status?: unknown }).status
      : undefined;
  if (!response.ok || (typeof status === "number" && status >= 400)) {
    throw providerError(
      typeof status === "number" && status >= 400 ? status : response.status,
      json,
      response.headers.get("retry-after"),
      submission,
    );
  }
  return json;
}

function fileMetadata(input: {
  contentType: UploadInput["contentType"];
  byteLength: number;
  fileName?: string;
}): { content_type: string; file_size: number; file_name: string } {
  const fileName =
    input.fileName ??
    (input.contentType === "image/png"
      ? "steady-image.png"
      : "steady-image.jpg");
  if (
    !["image/jpeg", "image/png"].includes(input.contentType) ||
    !Number.isInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength >= 10_000_000 ||
    !/^[\w .-]{1,160}$/.test(fileName)
  ) {
    throw new YouCamError(
      "invalid_input",
      "Choose a JPEG or PNG under 10 MB with a simple file name.",
    );
  }
  return {
    content_type: input.contentType,
    file_size: input.byteLength,
    file_name: fileName,
  };
}

/** Metadata registration is not an upload and must not be used as one. */
export async function registerFile(
  input: {
    contentType: UploadInput["contentType"];
    byteLength: number;
    fileName?: string;
  },
  options: YouCamOptions = {},
): Promise<RegisteredFile> {
  const metadata = fileMetadata(input);
  const body = await apiRequest(
    "/s2s/v2.0/file",
    "POST",
    { files: [metadata] },
    options,
  );
  const parsed = FileResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unsupported file upload contract.",
    );
  const file = parsed.data.data.files[0];
  const request = file.requests[0];
  return {
    fileId: file.file_id,
    request: {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    },
  };
}

export async function uploadFile(
  input: UploadInput,
  options: YouCamOptions = {},
): Promise<{ fileId: string }> {
  fileMetadata({ ...input, byteLength: input.bytes.byteLength });
  const jpeg =
    input.bytes[0] === 0xff &&
    input.bytes[1] === 0xd8 &&
    input.bytes[2] === 0xff;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (value, index) => input.bytes[index] === value,
  );
  if (input.contentType === "image/jpeg" ? !jpeg : !png)
    throw new YouCamError(
      "invalid_input",
      "The image bytes do not match the declared JPEG or PNG format.",
    );
  const registration = await registerFile(
    { ...input, byteLength: input.bytes.byteLength },
    options,
  );
  const config = configuration(options);
  // Honor returned method/headers exactly; never forward the provider bearer
  // token to a presigned storage destination.
  const response = await timedFetch(
    config.fetcher,
    registration.request.url,
    {
      method: registration.request.method,
      headers: registration.request.headers,
      body: Uint8Array.from(input.bytes).buffer,
    },
    config.timeoutMs,
  );
  if (!response.ok)
    throw new YouCamError(
      "upload_failed",
      "The selected image was not uploaded successfully. No makeup task was submitted.",
      response.status >= 500 || response.status === 429,
      response.status,
    );
  return { fileId: registration.fileId };
}

export async function submitMakeupTask(
  input: { fileId: string; effects: MakeupEffect[] },
  options: YouCamOptions = {},
): Promise<{ taskId: string }> {
  const effects = validateEffects(input.effects);
  if (!input.fileId || input.fileId.length > 2048)
    throw new YouCamError(
      "invalid_input",
      "An uploaded provider file is required before submitting a preview.",
    );
  const body = await apiRequest(
    "/s2s/v2.0/task/makeup-vto",
    "POST",
    { src_file_id: input.fileId, version: "1.0", effects },
    options,
    true,
  );
  const parsed = SubmitResponseSchema.safeParse(body);
  if (!parsed.success) throw unknownSubmission();
  return { taskId: parsed.data.data.task_id };
}

const ENGINE_MESSAGES: Record<string, string> = {
  exceed_max_filesize:
    "The provider could not use this image size. Choose a smaller capture.",
  invalid_parameter:
    "The provider could not use this recipe. Rebuild the candidate before another request.",
  error_download_image:
    "The provider could not read the selected uploaded image.",
  error_decode_image:
    "The provider could not decode this image. Choose another JPEG or PNG.",
  error_nsfw_content_detected:
    "The provider declined this image. Choose a different capture.",
  error_inference: "The provider could not generate this preview.",
  unknown_internal_error: "The provider could not generate this preview.",
  error_below_min_image_size: "The provider needs a larger face image.",
  error_exceed_max_image_size: "The provider needs a smaller image.",
  error_face_position_invalid:
    "The provider needs a capture showing your whole face.",
  error_face_position_too_small:
    "The provider needs a capture with your face larger in the frame.",
  error_face_position_out_of_boundary:
    "The provider needs a capture with your whole face inside the frame.",
  error_face_angle_invalid: "The provider needs a more front-facing capture.",
};

/** One status read. Scheduling/backoff and durable identity belong to the workflow. */
export async function getMakeupTask(
  taskId: string,
  options: YouCamOptions = {},
): Promise<MakeupTaskState> {
  if (!taskId || taskId.length > 2048)
    throw new YouCamError(
      "invalid_input",
      "A valid provider task identity is required.",
    );
  const body = await apiRequest(
    `/s2s/v2.0/task/makeup-vto/${encodeURIComponent(taskId)}`,
    "GET",
    undefined,
    options,
  );
  const parsed = TaskResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unrecognized task status. The current target was not changed.",
    );
  const task = parsed.data.data;
  if (task.task_status === "success") {
    const outputUrl = Array.isArray(task.results)
      ? task.results[0].download_url
      : task.results.url;
    return { state: "success", outputUrl };
  }
  if (task.task_status === "error") {
    const known =
      task.error && Object.hasOwn(ENGINE_MESSAGES, task.error)
        ? task.error
        : "provider_engine_error";
    return {
      state: "error",
      code: known,
      message:
        ENGINE_MESSAGES[known] ??
        "The provider could not generate this preview. Your selected method is preserved.",
    };
  }
  return { state: "running" };
}

export async function getFeatureCosts(
  input: { pageSize?: number; startingToken?: string } = {},
  options: YouCamOptions = {},
): Promise<{ skus: FeatureCost[]; nextToken: string | null }> {
  const pageSize = input.pageSize ?? 20;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 20 ||
    (input.startingToken && input.startingToken.length > 2048)
  )
    throw new YouCamError(
      "invalid_input",
      "The feature-cost page request is invalid.",
    );
  const query = new URLSearchParams({ page_size: String(pageSize) });
  if (input.startingToken) query.set("starting_token", input.startingToken);
  const body = await apiRequest(
    `/s2s/v2.0/credit/feature-cost?${query}`,
    "GET",
    undefined,
    options,
  );
  const parsed = FeatureCostsResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unrecognized feature-cost response.",
    );
  return {
    nextToken: parsed.data.result.next_token ?? null,
    skus: parsed.data.result.skus.map((sku) => ({
      description: sku.description,
      amount: sku.amount,
      unit: sku.unit,
      procUnit: sku.proc_unit,
      runTaskUrl: sku.run_task_url,
    })),
  };
}
