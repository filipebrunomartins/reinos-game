/**
 * content.ts — Conteúdo do jogo em dados (GDD §1 pilar 4).
 * Heróis definidos à mão; estágios e itens gerados por fórmula.
 */

type Faction = "flame" | "forest" | "storm" | "rock" | "abyss";
type Rarity = "common" | "rare" | "epic" | "legendary";
type Role = "tank" | "phys_dps" | "mag_dps" | "support" | "control";

export interface HeroDef {
  id: string;
  name_pt: string;
  name_en: string;
  faction: Faction;
  rarity: Rarity;
  role: Role;
  base_stats: Record<string, number>;
  growth_stats: Record<string, number>;
  passive: object;
  ultimate: object;
  sprite_key: string;
}

// stats base por papel; raridade multiplica
const ROLE_BASE: Record<Role, Record<string, number>> = {
  tank:     { hp: 1400, atk: 80,  def: 140, spd: 90,  crit: 5, crit_dmg: 150, acc: 100, eva: 5 },
  phys_dps: { hp: 900,  atk: 150, def: 70,  spd: 105, crit: 10, crit_dmg: 160, acc: 105, eva: 8 },
  mag_dps:  { hp: 850,  atk: 160, def: 60,  spd: 100, crit: 8,  crit_dmg: 165, acc: 110, eva: 5 },
  support:  { hp: 1000, atk: 95,  def: 90,  spd: 110, crit: 5,  crit_dmg: 150, acc: 100, eva: 10 },
  control:  { hp: 950,  atk: 110, def: 80,  spd: 115, crit: 6,  crit_dmg: 150, acc: 115, eva: 8 },
};
const RARITY_MULT: Record<Rarity, number> = { common: 1.0, rare: 1.15, epic: 1.35, legendary: 1.6 };

function mkHero(
  id: string, namePt: string, nameEn: string, faction: Faction, rarity: Rarity, role: Role,
  passive: object, ultimate: object
): HeroDef {
  const m = RARITY_MULT[rarity];
  const base = Object.fromEntries(
    Object.entries(ROLE_BASE[role]).map(([k, v]) =>
      ["crit", "crit_dmg", "acc", "eva"].includes(k) ? [k, v] : [k, Math.round(v * m)]
    )
  );
  return {
    id, name_pt: namePt, name_en: nameEn, faction, rarity, role,
    base_stats: base,
    growth_stats: { hp: Math.round(base.hp * 0.08), atk: Math.round(base.atk * 0.08), def: Math.round(base.def * 0.08) },
    passive, ultimate,
    sprite_key: id,
  };
}

const ult = (name: string, mult: number, target: string, effect?: object) => ({
  name, energy_cost: 1000, damage_mult: mult, target, ...(effect ? { effect } : {}),
});
const passive = (name: string, effect: object) => ({ name, ...effect });

export const HEROES: HeroDef[] = [
  // ---- Comuns (1 por facção) ----
  mkHero("hero_flame_recruit", "Recruta da Chama", "Flame Recruit", "flame", "common", "phys_dps",
    passive("Brasas", { self_atk_pct: 5 }), ult("Golpe Ardente", 1.8, "single")),
  mkHero("hero_forest_recruit", "Recruta da Floresta", "Forest Recruit", "forest", "common", "support",
    passive("Seiva", { heal_on_turn_pct: 2 }), ult("Toque Curativo", 0, "ally_lowest", { heal_pct_atk: 250 })),
  mkHero("hero_storm_recruit", "Recruta da Tempestade", "Storm Recruit", "storm", "common", "phys_dps",
    passive("Vento Ligeiro", { self_spd: 5 }), ult("Corte Duplo", 1.0, "single", { hits: 2 })),
  mkHero("hero_rock_recruit", "Recruta da Rocha", "Rock Recruit", "rock", "common", "tank",
    passive("Pele de Pedra", { self_def_pct: 8 }), ult("Provocação", 0.8, "single", { taunt_rounds: 2 })),
  mkHero("hero_abyss_recruit", "Recruta do Abismo", "Abyss Recruit", "abyss", "common", "mag_dps",
    passive("Sombra", { lifesteal_pct: 5 }), ult("Drenar", 1.5, "single", { lifesteal_pct: 30 })),
  // ---- Raros (1 por facção) ----
  mkHero("hero_flame_archer", "Arqueira Flamejante", "Flame Archer", "flame", "rare", "phys_dps",
    passive("Flechas Quentes", { burn_chance_pct: 20, burn_dmg_pct: 10 }), ult("Chuva de Fogo", 1.2, "all", { burn_rounds: 2 })),
  mkHero("hero_forest_druid", "Druida Verdejante", "Verdant Druid", "forest", "rare", "support",
    passive("Regeneração", { team_heal_on_turn_pct: 1 }), ult("Bênção da Mata", 0, "all_allies", { heal_pct_atk: 150 })),
  mkHero("hero_storm_blade", "Lâmina do Trovão", "Thunder Blade", "storm", "rare", "phys_dps",
    passive("Eletrizado", { crit_pct: 8 }), ult("Relâmpago Cortante", 2.2, "single", { stun_chance_pct: 25 })),
  mkHero("hero_rock_guard", "Guarda de Granito", "Granite Guard", "rock", "rare", "tank",
    passive("Muralha", { front_def_pct: 10 }), ult("Escudo Sísmico", 0, "all_allies", { shield_pct_hp: 15 })),
  mkHero("hero_abyss_witch", "Bruxa do Vazio", "Void Witch", "abyss", "rare", "control",
    passive("Maldição", { enemy_atk_debuff_pct: 5 }), ult("Silêncio Profundo", 1.3, "back_row", { silence_rounds: 1 })),
  // ---- Épicos (8) ----
  mkHero("hero_flame_knight", "Cavaleiro Ígneo", "Ember Knight", "flame", "epic", "tank",
    passive("Armadura Ardente", { reflect_pct: 10 }), ult("Investida Solar", 2.0, "single", { self_shield_pct_hp: 20 })),
  mkHero("hero_flame_mage", "Piromante", "Pyromancer", "flame", "epic", "mag_dps",
    passive("Combustão", { burn_dmg_pct: 15 }), ult("Meteoro", 1.6, "all", { burn_rounds: 3 })),
  mkHero("hero_forest_ranger", "Patrulheira Élfica", "Elven Ranger", "forest", "epic", "phys_dps",
    passive("Olho de Águia", { acc: 15, crit_pct: 6 }), ult("Flecha Perfurante", 2.6, "single", { def_pierce_pct: 40 })),
  mkHero("hero_forest_sage", "Sábio das Raízes", "Root Sage", "forest", "epic", "support",
    passive("Vitalidade", { team_hp_pct: 8 }), ult("Renascer", 0, "ally_lowest", { heal_pct_atk: 400, cleanse: true })),
  mkHero("hero_storm_monk", "Monge da Tormenta", "Tempest Monk", "storm", "epic", "control",
    passive("Fluxo", { energy_gain_pct: 15 }), ult("Palma Trovejante", 1.8, "single", { stun_rounds: 1 })),
  mkHero("hero_rock_golem", "Golem Ancestral", "Ancient Golem", "rock", "epic", "tank",
    passive("Inabalável", { debuff_resist_pct: 30 }), ult("Terremoto", 1.4, "all", { def_debuff_pct: 20 })),
  mkHero("hero_abyss_reaper", "Ceifador Sombrio", "Dark Reaper", "abyss", "epic", "phys_dps",
    passive("Colheita", { atk_pct_per_kill: 8 }), ult("Foice do Fim", 2.4, "single", { execute_below_hp_pct: 20 })),
  mkHero("hero_abyss_oracle", "Oráculo Abissal", "Abyss Oracle", "abyss", "epic", "control",
    passive("Presságio", { enemy_spd_debuff: 5 }), ult("Olhar do Vazio", 1.2, "all", { acc_debuff_pct: 25 })),
  // ---- Lendários (6) ----
  mkHero("hero_flame_dragon", "Dragão Solar", "Solar Dragon", "flame", "legendary", "mag_dps",
    passive("Fúria Dracônica", { atk_pct_below_half_hp: 30 }), ult("Sopro Devastador", 2.0, "all", { burn_rounds: 3, burn_dmg_pct: 20 })),
  mkHero("hero_forest_queen", "Rainha da Floresta", "Forest Queen", "forest", "legendary", "support",
    passive("Aura Vital", { team_heal_on_turn_pct: 2, team_def_pct: 10 }), ult("Jardim Eterno", 0, "all_allies", { heal_pct_atk: 300, shield_pct_hp: 15 })),
  mkHero("hero_storm_empress", "Imperatriz Celeste", "Sky Empress", "storm", "legendary", "phys_dps",
    passive("Velocidade da Luz", { extra_turn_chance_pct: 15 }), ult("Mil Cortes", 0.7, "all", { hits: 4 })),
  mkHero("hero_rock_titan", "Titã de Obsidiana", "Obsidian Titan", "rock", "legendary", "tank",
    passive("Fortaleza Viva", { team_dmg_reduction_pct: 12 }), ult("Colapso Tectônico", 1.8, "all", { stun_chance_pct: 30 })),
  mkHero("hero_abyss_lord", "Lorde do Abismo", "Abyss Lord", "abyss", "legendary", "mag_dps",
    passive("Pacto Sombrio", { lifesteal_pct: 20 }), ult("Devorar Almas", 2.8, "single", { heal_pct_dmg: 50 })),
  mkHero("hero_storm_valkyrie", "Valquíria do Raio", "Lightning Valkyrie", "storm", "legendary", "control",
    passive("Julgamento", { crit_pct: 12, crit_dmg_pct: 30 }), ult("Lança Divina", 2.5, "single", { stun_rounds: 1, def_pierce_pct: 30 })),
];

// ---------------- Estágios (10 capítulos × 20) ----------------
export interface StageDef {
  id: string;
  chapter: number;
  stage_num: number;
  enemy_team: object[];
  is_boss: boolean;
  first_clear_rewards: object[];
  afk_rates: { gold_per_hour: number; xp_dust_per_hour: number };
  power_hint: number;
}

const ENEMY_POOL = HEROES.filter((h) => h.rarity !== "legendary").map((h) => h.id);

export function generateStages(): StageDef[] {
  const stages: StageDef[] = [];
  for (let ch = 1; ch <= 10; ch++) {
    for (let st = 1; st <= 20; st++) {
      const globalIdx = (ch - 1) * 20 + st; // 1..200
      const isBoss = st === 20;
      const enemyLevel = Math.round(2 + globalIdx * 1.15);
      const teamSize = Math.min(5, 2 + Math.floor(globalIdx / 15));
      const enemies = Array.from({ length: teamSize }, (_, i) => ({
        hero_def_id: ENEMY_POOL[(globalIdx * 7 + i * 3) % ENEMY_POOL.length],
        level: isBoss ? Math.round(enemyLevel * 1.25) : enemyLevel,
        stars: Math.min(5, 1 + Math.floor(ch / 2)),
        equip_tier: Math.min(5, Math.ceil(ch / 2)),
      }));
      stages.push({
        id: `stage_${String(ch).padStart(2, "0")}_${String(st).padStart(2, "0")}`,
        chapter: ch,
        stage_num: st,
        enemy_team: enemies,
        is_boss: isBoss,
        first_clear_rewards: [
          { type: "gems", amount: isBoss ? 100 : 20 },
          { type: "gold", amount: 500 * globalIdx },
        ],
        afk_rates: {
          gold_per_hour: Math.round(600 * Math.pow(1.035, globalIdx)),
          xp_dust_per_hour: Math.round(300 * Math.pow(1.033, globalIdx)),
        },
        power_hint: Math.round(1000 * Math.pow(1.045, globalIdx)),
      });
    }
  }
  return stages;
}

// ---------------- Itens (4 slots × 4 raridades) ----------------
export interface ItemDef {
  id: string;
  slot: "weapon" | "armor" | "helmet" | "boots";
  rarity: Rarity;
  set_id: string | null;
  main_stat: object;
  sprite_key: string;
}

const SLOT_STAT: Record<ItemDef["slot"], string> = {
  weapon: "atk", armor: "hp", helmet: "def", boots: "spd",
};
const SLOT_BASE: Record<ItemDef["slot"], number> = { weapon: 30, armor: 250, helmet: 25, boots: 4 };

export function generateItems(): ItemDef[] {
  const items: ItemDef[] = [];
  for (const slot of ["weapon", "armor", "helmet", "boots"] as const) {
    for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
      items.push({
        id: `itm_${slot}_${rarity}`,
        slot,
        rarity,
        set_id: rarity === "epic" || rarity === "legendary" ? `set_${rarity}` : null,
        main_stat: {
          stat: SLOT_STAT[slot],
          value_per_tier: Math.round(SLOT_BASE[slot] * RARITY_MULT[rarity]),
        },
        sprite_key: `itm_${slot}_${rarity}`,
      });
    }
  }
  return items;
}

// ---------------- Produtos da loja ----------------
export const SHOP_PRODUCTS = [
  { id: "gems_pack_1", store_sku: "com.SEUJOGO.gems500",   kind: "gems", grants: [{ type: "gems_paid", amount: 500 }],   first_buy_bonus: [{ type: "gems_paid", amount: 500 }] },
  { id: "gems_pack_2", store_sku: "com.SEUJOGO.gems1200",  kind: "gems", grants: [{ type: "gems_paid", amount: 1200 }],  first_buy_bonus: [{ type: "gems_paid", amount: 1200 }] },
  { id: "gems_pack_3", store_sku: "com.SEUJOGO.gems3000",  kind: "gems", grants: [{ type: "gems_paid", amount: 3000 }],  first_buy_bonus: [{ type: "gems_paid", amount: 3000 }] },
  { id: "gems_pack_4", store_sku: "com.SEUJOGO.gems8000",  kind: "gems", grants: [{ type: "gems_paid", amount: 8000 }],  first_buy_bonus: [{ type: "gems_paid", amount: 8000 }] },
  { id: "gems_pack_5", store_sku: "com.SEUJOGO.gems18000", kind: "gems", grants: [{ type: "gems_paid", amount: 18000 }], first_buy_bonus: [{ type: "gems_paid", amount: 18000 }] },
  { id: "monthly_pass", store_sku: "com.SEUJOGO.monthlypass", kind: "monthly_pass", grants: [{ type: "monthly_pass_days", amount: 30 }], first_buy_bonus: null },
];
