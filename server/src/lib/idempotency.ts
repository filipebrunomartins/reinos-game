import type { FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { pool } from "../db.js";

/**
 * Uso nos endpoints que geram recompensa:
 *   const key = requireIdempotencyKey(req, reply); if (!key) return;
 *   const cached = await findCached(key, accountId); if (cached) return reply.send(cached);
 *   ... dentro da MESMA transação do efeito: await storeResult(client, key, accountId, endpoint, body)
 */

export function requireIdempotencyKey(req: FastifyRequest, reply: FastifyReply): string | null {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    reply.code(400).send({ error: "missing_idempotency_key" });
    return null;
  }
  return key;
}

export async function findCached(key: string, accountId: string): Promise<unknown | null> {
  const { rows } = await pool.query(
    "SELECT response FROM idempotency_keys WHERE key = $1 AND account_id = $2",
    [key, accountId]
  );
  return rows.length ? rows[0].response : null;
}

export async function storeResult(
  client: PoolClient,
  key: string,
  accountId: string,
  endpoint: string,
  response: unknown
): Promise<void> {
  await client.query(
    "INSERT INTO idempotency_keys (key, account_id, endpoint, response) VALUES ($1,$2,$3,$4)",
    [key, accountId, endpoint, JSON.stringify(response)]
  );
}
