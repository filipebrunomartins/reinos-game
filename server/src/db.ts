import pg from "pg";
import { env } from "./config.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

/** Executa fn dentro de uma transação; commit no sucesso, rollback no erro. */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
