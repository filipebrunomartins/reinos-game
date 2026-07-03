# Servidor — Reinos de Ferro & Magia

Backend server-authoritative em Node.js 20 + TypeScript + Fastify.

## Rodar local (sem Docker)
Requer PostgreSQL 15+ e Redis 7+ rodando.
```bash
cp .env.example .env          # ajuste DATABASE_URL/JWT_SECRET
psql "$DATABASE_URL" -f db/schema.sql   # aplica o schema
npm install
npm run seed                  # popula 24 heróis, 200 estágios, itens, produtos
npm run dev                   # servidor em http://localhost:8080
```

## Rodar com Docker
```bash
docker compose up -d db redis
docker compose run --rm server sh -c "node dist/scripts/seed.js"
docker compose up server
```

## Endpoints implementados (Etapa 2)
Auth: POST /auth/anonymous, /auth/refresh, /auth/link (501 até a Etapa 7)
Config: GET /config (ETag/If-None-Match)
Player: GET /player · PUT /player/nickname · PUT /player/formation/:kind
Heróis: POST /heroes/:id/level-up · /star-up · /equip
AFK: GET /afk/status · POST /afk/claim · POST /afk/quick
Gacha: POST /gacha/summon (pity 60, auditoria em `summons`)

Recompensas exigem header `Idempotency-Key` (mín. 8 chars).

## Garantias
- Livro-razão: toda variação de recurso em `transactions`
- Idempotência: retry de rede nunca duplica recompensa
- Pity de gacha testado (contador 59 → lendário garantido)
- Rate limit 120 req/min/IP (Redis)
- Refresh token com rotação (reuso do antigo → 401)
