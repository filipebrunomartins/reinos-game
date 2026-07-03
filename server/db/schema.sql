-- ============================================================
-- Reinos de Ferro & Magia — Esquema PostgreSQL 15
-- Etapa 1 — v1.0
-- Convenções:
--  * IDs de jogador: UUID. IDs de dados estáticos: TEXT (ex.: 'hero_flame_knight')
--  * Dados estáticos (heróis, estágios) vivem em tabelas *_def, versionadas,
--    carregadas a partir dos JSONs de design (seed script).
--  * Toda variação de recurso passa por transactions (auditoria).
--  * Timestamps sempre TIMESTAMPTZ (UTC).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CONTAS E AUTENTICAÇÃO
-- ============================================================

CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       TEXT UNIQUE,                 -- login anônimo
    google_sub      TEXT UNIQUE,                 -- Google Sign-In (sub)
    apple_sub       TEXT UNIQUE,                 -- Apple Sign-In (sub)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ,
    banned_until    TIMESTAMPTZ,
    ban_reason      TEXT
);

CREATE TABLE refresh_tokens (
    token_hash      TEXT PRIMARY KEY,            -- sha256 do token
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_refresh_account ON refresh_tokens(account_id);

-- ============================================================
-- 2. PERFIL E RECURSOS DO JOGADOR
-- ============================================================

CREATE TABLE players (
    account_id          UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    nickname            TEXT NOT NULL DEFAULT 'Comandante',
    avatar_id           TEXT NOT NULL DEFAULT 'avatar_default',
    level               INT  NOT NULL DEFAULT 1,
    xp                  BIGINT NOT NULL DEFAULT 0,
    -- recursos (BIGINT: idle games estouram INT rápido)
    gold                BIGINT NOT NULL DEFAULT 0 CHECK (gold >= 0),
    gems_free           BIGINT NOT NULL DEFAULT 0 CHECK (gems_free >= 0),
    gems_paid           BIGINT NOT NULL DEFAULT 0 CHECK (gems_paid >= 0),
    xp_dust             BIGINT NOT NULL DEFAULT 0 CHECK (xp_dust >= 0),
    promo_dust          BIGINT NOT NULL DEFAULT 0 CHECK (promo_dust >= 0),
    summon_scrolls      INT    NOT NULL DEFAULT 0 CHECK (summon_scrolls >= 0),
    -- progressão / afk
    max_stage_id        TEXT,                        -- último estágio vencido
    last_afk_claim_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    afk_cap_hours       INT NOT NULL DEFAULT 12,     -- 14 com passe
    -- gacha pity
    pity_counter        INT NOT NULL DEFAULT 0,      -- invocações desde o último lendário
    -- arena
    arena_rating        INT NOT NULL DEFAULT 1000,
    arena_attempts_today INT NOT NULL DEFAULT 0,
    -- passe mensal
    monthly_pass_until  TIMESTAMPTZ,
    -- resets diários
    daily_reset_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    quick_afk_used_today INT NOT NULL DEFAULT 0,
    ads_watched_today   INT NOT NULL DEFAULT 0,
    dungeon_entries_today INT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fragmentos por herói e universais
CREATE TABLE player_shards (
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    shard_key   TEXT NOT NULL,   -- 'hero:<hero_def_id>' ou 'universal:<rarity>'
    amount      INT  NOT NULL DEFAULT 0 CHECK (amount >= 0),
    PRIMARY KEY (account_id, shard_key)
);

-- ============================================================
-- 3. DADOS ESTÁTICOS (definição de conteúdo, versionados)
-- ============================================================

CREATE TABLE config_versions (
    version     INT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE hero_defs (
    id              TEXT PRIMARY KEY,        -- 'hero_flame_knight'
    name_pt         TEXT NOT NULL,
    name_en         TEXT NOT NULL,
    faction         TEXT NOT NULL CHECK (faction IN ('flame','forest','storm','rock','abyss')),
    rarity          TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
    role            TEXT NOT NULL CHECK (role IN ('tank','phys_dps','mag_dps','support','control')),
    base_stats      JSONB NOT NULL,          -- {hp, atk, def, spd, crit, crit_dmg, acc, eva}
    growth_stats    JSONB NOT NULL,          -- incremento por nível
    passive         JSONB NOT NULL,          -- definição da passiva
    ultimate        JSONB NOT NULL,          -- definição da ultimate (custo 1000 energia)
    sprite_key      TEXT NOT NULL,           -- chave Addressables
    enabled         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE stage_defs (
    id              TEXT PRIMARY KEY,        -- 'stage_01_01'
    chapter         INT NOT NULL,
    stage_num       INT NOT NULL,
    enemy_team      JSONB NOT NULL,          -- [{hero_def_id, level, stars, equip_tier}]
    is_boss         BOOLEAN NOT NULL DEFAULT FALSE,
    first_clear_rewards JSONB NOT NULL,      -- [{type, key, amount}]
    afk_rates       JSONB NOT NULL,          -- {gold_per_hour, xp_dust_per_hour, drops:[...]}
    power_hint      INT NOT NULL,            -- poder recomendado (exibição)
    UNIQUE (chapter, stage_num)
);

CREATE TABLE item_defs (
    id              TEXT PRIMARY KEY,        -- 'wpn_iron_sword'
    slot            TEXT NOT NULL CHECK (slot IN ('weapon','armor','helmet','boots')),
    rarity          TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
    set_id          TEXT,                    -- bônus de conjunto
    main_stat       JSONB NOT NULL,          -- {stat, value_per_tier}
    sprite_key      TEXT NOT NULL
);

CREATE TABLE shop_product_defs (
    id              TEXT PRIMARY KEY,        -- 'gems_pack_1'
    store_sku       TEXT NOT NULL,           -- SKU na Play Store/App Store
    kind            TEXT NOT NULL CHECK (kind IN ('gems','monthly_pass','offer')),
    grants          JSONB NOT NULL,          -- o que credita
    first_buy_bonus JSONB,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- 4. INSTÂNCIAS DO JOGADOR
-- ============================================================

CREATE TABLE player_heroes (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    hero_def_id  TEXT NOT NULL REFERENCES hero_defs(id),
    level        INT  NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 240),
    stars        INT  NOT NULL DEFAULT 1 CHECK (stars BETWEEN 1 AND 10),
    energy       INT  NOT NULL DEFAULT 0,     -- reservado (batalhas persistentes futuras)
    obtained_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, hero_def_id)          -- 1 instância por herói; duplicata vira shard
);
CREATE INDEX idx_pheroes_account ON player_heroes(account_id);

CREATE TABLE player_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    item_def_id  TEXT NOT NULL REFERENCES item_defs(id),
    tier         INT  NOT NULL DEFAULT 1,     -- forja futura
    equipped_hero UUID REFERENCES player_heroes(id) ON DELETE SET NULL,
    obtained_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pitems_account ON player_items(account_id);
CREATE INDEX idx_pitems_equipped ON player_items(equipped_hero);

-- formações salvas (campanha, defesa de arena, torre)
CREATE TABLE formations (
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('campaign','arena_defense','tower')),
    slots       JSONB NOT NULL,   -- [{position:0..4, player_hero_id}] até 5
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, kind)
);

-- ============================================================
-- 5. PROGRESSO DE MODOS
-- ============================================================

CREATE TABLE campaign_progress (
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stage_id    TEXT NOT NULL REFERENCES stage_defs(id),
    cleared_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, stage_id)
);

CREATE TABLE tower_progress (
    account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    max_floor   INT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quest_progress (
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    quest_id    TEXT NOT NULL,               -- 'daily_battles_3', 'ach_chapter_2'...
    period_key  TEXT NOT NULL DEFAULT '',    -- '2026-07-03' p/ diárias, '' p/ conquistas
    progress    INT NOT NULL DEFAULT 0,
    claimed     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (account_id, quest_id, period_key)
);

CREATE TABLE login_streak (
    account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    cycle_day   INT NOT NULL DEFAULT 0,      -- 0..27 do calendário de 28 dias
    last_claim  DATE
);

-- ============================================================
-- 6. BATALHAS (auditoria e replay)
-- ============================================================

CREATE TABLE battles (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    mode          TEXT NOT NULL CHECK (mode IN ('campaign','tower','arena','dungeon')),
    ref_id        TEXT NOT NULL,             -- stage_id / floor / defender account
    seed          BIGINT NOT NULL,
    attacker_team JSONB NOT NULL,            -- snapshot completo (stats congelados)
    defender_team JSONB NOT NULL,
    result        TEXT CHECK (result IN ('win','loss')),
    rounds        INT,
    rewards       JSONB,                     -- o que foi creditado
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ
);
CREATE INDEX idx_battles_account ON battles(account_id, created_at DESC);

-- ============================================================
-- 7. GACHA (auditoria)
-- ============================================================

CREATE TABLE summons (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    batch_size   INT NOT NULL CHECK (batch_size IN (1,10)),
    cost_type    TEXT NOT NULL CHECK (cost_type IN ('gems','scroll')),
    results      JSONB NOT NULL,   -- [{hero_def_id, rarity, was_pity, converted_to_shards}]
    pity_before  INT NOT NULL,
    pity_after   INT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_summons_account ON summons(account_id, created_at DESC);

-- ============================================================
-- 8. ECONOMIA: TRANSAÇÕES E IAP
-- ============================================================

-- livro-razão: TODA variação de recurso gera uma linha
CREATE TABLE transactions (
    id           BIGSERIAL PRIMARY KEY,
    account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    source       TEXT NOT NULL,   -- 'afk_claim','battle','summon','iap','quest','ad_reward','admin'
    source_ref   TEXT,            -- id da batalha/summon/pedido
    changes      JSONB NOT NULL,  -- [{resource:'gold', delta: 1500}, ...]
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_account ON transactions(account_id, created_at DESC);

-- idempotência de requisições que geram recompensa
CREATE TABLE idempotency_keys (
    key          TEXT PRIMARY KEY,           -- header Idempotency-Key
    account_id   UUID NOT NULL,
    endpoint     TEXT NOT NULL,
    response     JSONB NOT NULL,             -- resposta original a repetir
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- job de limpeza: DELETE WHERE created_at < now() - interval '48 hours'

CREATE TABLE iap_receipts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform      TEXT NOT NULL CHECK (platform IN ('google','apple')),
    product_id    TEXT NOT NULL REFERENCES shop_product_defs(id),
    store_tx_id   TEXT NOT NULL,             -- orderId / transactionId
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','verified','granted','refunded','invalid')),
    raw_payload   JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (platform, store_tx_id)           -- bloqueia replay de recibo
);

-- ============================================================
-- 9. ARENA
-- ============================================================
-- Rating vive em players.arena_rating; ranking em Redis (ZSET arena:season:<n>).
-- Histórico:
CREATE TABLE arena_matches (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season        INT NOT NULL,
    attacker_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    defender_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    battle_id     UUID NOT NULL REFERENCES battles(id),
    rating_delta_attacker INT NOT NULL,
    rating_delta_defender INT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_arena_attacker ON arena_matches(attacker_id, created_at DESC);
CREATE INDEX idx_arena_defender ON arena_matches(defender_id, created_at DESC);

CREATE TABLE arena_seasons (
    season      INT PRIMARY KEY,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    rewarded    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- 10. VIEWS ÚTEIS
-- ============================================================

CREATE VIEW v_player_power AS
SELECT ph.account_id,
       COUNT(*)                       AS hero_count,
       SUM(ph.level * 100 + ph.stars * 500) AS rough_power  -- placeholder; poder real calculado no servidor
FROM player_heroes ph
GROUP BY ph.account_id;

-- ============================================================
-- FIM — Etapa 2 adicionará seeds (24 heróis, 200 estágios) via script.
-- ============================================================
