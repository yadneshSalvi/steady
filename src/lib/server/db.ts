import "server-only";
import { Pool, type PoolClient } from "pg";

const globalDatabase = globalThis as unknown as { steadyPool?: Pool };

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!globalDatabase.steadyPool) {
    globalDatabase.steadyPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      application_name: "steady-studio",
    });
    globalDatabase.steadyPool.on("error", () =>
      console.error("[database] idle connection error"),
    );
  }
  return globalDatabase.steadyPool;
}

export async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
