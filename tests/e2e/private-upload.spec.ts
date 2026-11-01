/** Explicit service test using synthetic imagery only, with zero YouCam calls.
 * STEADY_RUN_PRIVATE_UPLOAD_E2E=1 node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/private-upload.spec.ts --output=/tmp/steady-private-upload-e2e-20261031
 * Reuses the running development server and removes only its own test studio.
 */
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type BrowserContext } from "@playwright/test";
import { BlobNotFoundError, del, head } from "@vercel/blob";
import { Pool } from "pg";
import type { StudioAsset, StudioSession } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";
import { newIsolatedAppContext } from "./support/deployment-context";

const enabled =
  process.env.STEADY_RUN_PRIVATE_UPLOAD_E2E === "1" &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

test("synthetic personal photo stays private and deletion erases its owned object", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(
    !enabled,
    "Explicit private-upload test opt-in and configured private test services are required.",
  );
  test.setTimeout(180_000);
  const origin = baseURL || "http://localhost:3000";
  const database = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 8000,
    statement_timeout: 5000,
  });
  const otherContexts: BrowserContext[] = [];
  const testOwners: string[] = [];
  let sessionId: string | undefined;
  let ownerId: string | undefined;
  let privatePath: string | undefined;
  let freshPreviewRequests = 0;
  let deletionVerified = false;
  const evidence: Record<string, string | number | boolean> = {
    source: "AI-created synthetic portrait through personal upload flow",
    youcamTaskSubmissions: 0,
  };

  // Even an accidental UI auto-request cannot spend a YouCam unit in this test.
  await page.route("**/api/sessions/*/previews", async (route) => {
    if (route.request().method() === "POST") {
      freshPreviewRequests++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEST_PREVIEWS_DISABLED",
            message: "Fresh generation is disabled in this privacy test.",
            retryable: false,
          },
        }),
      });
    } else await route.continue();
  });
  try {
    await signInAnonymous(page.request, origin);
    await page.goto("/studio/new");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("group", { name: "Tapping comfort", exact: true })
      .getByRole("radio", { name: "Feels good", exact: true })
      .check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("checkbox", { name: /^Fingertips/ }).check();
    await page.getByRole("checkbox", { name: /^Cream blush/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Choose your starting photo", { exact: true })
      .setInputFiles(resolve("public/images/studio-portrait.jpg"));
    await page
      .getByRole("checkbox", { name: /I’m 18\+, have photo permission/ })
      .check();
    const creation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/sessions") &&
        response.request().method() === "POST",
    );
    const finalization = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/assets/finalize") &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page
      .getByRole("button", { name: "Find my methods", exact: true })
      .click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const initial = (await created.json()) as StudioSession;
    sessionId = initial.id;
    expect(initial.mode).toBe("personal");
    const finalized = await finalization;
    expect(finalized.status()).toBe(200);
    const asset = (await finalized.json()) as StudioAsset;
    expect(asset.provenance).toBe("actual_capture");
    expect(asset.purpose).toBe("baseline");
    expect(asset.url).toBe(`/api/assets/${asset.id}`);
    await page.waitForURL(`**/studio/${sessionId}/looks`);
    const auth = await page.request.get("/api/auth/get-session");
    const actor = (await auth.json()) as {
      user: { id: string; isAnonymous: boolean };
    };
    expect(actor.user.isAnonymous).toBe(true);
    ownerId = actor.user.id;
    testOwners.push(ownerId);

    const ownerRead = await page.request.get(asset.url);
    expect(ownerRead.status()).toBe(200);
    expect(ownerRead.headers()["cache-control"]).toContain("no-store");
    expect(ownerRead.headers()["content-type"]).toContain("image/jpeg");
    expect((await ownerRead.body()).length).toBeGreaterThan(1000);
    evidence.ownerRead = ownerRead.status();
    const anonymous = await newIsolatedAppContext(browser, { baseURL: origin });
    otherContexts.push(anonymous);
    const unauthenticated = await anonymous.request.get(asset.url);
    expect(unauthenticated.status()).toBe(401);
    evidence.unauthenticatedRead = unauthenticated.status();
    const foreign = await newIsolatedAppContext(browser, { baseURL: origin });
    otherContexts.push(foreign);
    const signedIn = await signInAnonymous(foreign.request, origin);
    expect(signedIn.ok()).toBe(true);
    const foreignActor = (await signedIn.json()) as {
      user: { id: string; isAnonymous: boolean };
    };
    expect(foreignActor.user.isAnonymous).toBe(true);
    testOwners.push(foreignActor.user.id);
    expect(foreignActor.user.id).not.toBe(ownerId);
    const foreignRead = await foreign.request.get(asset.url);
    expect(foreignRead.status()).toBe(404);
    evidence.foreignOwnerRead = foreignRead.status();

    const current = (await (
      await page.request.get(`/api/sessions/${sessionId}`)
    ).json()) as StudioSession;
    const injectedId = randomUUID();
    const injection = await page.request.post(
      `/api/sessions/${sessionId}/events`,
      {
        headers: { Origin: origin },
        data: {
          expectedRevision: current.revision,
          command: {
            type: "attach_asset",
            asset: {
              ...asset,
              id: injectedId,
              purpose: "final",
              url: "/images/studio-portrait.jpg",
            },
          },
        },
      },
    );
    expect([400, 422]).toContain(injection.status());
    evidence.browserInjectionRejected = injection.status();
    const afterInjection = (await (
      await page.request.get(`/api/sessions/${sessionId}`)
    ).json()) as StudioSession;
    expect(afterInjection.assets.some((image) => image.id === injectedId)).toBe(
      false,
    );
    expect(afterInjection.sourceAssetId).toBe(asset.id);
    const stored = await database.query<{ pathname: string; owner_id: string }>(
      "SELECT pathname,owner_id FROM studio_assets WHERE id=$1 AND session_id=$2",
      [asset.id, sessionId],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].owner_id).toBe(ownerId);
    privatePath = stored.rows[0].pathname;
    expect((await head(privatePath)).size).toBeGreaterThan(1000);

    const configResponse = await page.request.get("/api/config");
    expect(configResponse.status()).toBe(200);
    const config = await configResponse.json();
    if (
      config.livePreviews === false &&
      config.livePreviewReason === "balance_floor"
    ) {
      const fresh = (await (
        await page.request.get(`/api/sessions/${sessionId}`)
      ).json()) as StudioSession;
      // APIRequestContext bypasses page.route. Never send this real request
      // unless the deployment has confirmed its active credit floor.
      const rested = await page.request.post(
        `/api/sessions/${sessionId}/previews`,
        {
          headers: { Origin: origin },
          data: {
            expectedRevision: fresh.revision,
            candidateId: fresh.candidates[0].id,
          },
        },
      );
      expect(rested.status()).toBe(503);
      expect((await rested.json()).error.code).toBe("LIVE_PREVIEWS_RESTING");
      const jobs = await database.query<{ count: string }>(
        "SELECT count(*) FROM provider_jobs WHERE session_id=$1 AND owner_id=$2",
        [sessionId, ownerId],
      );
      expect(jobs.rows[0].count).toBe("0");
      evidence.floorProbeRequests = 1;
      evidence.floorProbeHttpStatus = 503;
      evidence.floorProbeCode = "LIVE_PREVIEWS_RESTING";
      evidence.floorProbeProviderJobs = 0;
    } else {
      evidence.floorProbeRequests = 0;
      evidence.floorProbeSkipped =
        "No active balance floor was confirmed; no preview request was sent.";
    }

    const deleted = await page.request.delete(`/api/sessions/${sessionId}`, {
      headers: { Origin: origin },
    });
    expect(deleted.status()).toBe(200);
    evidence.deleteAccepted = deleted.status();
    const revoked = await page.request.get(asset.url);
    expect(revoked.status()).toBe(404);
    evidence.ownerReadAfterDelete = revoked.status();
    await expect
      .poll(
        async () => {
          const remaining = await database.query(
            "SELECT id FROM studio_sessions WHERE id=$1",
            [sessionId],
          );
          if (remaining.rowCount) return false;
          try {
            await head(privatePath!);
            return false;
          } catch (error) {
            if (error instanceof BlobNotFoundError) return true;
            throw error;
          }
        },
        {
          timeout: 90_000,
          intervals: [500, 1000, 2000, 5000],
          message:
            "The deletion workflow must erase the test studio and its private Blob",
        },
      )
      .toBe(true);
    deletionVerified = true;
    expect(freshPreviewRequests).toBe(0);
    evidence.browserFreshPreviewRequests = freshPreviewRequests;
    evidence.privateObjectErased = true;
    evidence.testStudioErased = true;
    evidence.sessionDigest = createHash("sha256")
      .update(sessionId)
      .digest("hex");
    const evidencePath = testInfo.outputPath("private-upload-evidence.json");
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), {
      mode: 0o600,
    });
    await testInfo.attach("private-upload-evidence", {
      path: evidencePath,
      contentType: "application/json",
    });
  } finally {
    // A failed assertion still cleans up only data created by this test. This
    // fallback cannot turn a failed workflow-cleanup assertion into a pass.
    if (sessionId && ownerId && !deletionVerified) {
      const owned = await database
        .query("SELECT id FROM studio_sessions WHERE id=$1 AND owner_id=$2", [
          sessionId,
          ownerId,
        ])
        .catch(() => null);
      if (owned?.rowCount) {
        const paths = await database.query<{ pathname: string }>(
          "SELECT pathname FROM studio_assets WHERE session_id=$1 UNION SELECT pathname FROM upload_intents WHERE session_id=$1",
          [sessionId],
        );
        if (paths.rows.length) await del(paths.rows.map((row) => row.pathname));
        await database.query(
          "DELETE FROM studio_sessions WHERE id=$1 AND owner_id=$2",
          [sessionId, ownerId],
        );
      } else if (privatePath) await del(privatePath);
    }
    if (testOwners.length)
      await database.query(
        'DELETE FROM "user" WHERE id=ANY($1::text[]) AND "isAnonymous"=true AND NOT EXISTS(SELECT 1 FROM studio_sessions s WHERE s.owner_id="user".id)',
        [testOwners],
      );
    for (const context of otherContexts) await context.close();
    await database.end();
  }
});
