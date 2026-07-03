# CLAUDE.md — Reinos de Ferro & Magia

Idle RPG 2D pixel art para Android/iOS. Monorepo: docs/ (GDD), server/ (backend), client/ (Unity).

## Contexto obrigatório antes de qualquer tarefa
Leia SEMPRE, nesta ordem: docs/GDD.md, server/openapi.yaml, README.md (roadmap de 8 etapas).
Etapas 1 e 2 estão CONCLUÍDAS. O trabalho atual é a Etapa 3 em diante.

## Stack (não mudar sem me perguntar)
- Backend: Node 20 + TypeScript + Fastify, PostgreSQL 15, Redis 7. ESM ("type":"module").
- Cliente: Unity 2022 LTS, C#, URP 2D, retrato, IL2CPP, Addressables, TextMeshPro.

## Regras invioláveis do projeto
1. Server-authoritative: NENHUMA recompensa, sorteio ou resultado de batalha é
   calculado no cliente. O cliente exibe; o servidor decide.
2. Toda variação de recurso passa por applyChanges (server/src/lib/ledger.ts)
   e é auditada em transactions.
3. Endpoints que geram recompensa exigem header Idempotency-Key (mín. 8 chars).
4. Conteúdo (heróis/estágios/itens) é definido em dados (scripts/content.ts no
   servidor, ScriptableObjects no cliente), nunca hardcoded em lógica.
5. Combate determinístico: mesma seed + mesmos times = mesmo resultado.
   Lógica em TS no servidor, porta 1:1 em C# no cliente, com testes de paridade.

## Como rodar o servidor local
psql com schema em server/db/schema.sql, depois: cd server && npm install && npm run seed && npm run dev
Smoke test manual: endpoints descritos em server/README.md.

## Convenções
- Commits em português, um tema por commit, prefixado pela etapa (ex.: "Etapa 3: ...").
- Ao concluir uma etapa, marcar o checkbox no README.md da raiz.
- Trabalhe uma etapa por vez e me apresente o plano antes de gerar código em massa.
