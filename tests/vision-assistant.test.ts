import {
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import sharp from "sharp";
import {
  analyzeCheckpoint,
  analyzeInspiration,
  recognizeTools,
} from "@/lib/server/vision-assistant";
import type { PlanAction } from "@/lib/contracts";

let bytes: Buffer;
let differentBytes: Buffer;
const action: PlanAction = {
  id: "cheek-step",
  techniqueId: "tap",
  techniqueVersion: 1,
  validation: "draft",
  title: "Tap the cheek color",
  instruction: "Use your confirmed cream blush with comfortable tapping.",
  detail: "Your own pace.",
  stoppingCue: "Stop whenever you wish.",
  region: "left_cheek",
  motion: "tapping",
  tool: "fingertips",
  product: "cream_blush",
  dependsOn: [],
  alternativeIds: [],
  evidencePolicy: "user_judgment",
};
const inspiration = {
  usable: true,
  lookId: "rose",
  attributes: ["Soft rose cheek color"],
  description: "A soft rose palette.",
  uncertainties: ["The exact product shade cannot be identified."],
};
function gemini(data: unknown) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(data) }] },
      },
    ],
  });
}
function openai(data: unknown) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(data) }],
      },
    ],
  });
}

beforeAll(async () => {
  bytes = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#d5ac9f" },
  })
    .jpeg()
    .toBuffer();
  differentBytes = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#c58986" },
  })
    .jpeg()
    .toBuffer();
});
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
  vi.stubEnv("VISION_PRIMARY_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_VISION_MODEL", "gemini-4-argon");
  vi.stubEnv("OPENAI_VISION_MODEL", "gpt-6-astra");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("selected-still AI boundaries", () => {
  it("normalizes images and uses a strict schema without exposing keys or arbitrary URLs in the result", async () => {
    const fetcher = vi.fn().mockResolvedValue(gemini(inspiration));
    vi.stubGlobal("fetch", fetcher);
    const result = await analyzeInspiration({
      bytes,
      contentType: "image/jpeg",
    });
    expect(result).toMatchObject({ lookId: "rose", model: "gemini-4-argon" });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent",
    );
    const body = JSON.parse(options.body);
    expect(body.generationConfig.responseJsonSchema.additionalProperties).toBe(
      false,
    );
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(body.systemInstruction.parts[0].text).toContain(
      "untrusted visual data",
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects unsupported file contents before contacting a provider", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      analyzeInspiration({
        bytes: Buffer.from("<svg>unsafe</svg>"),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "VISION_IMAGE_INVALID" });
    await expect(
      analyzeInspiration({ bytes, contentType: "image/png" }),
    ).rejects.toMatchObject({ code: "VISION_IMAGE_INVALID" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails over after an invalid model response and reports the model actually used", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        gemini({ ...inspiration, lookId: "invented-palette" }),
      )
      .mockResolvedValueOnce(openai(inspiration));
    vi.stubGlobal("fetch", fetcher);
    expect(
      await analyzeInspiration({ bytes, contentType: "image/jpeg" }),
    ).toMatchObject({ model: "gpt-6-astra", lookId: "rose" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).store).toBe(false);
  });

  it("does not coerce unrelated inspiration into a supported style", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(gemini({ ...inspiration, usable: false }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      analyzeInspiration({ bytes, contentType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "NO_VISIBLE_INSPIRATION" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps ambiguous tool recognition empty and deduplicates supported suggestions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        gemini({
          tools: ["sponge", "sponge"],
          products: [],
          notes: [
            "Confirm the sponge. Check the product label; the container is ambiguous.",
          ],
        }),
      ),
    );
    expect(
      await recognizeTools({ bytes, contentType: "image/jpeg" }),
    ).toMatchObject({ tools: ["sponge"], products: [] });
  });

  it("rejects identical checkpoint bytes without inventing progress or consuming inference", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await analyzeCheckpoint({
      baseline: { bytes, contentType: "image/jpeg" },
      checkpoint: { bytes, contentType: "image/jpeg" },
      action,
      availableActions: [action],
    });
    expect(result.state).toBe("insufficient_evidence");
    expect(result.model).toBe("local-integrity-check");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops a suggested adjustment when pose or lighting is not comparable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        gemini({
          comparable: false,
          state: "optional_adjustment",
          summary: "The lighting changed; a comparison is uncertain.",
          reasons: ["Different exposure."],
          suggestedActionId: action.id,
        }),
      ),
    );
    const result = await analyzeCheckpoint({
      baseline: { bytes, contentType: "image/jpeg" },
      checkpoint: { bytes: differentBytes, contentType: "image/jpeg" },
      action,
      availableActions: [action],
    });
    expect(result.state).toBe("insufficient_evidence");
    expect(result.suggestedActionId).toBeUndefined();
  });

  it("cannot return a model-invented action or an action for another region", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        gemini({
          comparable: true,
          state: "optional_adjustment",
          summary: "A different edge may be visible.",
          reasons: ["Tentative cosmetic observation."],
          suggestedActionId: "invented-step",
        }),
      ),
    );
    const result = await analyzeCheckpoint({
      baseline: { bytes, contentType: "image/jpeg" },
      checkpoint: { bytes: differentBytes, contentType: "image/jpeg" },
      action,
      availableActions: [action],
    });
    expect(result.state).toBe("insufficient_evidence");
    expect(result.suggestedActionId).toBeUndefined();
  });

  it("does not leak upstream errors or credentials when both providers fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response("private-image-body test-gemini-secret", {
            status: 500,
          }),
        ),
      ),
    );
    await expect(
      recognizeTools({ bytes, contentType: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: "VISION_UNAVAILABLE",
      message:
        "AI guidance could not read this photo right now. Try again, or continue with your own choices.",
    });
  });
});
