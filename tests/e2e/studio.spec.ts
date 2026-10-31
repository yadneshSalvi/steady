import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SAMPLE_SETUP } from "../../src/lib/catalog";
import type { StudioSession, SessionCommand } from "../../src/lib/contracts";
import { signInAnonymous } from "./support/auth";

test("editorial entry has accessible controls on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Access and comfort settings" }),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/new?mode=sample");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("owner-bound durable session preserves physical confirmations through adaptation", async ({
  request,
  browser,
}) => {
  await signInAnonymous(request);
  const created = await request.post("/api/sessions", {
    data: { ...SAMPLE_SETUP, consent: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  let session = (await created.json()) as StudioSession;
  expect(session.candidates.length).toBeGreaterThanOrEqual(2);
  const other = await browser.newContext();
  const denied = await other.request.get(`/api/sessions/${session.id}`);
  expect(denied.status()).toBe(401);
  await other.close();
  const oldRevision = session.revision;
  const command = async (value: SessionCommand) => {
    const response = await request.post(`/api/sessions/${session.id}/events`, {
      data: { expectedRevision: session.revision, command: value },
    });
    expect(response.status(), await response.text()).toBe(200);
    session = (await response.json()) as StudioSession;
  };
  const tap = session.candidates.find(
    (candidate) => candidate.routeId === "tap",
  )!;
  await command({ type: "approve_candidate", candidateId: tap.id });
  const stale = await request.post(`/api/sessions/${session.id}/events`, {
    data: { expectedRevision: oldRevision, command: { type: "start" } },
  });
  expect(stale.status()).toBe(409);
  await command({ type: "start" });
  const first = session.activePlan!.actions[0];
  await command({ type: "complete_action", actionId: first.id });
  await command({ type: "pause" });
  await command({ type: "propose_adaptation", reason: "movement" });
  expect(session.completedActionIds).toContain(first.id);
  expect(session.adaptation).toBeTruthy();
  await command({
    type: "accept_adaptation",
    proposalId: session.adaptation!.id,
  });
  expect(session.completedActionIds).toContain(first.id);
  expect(session.resumeRequired).toBe(true);
  await command({ type: "resume", confirmedPhysicalState: true });
  const remaining = session.activePlan!.actions.filter(
    (action) => !session.completedActionIds.includes(action.id),
  );
  for (const action of remaining)
    await command({ type: "complete_action", actionId: action.id });
  if (session.stage !== "reviewing") await command({ type: "review" });
  await command({
    type: "finish",
    satisfaction: "yes",
    comfort: "comfortable",
    assistance: "none",
    note: "Synthetic browser test walkthrough",
  });
  expect(session.stage).toBe("completed");
  expect(session.outcome).toBeUndefined();
  await command({ type: "save_method" });
  const persisted = await request.get(`/api/sessions/${session.id}`);
  expect((await persisted.json()).completedActionIds).toContain(first.id);
  const methods = await request.get("/api/methods");
  expect(
    (await methods.json()).methods.some(
      (method: { sessionId: string }) => method.sessionId === session.id,
    ),
  ).toBe(true);
});
