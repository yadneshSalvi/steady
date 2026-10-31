import { describe, expect, it, vi } from "vitest";
import type { LookId } from "../src/lib/contracts";
import {
  getFeatureCosts,
  getMakeupTask,
  InvalidRecipeError,
  makeRecipe,
  registerFile,
  submitMakeupTask,
  uploadFile,
  validateEffects,
  YouCamError,
  type YouCamOptions,
} from "../src/lib/youcam";
import fixtures from "../src/lib/youcam/fixtures/official-examples.json";

const reply = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const options = (fetcher: typeof fetch): YouCamOptions => ({
  baseUrl: "https://api.example.test",
  apiKey: "test-key",
  fetch: fetcher,
});

describe("YouCam recipe contract", () => {
  it("labels its fixtures as schema examples rather than live evidence", () => {
    expect(fixtures.metadata.provenance).toBe(
      "sanitized_official_schema_examples",
    );
  });

  it("validates every shipped look/route/lips recipe and explicitly disables all smoothing", () => {
    for (const look of ["rose", "terracotta", "berry"] as LookId[])
      for (const route of ["tap", "sweep", "sponge"] as const)
        for (const lips of [false, true]) {
          const effects = makeRecipe(look, route, lips);
          expect(validateEffects(effects)).toEqual(effects);
          expect(
            effects.filter((effect) => effect.category === "skin_smooth"),
          ).toEqual([
            {
              category: "skin_smooth",
              skinSmoothStrength: 0,
              skinSmoothColorIntensity: 0,
            },
          ]);
          expect(
            effects.some((effect) => effect.category === "lip_color"),
          ).toBe(lips);
          expect(
            effects.find((effect) => effect.category === "blush")?.pattern,
          ).toEqual({ name: fixtures.catalogSubset.blush.label });
        }
  });

  it("rejects implicit/nonzero smoothing, unsupported categories and wrong palettes before network access", async () => {
    const recipe = makeRecipe("rose", "tap", false);
    const fetcher = vi.fn<typeof fetch>();
    const invalid = [
      recipe.slice(1),
      [{ ...recipe[0], skinSmoothStrength: 1 }, recipe[1]],
      [{ category: "skin_smooth", skinSmoothStrength: 0 }, recipe[1]],
      [...recipe, recipe[1]],
      [
        recipe[0],
        {
          category: "blush",
          pattern: { name: "made-up-pattern" },
          palettes: [
            { color: "#ffffff", texture: "matte", colorIntensity: 30 },
          ],
        },
      ],
      [
        recipe[0],
        {
          category: "blush",
          pattern: { name: "1color1" },
          palettes: [
            { color: "#ffffff", texture: "satin", colorIntensity: 30 },
          ],
        },
      ],
      [
        recipe[0],
        {
          category: "blush",
          pattern: { name: "1color1" },
          palettes: [
            { color: "#ffffff", texture: "matte", colorIntensity: 30 },
            { color: "#ffffff", texture: "matte", colorIntensity: 30 },
          ],
        },
      ],
      [recipe[0], { category: "eye_liner", palettes: [] }],
    ];
    for (const effects of invalid)
      await expect(
        submitMakeupTask({ fileId: "file", effects }, options(fetcher)),
      ).rejects.toBeInstanceOf(InvalidRecipeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("server-only transport adapter", () => {
  it("registers metadata then uploads actual bytes using the returned method/headers without a bearer token", async () => {
    const registration = structuredClone(fixtures.file);
    registration.data.files[0].requests[0].method = "POST";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(registration))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const bytes = Uint8Array.from([255, 216, 255, 0, 1]);
    await expect(
      uploadFile({ bytes, contentType: "image/jpeg" }, options(fetcher)),
    ).resolves.toEqual({ fileId: "sanitized-file-id" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe(registration.data.files[0].requests[0].url);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "image/jpeg",
      "Content-Length": "5",
      "x-upload-contract": "preserve-me",
    });
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(bytes);
    const first = fetcher.mock.calls[0][1];
    expect(JSON.parse(first?.body as string)).toEqual({
      files: [
        {
          content_type: "image/jpeg",
          file_name: "steady-image.jpg",
          file_size: 5,
        },
      ],
    });
    expect(first?.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });

  it("does not equate registration with upload or proceed after a failed upload", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(fixtures.file))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      uploadFile(
        {
          bytes: Uint8Array.from([255, 216, 255, 0, 1]),
          contentType: "image/jpeg",
        },
        options(fetcher),
      ),
    ).rejects.toMatchObject({ code: "upload_failed" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const invalid = vi.fn<typeof fetch>();
    await expect(
      uploadFile(
        { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" },
        options(invalid),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(invalid).not.toHaveBeenCalled();
  });

  it("uses exact async submission fields and encodes task identities in status paths", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(fixtures.submitted))
      .mockResolvedValueOnce(reply(fixtures.running));
    const effects = makeRecipe("rose", "tap", false);
    await expect(
      submitMakeupTask({ fileId: "file/id", effects }, options(fetcher)),
    ).resolves.toEqual({ taskId: "sanitized-task-id" });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({
      src_file_id: "file/id",
      version: "1.0",
      effects,
    });
    await expect(getMakeupTask("task/id", options(fetcher))).resolves.toEqual({
      state: "running",
    });
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://api.example.test/s2s/v2.0/task/makeup-vto/task%2Fid",
    );
  });

  it("accepts the two explicitly documented success result shapes and returns transport URLs internally", async () => {
    for (const data of [fixtures.success, fixtures.successOverviewArray]) {
      await expect(
        getMakeupTask(
          "task",
          options(vi.fn<typeof fetch>().mockResolvedValue(reply(data))),
        ),
      ).resolves.toEqual({
        state: "success",
        outputUrl: "https://storage.example.test/result.jpg",
      });
    }
    for (const data of [
      { status: 200, data: { task_status: "unknown" } },
      { status: 200, data: { task_status: "success" } },
      {
        status: 200,
        data: {
          task_status: "success",
          results: { url: "http://127.0.0.1/private" },
        },
      },
    ]) {
      await expect(
        getMakeupTask(
          "task",
          options(vi.fn<typeof fetch>().mockResolvedValue(reply(data))),
        ),
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  });

  it("marks network, 5xx and malformed successful submissions ambiguous without automatic retry", async () => {
    const responses = [
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(
          new Error("Network error https://private.invalid/?signed=do-not-log"),
        ),
      vi.fn<typeof fetch>().mockResolvedValue(reply({ status: 200, data: {} })),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("invalid json", { status: 200 })),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(reply({ error: "secret detail" }, 503)),
    ];
    for (const fetcher of responses) {
      try {
        await submitMakeupTask(
          { fileId: "file", effects: makeRecipe("rose", "tap", false) },
          options(fetcher),
        );
        expect.fail("Expected ambiguous submission");
      } catch (error) {
        expect(error).toBeInstanceOf(YouCamError);
        expect(error).toMatchObject({
          code: "unknown_submission",
          submissionUncertain: true,
          retryable: false,
        });
        expect(String(error)).not.toContain("signed");
        expect(String(error)).not.toContain("secret detail");
      }
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("halts insufficient credits and sanitizes auth/engine details", async () => {
    const credit = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(fixtures.creditError, 400));
    await expect(
      submitMakeupTask(
        { fileId: "file", effects: makeRecipe("rose", "tap", false) },
        options(credit),
      ),
    ).rejects.toMatchObject({
      code: "insufficient_credits",
      retryable: false,
      submissionUncertain: false,
    });
    await expect(
      getMakeupTask(
        "task",
        options(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(reply(fixtures.authError, 401)),
        ),
      ),
    ).rejects.toMatchObject({ code: "authentication_failed" });
    const engine = await getMakeupTask(
      "task",
      options(
        vi.fn<typeof fetch>().mockResolvedValue(
          reply({
            status: 200,
            data: {
              task_status: "error",
              error: "https://private.invalid/?signed=secret",
              error_message: "Bearer private-key",
            },
          }),
        ),
      ),
    );
    expect(engine).toMatchObject({
      state: "error",
      code: "provider_engine_error",
    });
    expect(JSON.stringify(engine)).not.toContain("secret");
    expect(JSON.stringify(engine)).not.toContain("private-key");
  });

  it("parses feature costs from result.skus, preserves amounts, and rejects data.skus", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(fixtures.costs));
    const costs = await getFeatureCosts(
      { pageSize: 10, startingToken: "next page" },
      options(fetcher),
    );
    expect(costs.nextToken).toBeNull();
    expect(costs.skus[0]).toMatchObject({
      amount: 9,
      procUnit: 1,
      unit: "result_image",
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.example.test/s2s/v2.0/credit/feature-cost?page_size=10&starting_token=next+page",
    );
    await expect(
      getFeatureCosts(
        {},
        options(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(
              reply({ status: 200, data: fixtures.costs.result }),
            ),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("preserves explicit rate limiting, rejects unrecognized upload contracts and unsafe destinations", async () => {
    await expect(
      getMakeupTask(
        "task",
        options(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(
              reply({ status: 429 }, 429, { "retry-after": "30" }),
            ),
        ),
      ),
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
      retryAfterSeconds: 30,
    });
    const badFile = structuredClone(fixtures.file);
    badFile.data.files[0].requests[0].url = "https://localhost/upload";
    await expect(
      registerFile(
        { byteLength: 5, contentType: "image/jpeg" },
        options(vi.fn<typeof fetch>().mockResolvedValue(reply(badFile))),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
