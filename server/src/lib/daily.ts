import type { PoolClient } from "pg";

/** Zera contadores diários se o dia (UTC) virou. Chamar com a linha do jogador travada. */
export async function ensureDailyReset(client: PoolClient, accountId: string): Promise<void> {
  await client.query(
    `UPDATE players SET
       arena_attempts_today = 0,
       quick_afk_used_today = 0,
       ads_watched_today = 0,
       dungeon_entries_today = 0,
       daily_reset_at = CURRENT_DATE
     WHERE account_id = $1 AND daily_reset_at < CURRENT_DATE`,
    [accountId]
  );
}

export interface ResourceSnapshot {
  gold: string;
  gems: string;
  xp_dust: string;
  promo_dust: string;
  summon_scrolls: number;
}

export async function resourceSnapshot(client: PoolClient, accountId: string): Promise<ResourceSnapshot> {
  const { rows } = await client.query(
    `SELECT gold, (gems_free + gems_paid) AS gems, xp_dust, promo_dust, summon_scrolls
     FROM players WHERE account_id = $1`,
    [accountId]
  );
  const r = rows[0];
  return {
    gold: String(r.gold),
    gems: String(r.gems),
    xp_dust: String(r.xp_dust),
    promo_dust: String(r.promo_dust),
    summon_scrolls: r.summon_scrolls,
  };
}
