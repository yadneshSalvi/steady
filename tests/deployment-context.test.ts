import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentStorageState } from "./e2e/support/deployment-context";

let directory: string;
const cookie = {
  name: "_vercel_jwt",
  value: "test-only-protection-token",
  domain: "preview.example.test",
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
};
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "steady-deployment-test-"));
  vi.stubEnv("TEST_DEPLOYMENT_STORAGE_STATE", join(directory, "state.json"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
const write = (cookies: unknown[], origins: unknown[] = []) =>
  writeFileSync(
    join(directory, "state.json"),
    JSON.stringify({ cookies, origins }),
    { mode: 0o600 },
  );

describe("protected-deployment test isolation", () => {
  it("leaves local contexts unchanged when unset", () => {
    vi.stubEnv("TEST_DEPLOYMENT_STORAGE_STATE", "");
    expect(deploymentStorageState()).toBeUndefined();
  });
  it("loads only the exact deployment's protection cookie", () => {
    write([cookie]);
    expect(deploymentStorageState("https://preview.example.test")).toEqual({
      cookies: [cookie],
      origins: [],
    });
  });
  it("rejects application authentication and local-storage origins without disclosing values", () => {
    const cases: [unknown[], unknown[]][] = [
      [[cookie, { ...cookie, name: "better-auth.session_token" }], []],
      [
        [cookie],
        [
          {
            origin: "https://preview.example.test",
            localStorage: [{ name: "session", value: "test-app-auth" }],
          },
        ],
      ],
    ];
    for (const [cookies, origins] of cases) {
      write(cookies, origins);
      expect(() =>
        deploymentStorageState("https://preview.example.test"),
      ).toThrow(/only a host-scoped Vercel protection cookie/);
      try {
        deploymentStorageState("https://preview.example.test");
      } catch (error) {
        expect(String(error)).not.toContain(cookie.value);
      }
    }
  });
  it("rejects a different host or a wildcard deployment cookie", () => {
    write([cookie]);
    expect(() =>
      deploymentStorageState("https://another.example.test"),
    ).toThrow();
    write([{ ...cookie, domain: ".example.test" }]);
    expect(() =>
      deploymentStorageState("https://preview.example.test"),
    ).toThrow();
  });
});
