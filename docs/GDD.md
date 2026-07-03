# GDD — Game Design Document
# Projeto: "Reinos de Ferro & Magia" (nome provisório)
## Idle RPG 2D Pixel Art — Android / iOS
Versão 1.0 — Etapa 1

---

## 1. Visão Geral

| Item | Definição |
|---|---|
| Gênero | Idle RPG / AFK RPG com gacha e combate automático |
| Plataformas | Android 7.0+ e iOS 13+ (Unity 2022 LTS, IL2CPP) |
| Orientação | Retrato (portrait), uma mão |
| Arte | Pixel art 2D (sprites 64x64 heróis, 32x32 itens), tema fantasia + tecnologia |
| Sessão-alvo | 5–15 min ativos, 2–4 sessões/dia |
| Modelo | Free-to-play: IAP + anúncios recompensados + passe mensal |
| Backend | Server-authoritative (Node.js + PostgreSQL + Redis) |
| Idiomas no lançamento | Português (BR) e Inglês |

**Fantasia central:** o jogador é um Comandante que recruta heróis de 5 facções para reconquistar um continente corrompido. Os heróis lutam sozinhos; o jogador é o estrategista que monta o time, evolui os heróis e coleta recompensas — inclusive enquanto dorme.

**Pilares de design:**
1. **Progresso sempre** — sempre há algo para coletar ou melhorar ao abrir o jogo.
2. **Decisão > execução** — a habilidade do jogador está na formação e nos upgrades, não em reflexo.
3. **Servidor manda** — nenhuma recompensa é gerada no cliente; impossível trapacear editando o app.
4. **Conteúdo por dados** — heróis, estágios e itens são definidos em dados (JSON/ScriptableObjects), não em código.

---

## 2. Loop Central

```
COLETAR AFK → MELHORAR HERÓIS → AVANÇAR CAMPANHA → DESBLOQUEAR MODOS →
GANHAR MAIS/HORA NO AFK → (volta ao início)
        ↑
   GACHA (novos heróis) ← diamantes ← missões, arena, torre, IAP, anúncios
```

- **Curto prazo (minutos):** coletar AFK, gastar ouro em níveis, tentar o próximo estágio.
- **Médio prazo (dias):** completar capítulos, subir estrelas de heróis, farmar equipamento.
- **Longo prazo (semanas/meses):** completar coleção lendária, topo da Arena, torre infinita.

---

## 3. Heróis

### 3.1 Facções (pentágono de vantagem, +25% de dano na vantagem)

```
Chama → Floresta → Tempestade → Rocha → Abismo → Chama ...
```

| Facção | Identidade | Cor |
|---|---|---|
| Chama | Dano explosivo, queimadura | Vermelho |
| Floresta | Cura, veneno, sustain | Verde |
| Tempestade | Velocidade, crítico, atordoar | Azul |
| Rocha | Tanques, escudo, provocar | Amarelo |
| Abismo | Roubo de vida, debuffs | Roxo |

### 3.2 Raridades

| Raridade | Cor | Estrelas iniciais | Taxa gacha | Qtde no lançamento |
|---|---|---|---|---|
| Comum | Cinza | 1★ | 55% | 5 (1/facção) |
| Raro | Azul | 2★ | 30% | 5 (1/facção) |
| Épico | Roxo | 3★ | 13% | 8 |
| Lendário | Dourado | 4★ | 2% | 6 |

Total no lançamento: **24 heróis**. Duplicatas viram **fragmentos** do próprio herói.

### 3.3 Papéis
- **Tanque** (linha de frente, alto HP/DEF)
- **Dano físico (ATK)** e **Dano mágico (ATK, escala diferente de skill)**
- **Suporte** (cura/buff)
- **Controle** (atordoar, silenciar, debuff)

### 3.4 Atributos
`HP, ATK, DEF, VEL (define ordem do turno), CRIT% (base 5), CRIT_DANO% (base 150), PRECISÃO, ESQUIVA`

Fórmula de dano base:
```
dano = ATK * multiplicador_skill * (1 + bonus_faccao) * mod_critico * (200 / (200 + DEF_alvo))
variação aleatória: ±5% (seed determinística — ver §7.4)
```

### 3.5 Progressão do herói
1. **Nível** (1–240): custa ouro + poeira de XP. Cap de nível preso ao nível de conta e às estrelas.
2. **Estrelas** (1★–10★): promove com fragmentos do herói (ou fragmentos universais da mesma raridade). Cada estrela: +10% atributos base e, em marcos (5★, 7★), melhora a ultimate.
3. **Equipamento**: 4 slots (Arma=ATK, Armadura=HP, Elmo=DEF, Botas=VEL). Raridades próprias, drop na campanha/masmorras. Sets de 2/4 peças dão bônus.
4. **Ultimate**: carrega com energia (ganha ao agir/receber dano; 1000 = pronta). Modo auto usa automaticamente; modo manual o jogador toca no retrato.

### 3.6 Escala de fragmentos para estrelas
| De → Para | Fragmentos |
|---|---|
| 1→2★ | 10 |
| 2→3★ | 20 |
| 3→4★ | 40 |
| 4→5★ | 80 |
| 5→6★ | 120 |
| 6→7★ | 160 |
| 7→8★ | 220 |
| 8→9★ | 300 |
| 9→10★ | 400 |

---

## 4. Combate

- **Formato:** 5v5, turnos por ordem de VEL, automático. Duração alvo: 20–60 s.
- **Formação:** grid 2 linhas (frente 2, trás 3). Linha de frente recebe ataques básicos primeiro.
- **Velocidade:** x1 / x2 (x4 desbloqueia no VIP/passe — decisão de monetização leve).
- **Auto-ultimate:** liga/desliga.
- **Determinismo:** toda batalha roda a partir de `(seed, formação A, formação B, dados dos heróis)`. O servidor simula com a MESMA lógica (módulo de combate compartilhado em TypeScript, portado 1:1 para C# com testes de paridade) e o cliente apenas reproduz o replay. Resultado do servidor é o que vale.
- **Condição de vitória:** eliminar o time inimigo. Limite de 15 rounds → derrota do atacante (anti-empate).

---

## 5. Modos de Jogo

### 5.1 Campanha (PvE principal)
- 10 capítulos × 20 estágios = **200 estágios** no lançamento.
- Cada estágio: 1 batalha; a cada 20, um **boss** com mecânica única.
- Vitória: primeira vez dá diamantes + fragmento; sempre dá ouro/XP.
- O estágio máximo alcançado define a **taxa de ganho AFK** (ouro/h, XP/h, drops/h).

### 5.2 Recompensa AFK
- Acumula desde a última coleta, **cap 12 h** (14 h com passe mensal).
- Cálculo **exclusivamente no servidor**: `min(agora - ultima_coleta, cap) × taxa_do_estagio`.
- Botão "Coleta rápida": 1×/dia grátis simula 2 h extras; anúncio recompensado dá +2 h (até 3×/dia); diamantes compram mais.

### 5.3 Torre Infinita
- Andares progressivos com inimigos cada vez mais fortes; sem cura entre andares no mesmo dia... simplificação: 1 tentativa por andar, reset de tentativas ilimitado, dificuldade escala 5%/andar.
- Recompensa fixa por andar + ranking cross-jogadores (Redis).

### 5.4 Arena (PvP assíncrono)
- Ataca a **formação de defesa salva** de outro jogador (fantasma); o defensor não precisa estar online.
- 5 tentativas grátis/dia (+ compra com diamantes).
- Pontuação Elo simplificada; ranking por temporada de 14 dias (Redis sorted set).
- Recompensas diárias por faixa de rank + baú de fim de temporada.
- Matchmaking: 3 oponentes sorteados na faixa de ±10% do Elo do jogador.

### 5.5 Masmorras diárias de recursos
- Seg–Dom, cada dia um tipo: Ouro, Poeira de XP, Fragmentos de equipamento, Pó de promoção. Domingo: todas abertas.
- 2 entradas grátis/dia; +1 por anúncio.

### 5.6 Missões
- **Diárias** (reset 00:00 BRT): logar, 1 coleta AFK, 3 batalhas, 1 invocação... completar tudo = baú com diamantes.
- **Semanais** e **Conquistas** (permanentes, marcos de progressão).

---

## 6. Economia

### 6.1 Moedas e recursos

| Recurso | Fonte | Uso | Onde vive |
|---|---|---|---|
| Ouro | AFK, campanha, masmorra | Nível de herói, forja | soft currency |
| Diamante | Missões, arena, IAP, conquistas | Gacha, refresh, aceleração | premium (dividida em `paga`/`grátis` para contabilidade das lojas) |
| Poeira de XP | AFK, masmorra | Nível de herói | soft |
| Pó de promoção | Masmorra, eventos | Estrelas junto com fragmentos | soft |
| Fragmento de herói (por herói) | Gacha duplicata, campanha 1ª vez | Estrelas | soft |
| Fragmento universal (por raridade) | Eventos, passe | Substitui fragmento específico | soft |
| Pergaminho de invocação | Missões, arena | 1 invocação grátis | soft |

### 6.2 Gacha
- Custo: 300 diamantes (1×) / 2 700 (10×, ~10% desconto) ou 1 pergaminho.
- **Pity:** Lendário garantido a cada 60 invocações sem Lendário (contador persiste e é exibido — exigência de transparência).
- **Taxas publicadas no app** (tela "Probabilidades", obrigatória para Apple/Google).
- Sorteio no servidor com RNG criptográfico; log de auditoria de cada invocação.

### 6.3 Monetização
| Produto | Preço ref. | Conteúdo |
|---|---|---|
| Pacotes de diamantes | R$ 9,90–R$ 249,90 | 500–18 000 diamantes (bônus 1ª compra em dobro) |
| Passe mensal | R$ 19,90 | 300 diamantes/dia por 30 dias + AFK cap 14 h + velocidade x4 |
| Ofertas de progresso | variável | disparadas por marco (cap. 3, 1º lendário...) |
| Anúncios recompensados | grátis | +2 h AFK, +1 masmorra, 1 pergaminho/dia (cap 5 anúncios/dia) |

**Regra de ouro:** tudo comprável com dinheiro também é alcançável jogando (exceto cosméticos futuros).

---

## 7. Arquitetura Técnica (resumo — detalhes no schema e OpenAPI)

### 7.1 Cliente (Unity)
- Unity 2022 LTS, URP 2D, TextMeshPro, Addressables para assets.
- Camadas: `UI → GameServices (API client) → Models`. Nenhuma regra de economia no cliente.
- Dados estáticos (heróis, estágios, itens) versionados: cliente baixa `GET /config` com hash; cacheia local.
- Offline: cliente mostra último estado cacheado em modo leitura; ações exigem conexão (v1). 

### 7.2 Backend
- Node.js 20 + TypeScript + Fastify. Stateless, escala horizontal.
- PostgreSQL 15 (fonte da verdade), Redis 7 (rankings, rate-limit, cache de config).
- JWT de acesso (15 min) + refresh token (30 dias). Login anônimo por `device_id`, vínculo posterior Google/Apple.
- **Idempotência:** toda operação de recompensa recebe `Idempotency-Key`; repetição retorna o mesmo resultado (proteção contra retry de rede duplicando recursos).
- **Auditoria:** tabela `transactions` registra toda variação de recurso com origem.

### 7.3 Anti-cheat básico
1. Recompensas calculadas no servidor (AFK, gacha, drops, arena).
2. Resultado de batalha: cliente envia `battle_id` + formação; servidor simula e decide.
3. Rate limits por endpoint (Redis).
4. Validação de recibos IAP com Google Play Developer API / App Store Server API antes de creditar.

### 7.4 Módulo de combate compartilhado
- Escrito em TypeScript (servidor) com RNG determinística (xorshift com seed do servidor).
- Porta 1:1 em C# no cliente para reprodução visual; suíte de testes com 1 000 batalhas comparando hashes de resultado TS×C# a cada release.

---

## 8. Progressão de Conta e Retenção

- **Nível de conta** (XP de batalhas): destrava modos — Arena (nv 8), Torre (nv 10), Masmorras (nv 12), Guildas (v1.1).
- **Login diário:** calendário de 28 dias com pergaminhos e um Épico no dia 28.
- **Push notifications:** AFK cheio (12 h), tentativas de arena não usadas (20:00), reset diário.
- **Tutorial:** 10 primeiros estágios guiados, gacha grátis garantindo 1 Épico no primeiro 10×.

---

## 9. Fora de escopo da v1 (backlog v1.1+)
Guildas e Guerra de Guildas, chat, eventos temporados, skins, cross-server, mini-jogos, trilha sonora original (v1 usa packs licenciados CC0/comprados).

---

## 10. Métricas de sucesso (analytics — Firebase)
`D1/D7/D30 retention`, funil do tutorial, estágio médio no D7, conversão 1ª compra, ARPDAU, anúncios/DAU. Eventos instrumentados desde o lançamento.
