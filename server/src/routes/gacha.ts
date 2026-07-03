import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { pool, withTx } from "../db.js";
import { requireAuth, accountIdOf } from "../lib/auth.js";
import { requireIdempotencyKey, findCached, storeResult } from "../lib/idempotency.js";
import { applyChanges, splitGemCost, InsufficientResources } from "../lib/ledger.js";
import { resourceSnapshot } from "../lib/daily.js";
import { GACHA, type Rarity } from "../lib/economy.js";

interface HeroPool {
  byRarity: Record<Rarity, string[]>;
}

let poolCache: HeroPool | null = null;
async function heroPool(): Promise<HeroPool> {
  if (poolCache) return poolCache;
  const { rows } = await pool.query("SELECT id, rarity FROM hero_defs WHERE enabled");
  const byRarity: Record<Rarity, string[]> = { common: [], rare: [], epic: [], legendary: [] };
  for (const r of rows) byRarity[r.rarity as Rarity].push(r.id);
  poolCache = { byRarity };
  return poolCache;
}

/** sorteia raridade com RNG criptográfica (randomInt) */
function rollRarity(): Rarity {
  const roll = randomInt(0, 10000); // 0..9999
  let acc = 0;
  for (const [rarity, rate] of Object.entries(GACHA.rates) as [Rarity, number][]) {
    acc += rate * 10000;
    if (roll < acc) return rarity;
  }
  return "common";
}

export default async function gachaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post<{ Body: { batch: 1 | 10; cost_type: "gems" | "scroll" } }>(
    "/gacha/summon",
    {
      schema: {
        body: {
          type: "object",
          required: ["batch", "cost_type"],
          properties: {
            batch: { type: "integer", enum: [1, 10] },
            cost_type: { type: "string", enum: ["gems", "scroll"] },
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

      const { batch, cost_type } = req.body;
      const heroes = await heroPool();

      try {
        const body = await withTx(async (client) => {
          const p = await client.query(
            "SELECT gems_free, summon_scrolls, pity_counter FROM players WHERE account_id = $1 FOR UPDATE",
            [accountId]
          );
          const player = p.rows[0];

          // ----- custo -----
          if (cost_type === "gems") {
            const cost = batch === 10 ? GACHA.costGems10 : GACHA.costGems1;
            await applyChanges(client, accountId, "summon_cost", null, splitGemCost(BigInt(player.gems_free), cost));
          } else {
            await applyChanges(client, accountId, "summon_cost", null, [
              { resource: "summon_scrolls", delta: -batch },
            ]);
          }

          // ----- sorteios -----
          const pityBefore: number = player.pity_counter;
          let pity = pityBefore;
          const results: {
            hero_def_id: string;
            rarity: Rarity;
            is_new: boolean;
            converted_shards: number;
            was_pity: boolean;
          }[] = [];

          for (let i = 0; i < batch; i++) {
            pity++;
            let rarity = rollRarity();
            let wasPity = false;
            if (pity >= GACHA.pityThreshold && rarity !== "legendary") {
              rarity = "legendary";
              wasPity = true;
            }
            if (rarity === "legendary") pity = 0;

            const pool_ = heroes.byRarity[rarity];
            const heroDefId = pool_[randomInt(0, pool_.length)];

            // já possui? duplicata vira fragmentos
            const owned = await client.query(
              "SELECT 1 FROM player_heroes WHERE account_id = $1 AND hero_def_id = $2",
              [accountId, heroDefId]
            );
            let isNew = false;
            let shards = 0;
            if (owned.rows.length) {
              shards = GACHA.dupShards[rarity];
              await client.query(
                `INSERT INTO player_shards (account_id, shard_key, amount) VALUES ($1,$2,$3)
                 ON CONFLICT (account_id, shard_key) DO UPDATE SET amount = player_shards.amount + $3`,
                [accountId, `hero:${heroDefId}`, shards]
              );
            } else {
              isNew = true;
              await client.query(
                "INSERT INTO player_heroes (account_id, hero_def_id) VALUES ($1,$2)",
                [accountId, heroDefId]
              );
            }
            results.push({ hero_def_id: heroDefId, rarity, is_new: isNew, converted_shards: shards, was_pity: wasPity });
          }

          await client.query("UPDATE players SET pity_counter = $2 WHERE account_id = $1", [accountId, pity]);
          const summon = await client.query(
            `INSERT INTO summons (account_id, batch_size, cost_type, results, pity_before, pity_after)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [accountId, batch, cost_type, JSON.stringify(results), pityBefore, pity]
          );

          const response = {
            summon_id: summon.rows[0].id,
            results,
            pity_counter: pity,
            player: await resourceSnapshot(client, accountId),
          };
          await storeResult(client, key, accountId, "gacha_summon", response);
          return response;
        });
        return reply.send(body);
      } catch (e) {
        if (e instanceof InsufficientResources) {
          return reply.code(402).send({ error: "insufficient_resources", resource: e.resource });
        }
        throw e;
      }
    }
  );
}
