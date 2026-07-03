import type { FastifyInstance } from "fastify";
import { pool, withTx } from "../db.js";
import { requireAuth, accountIdOf } from "../lib/auth.js";
import { applyChanges, InsufficientResources } from "../lib/ledger.js";
import { resourceSnapshot } from "../lib/daily.js";
import { heroLevelCap, levelUpCost, STAR_UP, MAX_STARS } from "../lib/economy.js";

export default async function heroRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ---------- level-up ----------
  app.post<{ Params: { id: string }; Body: { levels?: number; to_max?: boolean } }>(
    "/heroes/:id/level-up",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        body: {
          type: "object",
          properties: {
            levels: { type: "integer", minimum: 1, maximum: 240 },
            to_max: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const accountId = accountIdOf(req);
      try {
        const out = await withTx(async (client) => {
          const h = await client.query(
            "SELECT * FROM player_heroes WHERE id = $1 AND account_id = $2 FOR UPDATE",
            [req.params.id, accountId]
          );
          if (!h.rows.length) return { code: 404 as const };
          const hero = h.rows[0];
          const cap = heroLevelCap(hero.stars);
          if (hero.level >= cap) return { code: 409 as const };

          const p = await client.query("SELECT gold, xp_dust FROM players WHERE account_id = $1", [accountId]);
          let gold = BigInt(p.rows[0].gold);
          let dust = BigInt(p.rows[0].xp_dust);

          const want = req.body.to_max ? cap - hero.level : Math.min(req.body.levels ?? 1, cap - hero.level);
          let gained = 0;
          let goldCost = 0n;
          let dustCost = 0n;
          for (let i = 0; i < want; i++) {
            const c = levelUpCost(hero.level + gained);
            if (gold < BigInt(c.gold) || dust < BigInt(c.xpDust)) break;
            gold -= BigInt(c.gold);
            dust -= BigInt(c.xpDust);
            goldCost += BigInt(c.gold);
            dustCost += BigInt(c.xpDust);
            gained++;
          }
          if (gained === 0) return { code: 402 as const };

          await applyChanges(client, accountId, "hero_level_up", hero.id, [
            { resource: "gold", delta: -Number(goldCost) },
            { resource: "xp_dust", delta: -Number(dustCost) },
          ]);
          const newLevel = hero.level + gained;
          await client.query("UPDATE player_heroes SET level = $2 WHERE id = $1", [hero.id, newLevel]);
          return {
            code: 200 as const,
            body: {
              hero: { id: hero.id, hero_def_id: hero.hero_def_id, level: newLevel, stars: hero.stars },
              levels_gained: gained,
              player: await resourceSnapshot(client, accountId),
            },
          };
        });
        if (out.code === 404) return reply.code(404).send({ error: "hero_not_found" });
        if (out.code === 409) return reply.code(409).send({ error: "level_cap_reached" });
        if (out.code === 402) return reply.code(402).send({ error: "insufficient_resources" });
        return reply.send(out.body);
      } catch (e) {
        if (e instanceof InsufficientResources) return reply.code(402).send({ error: "insufficient_resources" });
        throw e;
      }
    }
  );

  // ---------- star-up ----------
  app.post<{ Params: { id: string }; Body: { use_universal_shards?: number } }>(
    "/heroes/:id/star-up",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        body: {
          type: "object",
          properties: { use_universal_shards: { type: "integer", minimum: 0 } },
        },
      },
    },
    async (req, reply) => {
      const accountId = accountIdOf(req);
      try {
        const out = await withTx(async (client) => {
          const h = await client.query(
            `SELECT ph.*, hd.rarity FROM player_heroes ph
             JOIN hero_defs hd ON hd.id = ph.hero_def_id
             WHERE ph.id = $1 AND ph.account_id = $2 FOR UPDATE OF ph`,
            [req.params.id, accountId]
          );
          if (!h.rows.length) return { code: 404 as const };
          const hero = h.rows[0];
          if (hero.stars >= MAX_STARS) return { code: 409 as const, error: "max_stars" };

          const cost = STAR_UP[hero.stars];
          const heroKey = `hero:${hero.hero_def_id}`;
          const uniKey = `universal:${hero.rarity}`;

          const shards = await client.query(
            "SELECT shard_key, amount FROM player_shards WHERE account_id = $1 AND shard_key = ANY($2) FOR UPDATE",
            [accountId, [heroKey, uniKey]]
          );
          const bal = Object.fromEntries(shards.rows.map((r) => [r.shard_key, r.amount as number]));
          const heroShards = bal[heroKey] ?? 0;
          const uniAvailable = bal[uniKey] ?? 0;

          const wantUni = Math.min(req.body.use_universal_shards ?? 0, uniAvailable, cost.shards);
          const fromHero = cost.shards - wantUni;
          if (heroShards < fromHero) return { code: 402 as const, error: "insufficient_shards" };

          // pó de promoção via livro-razão (valida saldo)
          await applyChanges(client, accountId, "hero_star_up", hero.id, [
            { resource: "promo_dust", delta: -cost.promoDust },
          ]);
          // débito de fragmentos
          if (fromHero > 0)
            await client.query(
              "UPDATE player_shards SET amount = amount - $3 WHERE account_id = $1 AND shard_key = $2",
              [accountId, heroKey, fromHero]
            );
          if (wantUni > 0)
            await client.query(
              "UPDATE player_shards SET amount = amount - $3 WHERE account_id = $1 AND shard_key = $2",
              [accountId, uniKey, wantUni]
            );
          const newStars = hero.stars + 1;
          await client.query("UPDATE player_heroes SET stars = $2 WHERE id = $1", [hero.id, newStars]);
          return {
            code: 200 as const,
            body: {
              hero: { id: hero.id, hero_def_id: hero.hero_def_id, level: hero.level, stars: newStars },
              shards_spent: { hero: fromHero, universal: wantUni },
              player: await resourceSnapshot(client, accountId),
            },
          };
        });
        if (out.code === 404) return reply.code(404).send({ error: "hero_not_found" });
        if (out.code === 409) return reply.code(409).send({ error: out.error });
        if (out.code === 402) return reply.code(402).send({ error: out.error });
        return reply.send(out.body);
      } catch (e) {
        if (e instanceof InsufficientResources) return reply.code(402).send({ error: "insufficient_resources" });
        throw e;
      }
    }
  );

  // ---------- equipar / desequipar ----------
  app.post<{ Params: { id: string }; Body: { player_item_id: string; unequip?: boolean } }>(
    "/heroes/:id/equip",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        body: {
          type: "object",
          required: ["player_item_id"],
          properties: {
            player_item_id: { type: "string", format: "uuid" },
            unequip: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const accountId = accountIdOf(req);
      const out = await withTx(async (client) => {
        const item = await client.query(
          `SELECT pi.id, pi.equipped_hero, idf.slot FROM player_items pi
           JOIN item_defs idf ON idf.id = pi.item_def_id
           WHERE pi.id = $1 AND pi.account_id = $2 FOR UPDATE OF pi`,
          [req.body.player_item_id, accountId]
        );
        if (!item.rows.length) return { code: 404 as const };

        if (req.body.unequip) {
          await client.query("UPDATE player_items SET equipped_hero = NULL WHERE id = $1", [item.rows[0].id]);
          return { code: 200 as const };
        }
        const hero = await client.query(
          "SELECT id FROM player_heroes WHERE id = $1 AND account_id = $2",
          [req.params.id, accountId]
        );
        if (!hero.rows.length) return { code: 404 as const };
        // remove item anterior do mesmo slot nesse herói
        await client.query(
          `UPDATE player_items pi SET equipped_hero = NULL
           FROM item_defs idf
           WHERE pi.item_def_id = idf.id AND pi.equipped_hero = $1 AND idf.slot = $2`,
          [req.params.id, item.rows[0].slot]
        );
        await client.query("UPDATE player_items SET equipped_hero = $2 WHERE id = $1", [
          item.rows[0].id,
          req.params.id,
        ]);
        return { code: 200 as const };
      });
      if (out.code === 404) return reply.code(404).send({ error: "not_found" });
      return reply.send({ ok: true });
    }
  );
}
