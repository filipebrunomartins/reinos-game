import type { FastifyInstance } from "fastify";
import { pool, withTx } from "../db.js";
import { requireAuth, accountIdOf } from "../lib/auth.js";
import { ensureDailyReset } from "../lib/daily.js";

const NICK_RE = /^[\p{L}\p{N} _-]{3,16}$/u;

export default async function playerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ---------- estado completo ----------
  app.get("/player", async (req, reply) => {
    const accountId = accountIdOf(req);
    await withTx((c) => ensureDailyReset(c, accountId));

    const [p, heroes, items, formations, shards] = await Promise.all([
      pool.query("SELECT * FROM players WHERE account_id = $1", [accountId]),
      pool.query(
        `SELECT ph.id, ph.hero_def_id, ph.level, ph.stars,
                COALESCE(json_agg(pi.id) FILTER (WHERE pi.id IS NOT NULL), '[]') AS equipped_items
         FROM player_heroes ph
         LEFT JOIN player_items pi ON pi.equipped_hero = ph.id
         WHERE ph.account_id = $1 GROUP BY ph.id`,
        [accountId]
      ),
      pool.query(
        "SELECT id, item_def_id, tier, equipped_hero FROM player_items WHERE account_id = $1",
        [accountId]
      ),
      pool.query("SELECT kind, slots FROM formations WHERE account_id = $1", [accountId]),
      pool.query("SELECT shard_key, amount FROM player_shards WHERE account_id = $1 AND amount > 0", [accountId]),
    ]);
    if (!p.rows.length) return reply.code(404).send({ error: "player_not_found" });
    const pl = p.rows[0];

    return reply.send({
      profile: {
        nickname: pl.nickname,
        level: pl.level,
        xp: String(pl.xp),
        max_stage_id: pl.max_stage_id,
        arena_rating: pl.arena_rating,
        monthly_pass_until: pl.monthly_pass_until,
        pity_counter: pl.pity_counter,
      },
      resources: {
        gold: String(pl.gold),
        gems: String(BigInt(pl.gems_free) + BigInt(pl.gems_paid)),
        xp_dust: String(pl.xp_dust),
        promo_dust: String(pl.promo_dust),
        summon_scrolls: pl.summon_scrolls,
      },
      heroes: heroes.rows,
      items: items.rows,
      formations: Object.fromEntries(formations.rows.map((f) => [f.kind, f.slots])),
      shards: shards.rows,
      afk: { last_claim_at: pl.last_afk_claim_at, cap_hours: pl.afk_cap_hours },
    });
  });

  // ---------- apelido ----------
  app.put<{ Body: { nickname: string } }>(
    "/player/nickname",
    {
      schema: {
        body: {
          type: "object",
          required: ["nickname"],
          properties: { nickname: { type: "string", minLength: 3, maxLength: 16 } },
        },
      },
    },
    async (req, reply) => {
      const nickname = req.body.nickname.trim();
      if (!NICK_RE.test(nickname)) return reply.code(422).send({ error: "invalid_nickname" });
      await pool.query("UPDATE players SET nickname = $2, updated_at = now() WHERE account_id = $1", [
        accountIdOf(req),
        nickname,
      ]);
      return reply.send({ ok: true, nickname });
    }
  );

  // ---------- formação ----------
  app.put<{
    Params: { kind: string };
    Body: { slots: { position: number; player_hero_id: string }[] };
  }>(
    "/player/formation/:kind",
    {
      schema: {
        params: {
          type: "object",
          properties: { kind: { type: "string", enum: ["campaign", "arena_defense", "tower"] } },
        },
        body: {
          type: "object",
          required: ["slots"],
          properties: {
            slots: {
              type: "array",
              maxItems: 5,
              minItems: 1,
              items: {
                type: "object",
                required: ["position", "player_hero_id"],
                properties: {
                  position: { type: "integer", minimum: 0, maximum: 4 },
                  player_hero_id: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const accountId = accountIdOf(req);
      const { slots } = req.body;

      const positions = new Set(slots.map((s) => s.position));
      const heroIds = new Set(slots.map((s) => s.player_hero_id));
      if (positions.size !== slots.length || heroIds.size !== slots.length) {
        return reply.code(422).send({ error: "duplicate_position_or_hero" });
      }
      // todos os heróis pertencem ao jogador?
      const owned = await pool.query(
        "SELECT COUNT(*)::int AS n FROM player_heroes WHERE account_id = $1 AND id = ANY($2::uuid[])",
        [accountId, [...heroIds]]
      );
      if (owned.rows[0].n !== heroIds.size) return reply.code(422).send({ error: "hero_not_owned" });

      await pool.query(
        `INSERT INTO formations (account_id, kind, slots) VALUES ($1,$2,$3)
         ON CONFLICT (account_id, kind) DO UPDATE SET slots = EXCLUDED.slots, updated_at = now()`,
        [accountId, req.params.kind, JSON.stringify(slots)]
      );
      return reply.send({ ok: true });
    }
  );
}
