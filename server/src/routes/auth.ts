import type { FastifyInstance } from "fastify";
import { withTx } from "../db.js";
import { issueRefreshToken, sha256, signAccessToken } from "../lib/auth.js";
import { STARTER } from "../lib/economy.js";
import { applyChanges } from "../lib/ledger.js";
import { env } from "../config.js";

export default async function authRoutes(app: FastifyInstance) {
  // ---------- login/registro anônimo ----------
  app.post<{ Body: { device_id: string; platform?: string; app_version?: string } }>(
    "/auth/anonymous",
    {
      schema: {
        body: {
          type: "object",
          required: ["device_id"],
          properties: {
            device_id: { type: "string", minLength: 16, maxLength: 128 },
            platform: { type: "string", enum: ["android", "ios"] },
            app_version: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { device_id } = req.body;
      const result = await withTx(async (client) => {
        let isNew = false;
        let accountId: string;

        const found = await client.query("SELECT id, banned_until FROM accounts WHERE device_id = $1", [device_id]);
        if (found.rows.length) {
          const acc = found.rows[0];
          if (acc.banned_until && new Date(acc.banned_until) > new Date()) {
            return { banned: true as const };
          }
          accountId = acc.id;
          await client.query("UPDATE accounts SET last_login_at = now() WHERE id = $1", [accountId]);
        } else {
          isNew = true;
          const ins = await client.query(
            "INSERT INTO accounts (device_id, last_login_at) VALUES ($1, now()) RETURNING id",
            [device_id]
          );
          accountId = ins.rows[0].id;
          await client.query("INSERT INTO players (account_id) VALUES ($1)", [accountId]);
          // pacote inicial
          await applyChanges(client, accountId, "starter_pack", null, [
            { resource: "gold", delta: STARTER.gold },
            { resource: "gems_free", delta: STARTER.gemsFree },
            { resource: "summon_scrolls", delta: STARTER.summonScrolls },
          ]);
          // herói inicial + formação de campanha
          const hero = await client.query(
            "INSERT INTO player_heroes (account_id, hero_def_id) VALUES ($1,$2) RETURNING id",
            [accountId, STARTER.heroDefId]
          );
          await client.query(
            `INSERT INTO formations (account_id, kind, slots) VALUES ($1,'campaign',$2)`,
            [accountId, JSON.stringify([{ position: 0, player_hero_id: hero.rows[0].id }])]
          );
        }
        const refresh = await issueRefreshToken(client, accountId);
        return { accountId, refresh, isNew, banned: false as const };
      });

      if (result.banned) return reply.code(403).send({ error: "account_banned" });
      return reply.send({
        access_token: signAccessToken(result.accountId),
        refresh_token: result.refresh,
        expires_in: env.accessTtlSec,
        is_new_account: result.isNew,
      });
    }
  );

  // ---------- refresh ----------
  app.post<{ Body: { refresh_token: string } }>(
    "/auth/refresh",
    {
      schema: {
        body: {
          type: "object",
          required: ["refresh_token"],
          properties: { refresh_token: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const hash = sha256(req.body.refresh_token);
      const result = await withTx(async (client) => {
        const { rows } = await client.query(
          `SELECT account_id FROM refresh_tokens
           WHERE token_hash = $1 AND NOT revoked AND expires_at > now() FOR UPDATE`,
          [hash]
        );
        if (!rows.length) return null;
        const accountId = rows[0].account_id as string;
        // rotação: revoga o antigo, emite novo
        await client.query("UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1", [hash]);
        const refresh = await issueRefreshToken(client, accountId);
        return { accountId, refresh };
      });
      if (!result) return reply.code(401).send({ error: "invalid_refresh_token" });
      return reply.send({
        access_token: signAccessToken(result.accountId),
        refresh_token: result.refresh,
        expires_in: env.accessTtlSec,
        is_new_account: false,
      });
    }
  );

  // ---------- vínculo Google/Apple (Etapa 7: validação real dos id_tokens) ----------
  app.post("/auth/link", async (_req, reply) => {
    return reply.code(501).send({
      error: "not_implemented",
      detail: "Validação de id_token Google/Apple entra na Etapa 7 (requer chaves dos provedores).",
    });
  });
}
