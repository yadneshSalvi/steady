import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. No environment values were printed.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS steady_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const migrations = (await readdir("migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    const existing = await client.query(
      "SELECT name FROM steady_migrations WHERE name = $1",
      [name],
    );
    if (existing.rowCount) continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(join("migrations", name), "utf8"));
      await client.query("INSERT INTO steady_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("STEADY database is ready.");
} finally {
  client.release();
  await pool.end();
}
