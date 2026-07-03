import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { redis } from "../redis.js";
import { GACHA } from "../lib/economy.js";

const CACHE_KEY = "config:payload";

export default async function configRoutes(app: FastifyInstance) {
  app.get("/config", async (req, reply) => {
    // cache Redis (invalidado pelo seed ao ativar nova versão)
    let payload = await redis.get(CACHE_KEY);
    if (!payload) {
      const version = await pool.query(
        "SELECT version, checksum FROM config_versions WHERE is_active ORDER BY version DESC LIMIT 1"
      );
      if (!version.rows.length) return reply.code(503).send({ error: "config_not_seeded" });
      const [heroes, stages, items, products] = await Promise.all([
        pool.query("SELECT * FROM hero_defs WHERE enabled"),
        pool.query("SELECT * FROM stage_defs ORDER BY chapter, stage_num"),
        pool.query("SELECT * FROM item_defs"),
        pool.query("SELECT id, store_sku, kind, grants, first_buy_bonus FROM shop_product_defs WHERE enabled"),
      ]);
      payload = JSON.stringify({
        version: version.rows[0].version,
        checksum: version.rows[0].checksum,
        heroes: heroes.rows,
        stages: stages.rows,
        items: items.rows,
        products: products.rows,
        gacha_rates: { ...GACHA.rates, pity: GACHA.pityThreshold }, // exibição obrigatória no app
      });
      await redis.set(CACHE_KEY, payload, "EX", 300);
    }
    const parsed = JSON.parse(payload);
    if (req.headers["if-none-match"] === parsed.checksum) return reply.code(304).send();
    return reply.header("ETag", parsed.checksum).send(parsed);
  });
}
