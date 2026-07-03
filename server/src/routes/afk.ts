import type { FastifyInstance } from "fastify";
import { pool, withTx } from "../db.js";
import { requireAuth, accountIdOf } from "../lib/auth.js";
import { requireIdempotencyKey, findCached, storeResult } from "../lib/idempotency.js";
import { applyChanges } from "../lib/ledger.js";
import { ensureDailyReset, resourceSnapshot } from "../lib/daily.js";
import { AFK } from "../lib/economy.js";

interface AfkRates {
  goldPerHour: number;
  xpDustPerHour: number;
}

/** taxa horária do jogador = taxa do último estágio vencido (ou base) */
async function ratesFor(accountId: string): Promise<AfkRates> {
  const { rows } = await pool.query(
    `SELECT sd.afk_rates FROM players p
     JOIN stage_defs sd ON sd.id = p.max_stage_id
     WHERE p.account_id = $1`,
    [accountId]
  );
  if (!rows.length) return AFK.baseRates;
  const r = rows[0].afk_rates;
  return { goldPerHour: r.gold_per_hour, xpDustPerHour: r.xp_dust_per_hour };
}

function computeRewards(seconds: number, rates: AfkRates) {
  const hours = seconds / 3600;
  return [
    { type: "gold", amount: Math.floor(rates.goldPerHour * hours) },
    { type: "xp_dust", amount: Math.floor(rates.xpDustPerHour * hours) },
  ];
}

export default async function afkRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ---------- prévia ----------
  app.get("/afk/status", async (req, reply) => {
    const accountId = accountIdOf(req);
    const { rows } = await pool.query(
      "SELECT last_afk_claim_at, afk_cap_hours FROM players WHERE account_id = $1",
      [accountId]
    );
    if (!rows.length) return reply.code(404).send({ error: "player_not_found" });
    const capSec = rows[0].afk_cap_hours * 3600;
    const elapsed = Math.floor((Date.now() - new Date(rows[0].last_afk_claim_at).getTime()) / 1000);
    const accumulated = Math.max(0, Math.min(elapsed, capSec));
    return reply.send({
      accumulated_seconds: accumulated,
      cap_seconds: capSec,
      pending_rewards: computeRewards(accumulated, await ratesFor(accountId)),
    });
  });

  // ---------- coletar ----------
  app.post("/afk/claim", async (req, reply) => {
    const accountId = accountIdOf(req);
    const key = requireIdempotencyKey(req, reply);
    if (!key) return;
    const cached = await findCached(key, accountId);
    if (cached) return reply.send(cached);

    const rates = await ratesFor(accountId);
    const body = await withTx(async (client) => {
      const { rows } = await client.query(
        "SELECT last_afk_claim_at, afk_cap_hours FROM players WHERE account_id = $1 FOR UPDATE",
        [accountId]
      );
      const capSec = rows[0].afk_cap_hours * 3600;
      const elapsed = Math.floor((Date.now() - new Date(rows[0].last_afk_claim_at).getTime()) / 1000);
      const seconds = Math.max(0, Math.min(elapsed, capSec));
      const rewards = computeRewards(seconds, rates);

      await applyChanges(
        client,
        accountId,
        "afk_claim",
        null,
        rewards.map((r) => ({ resource: r.type, delta: r.amount }))
      );
      await client.query("UPDATE players SET last_afk_claim_at = now() WHERE account_id = $1", [accountId]);

      const response = { rewards, seconds_claimed: seconds, player: await resourceSnapshot(client, accountId) };
      await storeResult(client, key, accountId, "afk_claim", response);
      return response;
    });
    return reply.send(body);
  });

  // ---------- coleta rápida ----------
  app.post<{ Body: { method: "free" | "ad" | "gems"; ad_token?: string } }>(
    "/afk/quick",
    {
      schema: {
        body: {
          type: "object",
          required: ["method"],
          properties: {
            method: { type: "string", enum: ["free", "ad", "gems"] },
            ad_token: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const accountId = accountIdOf(req);
      const key = requireIdempotencyKey(req, reply);
      if (!key) return;
      const cached = await findCached(key, accountId);
      if (cached) return reply.send(cached);

      const { method } = req.body;
      const rates = await ratesFor(accountId);

      const out = await withTx(async (client) => {
        await ensureDailyReset(client, accountId);
        const { rows } = await client.query(
          "SELECT quick_afk_used_today, ads_watched_today, gems_free FROM players WHERE account_id = $1 FOR UPDATE",
          [accountId]
        );
        const p = rows[0];

        if (method === "free") {
          if (p.quick_afk_used_today >= AFK.quickFreePerDay) return { code: 429 as const };
          await client.query(
            "UPDATE players SET quick_afk_used_today = quick_afk_used_today + 1 WHERE account_id = $1",
            [accountId]
          );
        } else if (method === "ad") {
          // Etapa 6: validar ad_token via SSV do AdMob. Por ora, cap diário protege o servidor.
          if (p.ads_watched_today >= AFK.adsCapPerDay) return { code: 429 as const };
          await client.query(
            "UPDATE players SET ads_watched_today = ads_watched_today + 1 WHERE account_id = $1",
            [accountId]
          );
        } else {
          const { splitGemCost } = await import("../lib/ledger.js");
          await applyChanges(client, accountId, "afk_quick_gems", null, splitGemCost(BigInt(p.gems_free), AFK.quickGemsCost));
        }

        const rewards = computeRewards(AFK.quickHoursGranted * 3600, rates);
        await applyChanges(
          client,
          accountId,
          `afk_quick_${method}`,
          null,
          rewards.map((r) => ({ resource: r.type, delta: r.amount }))
        );
        const response = { rewards, player: await resourceSnapshot(client, accountId) };
        await storeResult(client, key, accountId, "afk_quick", response);
        return { code: 200 as const, response };
      });
      if (out.code === 429) return reply.code(429).send({ error: "daily_limit_reached" });
      return reply.send(out.response);
    }
  );
}
