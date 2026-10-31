import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { SAMPLE_SETUP } from "../../../src/lib/catalog";
import type {
  SessionCommand,
  StudioAsset,
  StudioSession,
} from "../../../src/lib/contracts";
import { applyCommand, createSession } from "../../../src/lib/planner";
import { selectPreviewLevel } from "../../../src/lib/youcam/recipes";
import { RecordedLadderManifestSchema } from "../../../src/lib/youcam/ladder-recorded";
import recorded from "../../../public/examples/recorded-ladders.json" with { type: "json" };

export const ladder = RecordedLadderManifestSchema.parse(recorded);

/** Browser-pipeline fixture only: a synthetic camera source and genuine recorded
 * YouCam targets. No participant, private upload, or new provider request. */
export async function installStudioFixture(
  page: Page,
  options: { missingFull?: boolean } = {},
) {
  let session: StudioSession = createSession(
    { ...structuredClone(SAMPLE_SETUP), mode: "personal", consent: true },
    randomUUID(),
  );
  const source: StudioAsset = {
    id: ladder.source.assetId,
    url: ladder.source.url,
    provenance: "synthetic_inspiration",
    purpose: "baseline",
    width: ladder.source.width,
    height: ladder.source.height,
    createdAt: session.createdAt,
  };
  session.sourceAssetId = source.id;
  session.assets = [source];
  for (const candidate of session.candidates) {
    for (const variant of candidate.previewVariants!) {
      if (
        options.missingFull &&
        candidate === session.candidates[0] &&
        variant.id === "full"
      )
        continue;
      const record = ladder.records.find(
        (entry) =>
          entry.lookId === session.lookId &&
          entry.texture ===
            (candidate.routeId === "sweep" ? "matte" : "satin") &&
          entry.level === variant.id,
      )!;
      variant.previewAsset = {
        id: `fixture-${record.lookId}-${record.texture}-${record.level}`,
        url: record.output.url,
        provenance: "virtual_preview",
        purpose: "preview",
        width: record.output.width,
        height: record.output.height,
        createdAt: record.generatedAt,
        recordedAt: record.generatedAt,
        providerRequestHash: record.providerRequestHash,
      };
      variant.previewStatus = "ready";
      if (
        !session.assets.some((asset) => asset.id === variant.previewAsset!.id)
      )
        session.assets.push(variant.previewAsset);
    }
    selectPreviewLevel(candidate, "full");
  }
  session = applyCommand(session, {
    type: "approve_candidate",
    candidateId: session.candidates[0].id,
  });
  const commands: SessionCommand[] = [];
  const blockedRequests: string[] = [];
  await page.route(/\/api\/auth\/get-session(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        session: {
          id: "fixture-auth",
          userId: "fixture-owner",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        user: {
          id: "fixture-owner",
          name: "Synthetic browser fixture",
          email: "fixture@example.test",
          emailVerified: false,
        },
      },
    }),
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        persistence: "cloud",
        livePreviews: false,
        livePreviewReason: "balance_floor",
        livePreviewMessage:
          "Fresh previews are resting; recorded results still work.",
        maxUploadBytes: 8_000_000,
        sampleAvailable: true,
      },
    }),
  );
  await page.route(`**/api/sessions/${session.id}`, (route) =>
    route.fulfill({ json: session }),
  );
  await page.route(`**/api/sessions/${session.id}/events`, async (route) => {
    const input = route.request().postDataJSON() as {
      expectedRevision: number;
      command: SessionCommand;
    };
    expect(input.expectedRevision).toBe(session.revision);
    commands.push(input.command);
    session = applyCommand(session, input.command);
    await route.fulfill({ json: session });
  });
  await page.route(
    /\/api\/(?:assets\/|inspiration|tool-suggestions|voice\/transcribe|sessions\/[^/]+\/(?:previews|checkpoint-analysis))/,
    async (route) => {
      blockedRequests.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEST_PROCESSING_DISABLED",
            message:
              "No provider or upload operations are allowed in this synthetic browser test.",
          },
        },
      });
    },
  );
  return {
    id: session.id,
    snapshot: () => structuredClone(session),
    commands,
    blockedRequests,
  };
}
