import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { SAMPLE_SETUP } from "../src/lib/catalog";
import { createSession } from "../src/lib/planner";
import type { StudioSession } from "../src/lib/contracts";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  ownedSession: vi.fn(),
  persistSession: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  head: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
  head: mocks.head,
  get: mocks.get,
}));
vi.mock("../src/lib/server/db", () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: mocks.transaction,
}));
vi.mock("../src/lib/server/sessions", () => ({
  ownedSession: mocks.ownedSession,
  persistSession: mocks.persistSession,
  isUuid: () => true,
}));

import {
  createUploadIntent,
  finalizeUpload,
  photoTransaction,
} from "../src/lib/server/assets";

let session: StudioSession;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-storage-token");
  session = createSession(structuredClone(SAMPLE_SETUP), "test-studio");
  mocks.ownedSession.mockImplementation(async () => session);
  mocks.persistSession.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(
    (operation: (client: unknown) => Promise<unknown>) =>
      operation({ query: mocks.query }),
  );
  mocks.put.mockResolvedValue(undefined);
  mocks.del.mockResolvedValue(undefined);
});

describe("private photo transaction compensation", () => {
  it("rejects terminal-session uploads before any private object is written", async () => {
    session.stage = "completed";
    mocks.query.mockResolvedValue({
      rows: [{ finalized_asset_id: null }],
      rowCount: 1,
    });
    await expect(
      createUploadIntent("owner", session.id, "final"),
    ).rejects.toMatchObject({ code: "STUDIO_ENDED" });
    await expect(
      finalizeUpload("owner", session.id, "incoming/path", "final"),
    ).rejects.toMatchObject({ code: "STUDIO_ENDED" });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.head).not.toHaveBeenCalled();
  });

  it("removes unregistered objects after a late transaction failure", async () => {
    const failure = new Error("Late transaction failure");
    mocks.transaction.mockImplementation(
      async (operation: (client: unknown) => Promise<unknown>) => {
        await operation({ query: mocks.query });
        throw failure;
      },
    );
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      photoTransaction(async (_client, track) => {
        track("private/orphan.jpg");
        return "written";
      }),
    ).rejects.toBe(failure);
    expect(mocks.del).toHaveBeenCalledWith(["private/orphan.jpg"]);
  });

  it("keeps a registered photo when COMMIT succeeded but its response was lost", async () => {
    mocks.transaction.mockImplementation(
      async (operation: (client: unknown) => Promise<unknown>) => {
        await operation({ query: mocks.query });
        throw new Error("Commit response lost");
      },
    );
    mocks.query.mockResolvedValue({
      rows: [{ pathname: "private/committed.jpg" }],
      rowCount: 1,
    });
    await expect(
      photoTransaction(async (_client, track) => {
        track("private/committed.jpg");
      }),
    ).rejects.toThrow();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("compensates a stored normalized photo when a later session write rolls back", async () => {
    const bytes = await sharp({
      create: { width: 160, height: 160, channels: 3, background: "#b0b0b0" },
    })
      .jpeg()
      .toBuffer();
    mocks.head.mockResolvedValue({
      size: bytes.length,
      contentType: "image/jpeg",
    });
    mocks.get.mockImplementation(async () => ({
      statusCode: 200,
      stream: new Response(Uint8Array.from(bytes).buffer).body,
    }));
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM upload_intents"))
        return { rows: [{ finalized_asset_id: null }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO studio_assets"))
        return {
          rows: [
            {
              id: args[0],
              pathname: args[3],
              purpose: args[4],
              provenance: args[5],
              width: args[8],
              height: args[9],
              created_at: new Date("2026-10-31T00:00:00Z"),
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    });
    mocks.persistSession.mockRejectedValue(
      new Error("Later session write failed"),
    );
    await expect(
      finalizeUpload("owner", session.id, "incoming/path", "baseline"),
    ).rejects.toThrow("Later session write failed");
    const writtenPath = mocks.put.mock.calls[0][0];
    expect(mocks.del).toHaveBeenCalledWith([writtenPath]);
    expect(mocks.del).not.toHaveBeenCalledWith("incoming/path");
  });

  it("does not roll back a committed finalization because incoming-object cleanup failed", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const existing = {
      id: "saved-photo",
      purpose: "baseline",
      provenance: "actual_capture",
      width: 160,
      height: 160,
      created_at: new Date("2026-10-31T00:00:00Z"),
    };
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("FROM upload_intents")
        ? { rows: [{ finalized_asset_id: existing.id }], rowCount: 1 }
        : { rows: [existing], rowCount: 1 },
    );
    mocks.del.mockRejectedValue(new Error("Temporary storage delete failure"));
    await expect(
      finalizeUpload("owner", session.id, "incoming/path", "baseline"),
    ).resolves.toMatchObject({ id: existing.id, provenance: "actual_capture" });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
