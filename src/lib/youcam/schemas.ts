import { z } from "zod";

/** URLs remain private transport values and are never copied to client errors. */
export const TransportUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.hostname !== "localhost" &&
        !url.hostname.endsWith(".local") &&
        !/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
          url.hostname,
        ) &&
        !url.hostname.includes(":")
      );
    } catch {
      return false;
    }
  }, "A secure public transport URL is required.");

const UploadRequestSchema = z.object({
  url: TransportUrlSchema,
  method: z.enum(["PUT", "POST"]),
  headers: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const FileResponseSchema = z.object({
  status: z.literal(200),
  data: z.object({
    files: z
      .array(
        z.object({
          file_id: z.string().min(1).max(2048),
          file_name: z.string().optional(),
          content_type: z.string().optional(),
          // Expanded multipart protocols must be implemented rather than guessed.
          requests: z.array(UploadRequestSchema).length(1),
        }),
      )
      .length(1),
  }),
});

export const SubmitResponseSchema = z.object({
  status: z.literal(200),
  data: z.object({ task_id: z.string().min(1).max(2048) }),
});

const RunningData = z.object({
  task_status: z.enum(["running", "queued", "processing"]),
});
const SuccessData = z.object({
  task_status: z.literal("success"),
  // OpenAPI specifies {url}; the overview also documents [{download_url}].
  results: z.union([
    z.object({ url: TransportUrlSchema }),
    z.array(z.object({ download_url: TransportUrlSchema })).length(1),
  ]),
});
const ErrorData = z.object({
  task_status: z.literal("error"),
  error: z.string().nullable().optional(),
  error_message: z.string().optional(),
  failure_reason: z.string().optional(),
});

export const TaskResponseSchema = z.object({
  status: z.literal(200),
  data: z.union([RunningData, SuccessData, ErrorData]),
});

export const ErrorResponseSchema = z.object({
  status: z.number().optional(),
  error_code: z.string().optional(),
  error: z.string().optional(),
});

export const FeatureCostsResponseSchema = z.object({
  status: z.literal(200),
  result: z.object({
    next_token: z.string().nullable().optional(),
    skus: z.array(
      z.object({
        description: z.string().min(1),
        amount: z.number().finite().nonnegative(),
        unit: z.enum(["result_image", "second"]),
        proc_unit: z.number().int().positive(),
        run_task_url: TransportUrlSchema,
      }),
    ),
  }),
});
