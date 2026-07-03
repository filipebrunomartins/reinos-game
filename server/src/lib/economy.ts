/**
 * economy.ts — Fonte única da verdade das regras econômicas.
 * Tudo aqui roda APENAS no servidor. O cliente exibe, nunca calcula.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";

// ---------- Gacha ----------
export const GACHA = {
  costGems1: 300,
  costGems10: 2700,
  pityThreshold: 60, // lendário garantido na 60ª invocação sem lendário
  rates: { common: 0.55, rare: 0.30, epic: 0.13, legendary: 0.02 } as Record<Rarity, number>,
  /** duplicata vira fragmentos do próprio herói */
  dupShards: { common: 5, rare: 10, epic: 20, legendary: 40 } as Record<Rarity, number>,
};

// ---------- Estrelas (GDD §3.6) ----------
export const STAR_UP: Record<number, { shards: number; promoDust: number }> = {
  1: { shards: 10, promoDust: 100 },
  2: { shards: 20, promoDust: 200 },
  3: { shards: 40, promoDust: 400 },
  4: { shards: 80, promoDust: 800 },
  5: { shards: 120, promoDust: 1200 },
  6: { shards: 160, promoDust: 1600 },
  7: { shards: 220, promoDust: 2200 },
  8: { shards: 300, promoDust: 3000 },
  9: { shards: 400, promoDust: 4000 },
};
export const MAX_STARS = 10;

// ---------- Nível de herói ----------
export const MAX_HERO_LEVEL = 240;
/** cap de nível pelas estrelas: 24 níveis por estrela */
export const heroLevelCap = (stars: number) => Math.min(MAX_HERO_LEVEL, stars * 24);
/** custo para ir de `level` para `level+1` */
export const levelUpCost = (level: number) => ({
  gold: Math.round(100 * Math.pow(level, 1.7)),
  xpDust: Math.round(50 * Math.pow(level, 1.6)),
});

// ---------- AFK ----------
export const AFK = {
  defaultCapHours: 12,
  passCapHours: 14,
  /** taxa base para quem ainda não venceu nenhum estágio */
  baseRates: { goldPerHour: 600, xpDustPerHour: 300 },
  quickFreePerDay: 1,
  quickAdPerDay: 3,
  quickGemsCost: 50,
  quickHoursGranted: 2,
  adsCapPerDay: 5,
};

// ---------- Novo jogador ----------
export const STARTER = {
  heroDefId: "hero_rock_recruit", // tanque comum inicial
  gold: 5000,
  gemsFree: 900, // suficiente para 3 invocações → sente o gacha cedo
  summonScrolls: 5,
};

// ---------- Recursos válidos no livro-razão ----------
export const RESOURCE_COLUMNS: Record<string, string> = {
  gold: "gold",
  gems_free: "gems_free",
  gems_paid: "gems_paid",
  xp_dust: "xp_dust",
  promo_dust: "promo_dust",
  summon_scrolls: "summon_scrolls",
};
