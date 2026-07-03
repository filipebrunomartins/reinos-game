import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { env } from "../config.js";

export interface AccessPayload {
  sub: string; // account_id
}

export function signAccessToken(accountId: string): string {
  return jwt.sign({}, env.jwtSecret, {
    subject: accountId,
    expiresIn: env.accessTtlSec,
  });
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Gera refresh token opaco e persiste apenas o hash. */
export async function issueRefreshToken(client: PoolClient, accountId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + env.refreshTtlDays * 86400_000);
  await client.query(
    "INSERT INTO refresh_tokens (token_hash, account_id, expires_at) VALUES ($1,$2,$3)",
    [sha256(token), accountId, expires]
  );
  return token;
}

/** Hook: exige Bearer válido e injeta request.accountId */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    reply.code(401).send({ error: "missing_token" });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessPayload & { sub: string };
    (req as FastifyRequest & { accountId: string }).accountId = payload.sub;
  } catch {
    reply.code(401).send({ error: "invalid_token" });
  }
}

export function accountIdOf(req: FastifyRequest): string {
  return (req as FastifyRequest & { accountId: string }).accountId;
}
