# Reinos de Ferro & Magia (nome provisório)

Idle RPG 2D pixel art para Android e iOS. Cliente Unity (C#), backend server-authoritative
em Node.js + TypeScript, PostgreSQL e Redis.

## Estrutura

```
docs/       Documentação de design (GDD, decisões de arquitetura)
server/     Backend Node.js + TypeScript (Fastify)
  db/       Esquema PostgreSQL e migrações
  openapi.yaml  Contrato da API v1
client/     Projeto Unity 2022 LTS (Etapa 3+)
```

## Roadmap de etapas

- [x] **Etapa 1** — GDD + esquema do banco + contrato OpenAPI
- [ ] **Etapa 2** — Backend: auth, economia, AFK, gacha, anti-cheat básico
- [ ] **Etapa 3** — Unity: estrutura, telas, sincronização de dados
- [ ] **Etapa 4** — Combate automático 5v5 determinístico
- [ ] **Etapa 5** — Arena assíncrona, rankings, torre, masmorras
- [ ] **Etapa 6** — IAP, anúncios recompensados, missões, passe mensal
- [ ] **Etapa 7** — Polimento: tutorial, push, analytics, reconexão
- [ ] **Etapa 8** — Preparação para as lojas + deploy do backend

## Princípios técnicos

1. **Servidor manda**: toda recompensa, sorteio e resultado de batalha é calculado no servidor.
2. **Idempotência**: operações de recompensa usam `Idempotency-Key`.
3. **Conteúdo por dados**: heróis/estágios/itens definidos em dados, não em código.
4. **Batalha determinística**: mesma seed + mesmos times = mesmo resultado (TS no servidor, C# no cliente, testes de paridade).
