/**
 * seed.ts — Popula/atualiza o conteúdo do jogo no banco (idempotente).
 * Uso: npm run seed
 */
import { createHash } from "node:crypto";
import pg from "pg";
import { HEROES, generateStages, generateItems, SHOP_PRODUCTS } from "./content.js";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://game:game@localhost:5432/reinos" });

async function main() {
  const stages = generateStages();
  const items = generateItems();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const h of HEROES) {
      await client.query(
        `INSERT INTO hero_defs (id, name_pt, name_en, faction, rarity, role, base_stats, growth_stats, passive, ultimate, sprite_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           name_pt=$2, name_en=$3, faction=$4, rarity=$5, role=$6,
           base_stats=$7, growth_stats=$8, passive=$9, ultimate=$10, sprite_key=$11, enabled=TRUE`,
        [h.id, h.name_pt, h.name_en, h.faction, h.rarity, h.role,
         JSON.stringify(h.base_stats), JSON.stringify(h.growth_stats),
         JSON.stringify(h.passive), JSON.stringify(h.ultimate), h.sprite_key]
      );
    }

    for (const s of stages) {
      await client.query(
        `INSERT INTO stage_defs (id, chapter, stage_num, enemy_team, is_boss, first_clear_rewards, afk_rates, power_hint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           enemy_team=$4, is_boss=$5, first_clear_rewards=$6, afk_rates=$7, power_hint=$8`,
        [s.id, s.chapter, s.stage_num, JSON.stringify(s.enemy_team), s.is_boss,
         JSON.stringify(s.first_clear_rewards), JSON.stringify(s.afk_rates), s.power_hint]
      );
    }

    for (const it of items) {
      await client.query(
        `INSERT INTO item_defs (id, slot, rarity, set_id, main_stat, sprite_key)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET slot=$2, rarity=$3, set_id=$4, main_stat=$5, sprite_key=$6`,
        [it.id, it.slot, it.rarity, it.set_id, JSON.stringify(it.main_stat), it.sprite_key]
      );
    }

    for (const p of SHOP_PRODUCTS) {
      await client.query(
        `INSERT INTO shop_product_defs (id, store_sku, kind, grants, first_buy_bonus)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET store_sku=$2, kind=$3, grants=$4, first_buy_bonus=$5, enabled=TRUE`,
        [p.id, p.store_sku, p.kind, JSON.stringify(p.grants), p.first_buy_bonus ? JSON.stringify(p.first_buy_bonus) : null]
      );
    }

    // nova versão de config (checksum do conteúdo)
    const checksum = createHash("sha256")
      .update(JSON.stringify({ HEROES, stages, items, SHOP_PRODUCTS }))
      .digest("hex")
      .slice(0, 16);
    const v = await client.query("SELECT COALESCE(MAX(version),0)+1 AS next FROM config_versions");
    await client.query("UPDATE config_versions SET is_active = FALSE");
    await client.query(
      "INSERT INTO config_versions (version, checksum, is_active) VALUES ($1,$2,TRUE)",
      [v.rows[0].next, checksum]
    );

    await client.query("COMMIT");
    console.log(`Seed OK — versão ${v.rows[0].next} (${checksum}) | ${HEROES.length} heróis, ${stages.length} estágios, ${items.length} itens`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
