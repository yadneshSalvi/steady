import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deliberate recording ledger recovery", () => {
  for (const name of ["ladders", "eyes"]) {
    it(`refuses a corrupt ${name} ledger instead of treating it as a new run`, async () => {
      const repo = process.cwd();
      const base = resolve("artifacts/private");
      await mkdir(base, { recursive: true });
      const root = await mkdtemp(join(base, "recording-guard-"));
      try {
        await mkdir(join(root, "public/images"), { recursive: true });
        await copyFile(
          resolve("public/images/studio-portrait.jpg"),
          join(root, "public/images/studio-portrait.jpg"),
        );
        const ledger = join(root, `artifacts/private/review-${name}`);
        await mkdir(ledger, { recursive: true });
        await writeFile(join(ledger, "manifest.json"), '{"incomplete":');
        const result = spawnSync(
          process.execPath,
          [
            resolve(repo, "node_modules/tsx/dist/cli.mjs"),
            resolve(repo, `scripts/record-${name}.ts`),
          ],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 15000,
            env: { ...process.env, YOUCAM_API_KEY: "" },
          },
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("The recording ledger is unreadable");
        expect(result.stdout).not.toMatch(/recorded|published|dry_run/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
