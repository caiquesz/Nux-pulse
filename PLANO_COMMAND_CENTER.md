# NUX Pulse — "Command Center" (Admin Geral / Portfólio)

> Aba executiva de portfólio com agrupamento por nicho, scoring multi-categoria
> e alertas RAG cross-clientes.
> Versão 2 — 2026-04-25 — **revisada após ler o repo real.**

---

## 0. O que mudou da v1 (TL;DR)

A v1 do plano partia de "stack vazio, escolher tudo do zero". Depois de ler o
repo (`apps/api`, `apps/web`, migrations, `globals.css`):

- Stack real: **FastAPI + Next 16 + Postgres (Supabase)** com **CSS puro**
  (1208 linhas em `globals.css`) — **não usar shadcn/ui, não usar Tailwind.**
- Já existem **16 telas por cliente** + design system maduro com tokens
  semânticos (`--pos`, `--neg`, `--warn`, `--info`, `--hero`) e accent
  (`--lime`, `--citrus`, `--cobalt`) em light + dark.
- Já existem **primitives prontos**: `KpiCard`, `Sparkline`, `BigChart`,
  `Delta`, `PlatChip`, `Thumb` — Command Center reusa, não cria do zero.
- Já existe tabela `alerts` (uma por cliente) e módulo `project` (tasks /
  Planejamento). Estender, não duplicar.
- Já existe `unified_insights_daily` (Meta + Google blended) — perfeito como
  fonte do roll-up por nicho.
- `clients.accent_color` já existe — cada card de cliente carrega cor própria
  no Command Center.
- Density tokens (`--row-h`, `--card-pad`) já no CSS, com modo
  `data-density="comfortable"` e suporte a `compact`. Toggle já no shell.
- A home `/` hoje é uma listagem rasa — **Command Center substitui a home**.

---

## 1. Tese (não muda)

Hoje o Pulse responde "**como vai a campanha X do cliente Y**" (16 telas
ótimas para o nível tático).
Falta responder "**onde devo botar a mão agora, em qual cliente, em qual
eixo**" — em 5 segundos, sem abrir nenhuma sub-tela.

Três camadas (padrão de dashboard executivo 2026):

| Camada | Frequência | Pergunta que responde | Onde no Pulse |
|---|---|---|---|
| **Estratégica** | mensal | A carteira está saudável? Qual nicho está sangrando? | Topo da home (KPIs portfolio + tier breakdown) |
| **Tática** | semanal | Quais clientes caíram de nível? | Grid/tabela densa do Command Center |
| **Operacional** | diário | O que precisa de mão hoje? | Feed de alertas + drawer drill-down |

---

## 2. Diagnóstico real (2026-04-25)

### 2.1 O que já está pronto e dá pra reusar

| Capacidade | Onde está | Reuso direto |
|---|---|---|
| Métricas Meta consolidadas | `meta_insights_daily` + endpoints `/meta/overview` | ✅ usar como input |
| Métricas blended Meta+Google | `unified_insights_daily` | ✅ fonte primária do roll-up |
| Alertas por cliente (fadiga, CPC spike, underpace, no spend) | tela `/c/[slug]/alerts` + tabela `alerts` | ✅ estender com escopo portfolio |
| Pacing budget × real | tela `/c/[slug]/pacing` | ✅ insumo da categoria "Estratégia & Pacing" |
| Sync health (jobs, gaps, reconciliação) | tela `/c/[slug]/sync-health` | ✅ insumo da categoria "Saúde de Conta" |
| Tasks (Planejamento) | módulo `project` + `/c/[slug]/project` | ✅ insumo da categoria "Operação & SLA" |
| Cor por cliente | `clients.accent_color` | ✅ identidade visual nos cards |
| Tipografia, paleta, density | `globals.css` (1208 linhas) + `data-density` | ✅ herda tudo |
| Charts dark-friendly | `BigChart`, `Sparkline`, tokens `--chart-*` | ✅ reusa |

### 2.2 Bloqueadores conhecidos (Fase 0)

| Item | Estado | Impacto |
|---|---|---|
| `get_meta_overview` MCP quebrado | erro `MetaInsightsDaily.messages` | **bloqueia** scoring de `media_performance` |
| Token Meta da Evler corrompido | `last_error: InvalidToken` em `account_connections` | **bloqueia** scoring da Evler |
| Toque Mineiro sem `monthly_budget` / `monthly_revenue_goal` | dados ausentes | **bloqueia** categoria "Estratégia & Pacing" |
| Luana Corretora com `monthly_revenue_goal = 200` | provável erro de cadastro (R$ 200?) | confirmar com você |
| Campo `niche` não existe em `clients` | — | nova migration |
| Tabela `alerts` exige `client_id` (NOT NULL) | model em `apps/api/app/models/ops.py:31` | precisa ser `nullable=True` para alertas portfolio-wide |

---

## 3. Modelo de dados — em cima do que já existe

### 3.1 Migration A — tabela `niches` + campos novos em `clients`

```python
# apps/api/alembic/versions/20260427_0007_niches_and_clients_score.py

# Tabela self-service de nichos (Caique adiciona via UI)
op.create_table(
  "niches",
  sa.Column("code", sa.String(40), primary_key=True),       # ex: "ecommerce-food"
  sa.Column("name", sa.String(80), nullable=False),         # label PT-BR mostrado na UI
  sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)

# Novas colunas em clients
op.add_column("clients", sa.Column("niche_code", sa.String(40), sa.ForeignKey("niches.code"), nullable=True))
op.add_column("clients", sa.Column("segment", sa.String(40), nullable=True))   # free-text opcional
op.add_column("clients", sa.Column("onboarded_at", sa.DateTime(timezone=True), nullable=True))
op.add_column("clients", sa.Column("tier_current", sa.String(1), nullable=True))   # S/A/B/C/D
op.add_column("clients", sa.Column("score_current", sa.SmallInteger, nullable=True))  # 0–100
op.add_column("clients", sa.Column("score_updated_at", sa.DateTime(timezone=True), nullable=True))
op.create_index("ix_clients_niche_code", "clients", ["niche_code"])
op.create_index("ix_clients_tier", "clients", ["tier_current"])
```

Atualizar `apps/api/app/models/client.py` com os novos campos. Endpoints
auxiliares: `GET/POST /api/niches` (listar + criar) — usados pelo form
"+ Novo nicho" da UI.

### 3.2 Migration B — categorias e histórico de scores

```python
# 20260425_0008_scoring_engine.py

op.create_table(
  "service_categories",
  sa.Column("id", sa.Integer, primary_key=True),
  sa.Column("code", sa.String(40), unique=True, nullable=False),
  sa.Column("name", sa.String(80), nullable=False),
  sa.Column("weight", sa.Numeric(4, 3), nullable=False),
  sa.Column("description", sa.Text),
)

op.create_table(
  "client_category_scores",
  sa.Column("id", sa.BigInteger, primary_key=True),
  sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), index=True),
  sa.Column("category_id", sa.Integer, sa.ForeignKey("service_categories.id"), index=True),
  sa.Column("period_start", sa.Date, nullable=False),
  sa.Column("score", sa.SmallInteger, nullable=False),
  sa.Column("components", postgresql.JSONB),
  sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
  sa.UniqueConstraint("client_id", "category_id", "period_start"),
)

op.create_table(
  "client_scores",
  sa.Column("id", sa.BigInteger, primary_key=True),
  sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id", ondelete="CASCADE"), index=True),
  sa.Column("period_start", sa.Date, nullable=False),
  sa.Column("score", sa.SmallInteger),
  sa.Column("tier", sa.String(1)),
  sa.Column("delta_vs_prev", sa.SmallInteger),
  sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
  sa.UniqueConstraint("client_id", "period_start"),
)
```

### 3.3 Migration C — benchmarks por nicho

```python
# 20260425_0009_niche_benchmarks.py

op.create_table(
  "niche_benchmarks",
  sa.Column("id", sa.Integer, primary_key=True),
  sa.Column("niche_code", sa.String(40), sa.ForeignKey("niches.code"), nullable=False, index=True),
  sa.Column("metric", sa.String(40), nullable=False),  # ctr|cpc|roas|cvr
  sa.Column("p25", sa.Numeric),
  sa.Column("p50", sa.Numeric),
  sa.Column("p75", sa.Numeric),
  sa.Column("source", sa.String(40)),  # 'industry' | 'portfolio'
  sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
  sa.UniqueConstraint("niche_code", "metric", "source"),
)
```

### 3.4 Migration D — `alerts` portfolio-wide

```python
# 20260425_0010_alerts_portfolio.py

# Hoje client_id é NOT NULL. Tornar nullable + adicionar campos.
op.alter_column("alerts", "client_id", nullable=True)
op.add_column("alerts", sa.Column("rule_code", sa.String(40), nullable=True, index=True))
op.add_column("alerts", sa.Column("category_code", sa.String(40), nullable=True))  # FK lógico p/ service_categories.code
op.add_column("alerts", sa.Column("scope", sa.String(20), server_default="client"))  # 'client' | 'portfolio'
op.add_column("alerts", sa.Column("acknowledged_at", sa.DateTime(timezone=True)))
op.add_column("alerts", sa.Column("task_id", sa.Integer, sa.ForeignKey("project_tasks.id", ondelete="SET NULL"), nullable=True))
```

Vincula um alerta a uma task do `project` quando o usuário clica "Criar
task" — fechando o loop alerta → ação.

### 3.5 Seeds

`apps/api/scripts/seed_scoring.py`:
- `niches`: 11 rows iniciais (lista da §9 item 1). Caique pode adicionar
  mais pela UI depois.
- `service_categories`: 7 rows com pesos da §9 item 3.
- `niche_benchmarks`: medianas Meta 2026 por vertical (food-beverage,
  decor-home, real-estate, ecommerce-fashion etc.) — fonte: Triple Whale,
  MHI Growth Engine.

---

## 4. As 7 categorias de serviço

| code | nome | peso | natureza | fonte de dados existente |
|---|---|---|---|---|
| `media_performance` | Performance de Mídia | **0.30** | auto | `meta_insights_daily` × `niche_benchmarks` |
| `strategy_pacing` | Estratégia & Pacing | **0.20** | auto | endpoint `/meta/pacing` + `clients.monthly_revenue_goal` |
| `account_health` | Saúde de Conta | **0.15** | auto | `account_connections.last_error`, `sync_jobs`, frequency em `meta_insights_daily` |
| `creative_freshness` | Criativos | **0.10** | auto | `meta_creatives.created_at`, frequency das top campanhas |
| `operations_sla` | Operação & SLA | **0.10** | auto | `project_tasks.due_at`, status |
| `relationship` | Atendimento | **0.10** | manual | input semanal (formulário no Command Center) |
| `tracking_quality` | Tracking & Mensuração | **0.05** | auto | conversions table + EMQ Meta API |

Pesos editáveis via UI (administração das categorias) — `service_categories.weight`
não é hardcoded.

### 4.1 Fórmulas de cada categoria

**`media_performance`** (média ponderada de 3 sub-scores vs benchmark do nicho):
```python
def percentile_score(value, p25, p50, p75, lower_is_better=False):
    # mapeia o valor pro score 0-100 baseado no IQR do nicho
    if lower_is_better:
        if value <= p25: return 100
        if value >= p75: return 0
        return 50 + 50 * (p50 - value) / (p75 - p25)
    else:
        if value <= p25: return 0
        if value >= p75: return 100
        return 50 + 50 * (value - p50) / (p75 - p25)

ctr_s   = percentile_score(client_ctr,  *bench_ctr)
cpc_s   = percentile_score(client_cpc,  *bench_cpc, lower_is_better=True)
roas_s  = percentile_score(client_roas, *bench_roas)
score = 0.35*ctr_s + 0.20*cpc_s + 0.45*roas_s
```

**`strategy_pacing`** —
- `goal_pct` = revenue_30d / monthly_revenue_goal (capa em 1.2)
- `budget_pacing` = 1 − abs(spend_dia_X − ideal_dia_X) / ideal_dia_X
- `score = 60 * goal_pct + 40 * budget_pacing` (clip 0..100)

**`account_health`** — start em 100, deduz:
- `last_error` em qualquer conexão: −40
- `last_sync_at` > 48h: −30
- frequency média top-3 ≥ 5: −20; entre 3–5: −10
- > 50% campanhas pausadas há > 30d: −15
- pixel/CAPI sem evento `purchase` em 7d: −20

**`creative_freshness`** —
- volume novo no mês ≥ 8: +50; ≥ 4: +25
- idade média top-5 < 21d: +30; < 45d: +15
- frequency top-3 < 3: +20; 3–5: +10

**`operations_sla`** — janela 30d:
- % tasks completadas no prazo (peso 0.7)
- % tasks abertas há > 14d (penalidade até −20)
- # tasks "urgente" pendentes (penalidade)

**`relationship`** — manual. Formulário sexta de manhã com 1 campo (0–100) +
1 frase obrigatória de contexto. Se não preenchido em 14d, score "stale" no UI.

**`tracking_quality`** —
- EMQ Meta ≥ 7: +40; ≥ 5: +20
- cobertura de eventos (purchase, lead, atc, ic, vc): % × 40
- divergência GA × Meta < 15%: +20 (placeholder até GA conectado)

### 4.2 Score composto e tiers

```python
score_total = sum(cat_score * cat.weight for cat in categorias)
```

| Tier | Faixa | Token CSS | Significado |
|---|---|---|---|
| **S** | 90–100 | `--pos` (com glow) | Thriving — case / oportunidade de upsell |
| **A** | 80–89 | `--pos` | Healthy — manter cadência |
| **B** | 65–79 | `--warn` | Attention — proativo |
| **C** | 50–64 | `--warn-bg` + ink `--neg` | At-risk — intervenção planejada |
| **D** | <50 | `--neg` | Critical — task force imediato |

Aproveitamos os tokens semânticos já definidos em `globals.css`. Tier S leva
glow sutil via `box-shadow` em `--pos-fill`.

---

## 5. Engine de scoring (job)

Arquivo novo: `apps/api/app/services/scoring/`
- `scoring/categories.py` — uma função por categoria
- `scoring/engine.py` — orquestra: itera clientes ativos, calcula categorias,
  monta `client_category_scores`, agrega em `client_scores`, atualiza
  `clients.score_current/tier_current/score_updated_at`
- `scoring/benchmarks.py` — leitura de `niche_benchmarks` com fallback de
  industry → portfolio quando `n_clients_no_nicho >= 3`

**Frequência**: semanal (segunda 06:00 BRT). `period_start` = segunda da
semana ISO. Acopla no Vercel Cron já existente (`/api/cron/sync` →
`/api/cron/score`).

**Ponto importante**: o `MCP get_meta_overview` está quebrado, mas a engine
não chama o MCP — ela lê direto de `meta_insights_daily` via SQLAlchemy.
Então não dependemos do bug do MCP para a Fase 1. Mesmo assim corrigir o
MCP entra na Fase 0 porque várias outras coisas (eu, por exemplo) dependem.

**Endpoint novo**: `GET /api/portfolio/overview` — retorna agregação para
o Command Center (KPIs do header + lista de clientes com tier/score/delta +
contagem de alertas por severidade). Cache server-side de 10min.

---

## 6. Engine de alertas — estendendo o que já existe

A tela `/c/[slug]/alerts` hoje renderiza `metaAlerts(slug)` (regra fadiga,
CPC spike, underpace, no spend). Vamos estender e adicionar regras
**portfolio-wide** que escrevem em `alerts` com `scope='portfolio'`.

### 6.1 Regras novas

| `rule_code` | Severidade | Trigger | Onde calcula |
|---|---|---|---|
| `tier_downgrade` | warn | tier atual < tier semana anterior | engine de scoring |
| `tier_critical` | neg | tier_atual = D | engine de scoring |
| `score_drop_10` | warn | delta_vs_prev ≤ −10 | engine de scoring |
| `connection_broken` | neg | `account_connections.last_error IS NOT NULL` | hourly cron |
| `no_data_48h` | neg | `last_sync_at` > 48h | hourly cron |
| `goal_pacing_off` | warn | `goal_pct < 0.7 * dia_do_mes/30` | engine de scoring |
| `tasks_overdue_3plus` | warn | ≥ 3 tasks `project` com `due_at < now()` | hourly cron |
| `relationship_stale` | info | `relationship` sem update há 14d | engine de scoring |

### 6.2 Vínculo alerta → task

UI do alerta tem botão "**Criar task**" que faz:
```
POST /api/clients/{slug}/tasks  { title, priority='urgente', ai_context: {alert_id} }
```
e atualiza `alerts.task_id`. Aproveita `project` que já existe.

---

## 7. UI — onde encaixar no Pulse

### 7.1 Onde fica o Command Center

**Decisão**: Command Center **substitui a rota `/`** (a home atual). Hoje a
home é uma listagem rasa de cards (`apps/web/app/page.tsx`) — desperdício de
espaço prime. Movemos a função "criar cliente" pra um botão `+ Novo` no
canto superior direito do Command Center.

Adicionar item no `Sidebar.tsx`:
```tsx
const NAV: NavGroup[] = [
  { group: "NUX", items: [
    { id: "__home", label: "Command Center", icon: "overview" },  // rota /
  ]},
  // ... resto continua igual
];
```
O `__home` é um sentinel especial que renderiza com `href="/"` em vez de
`/c/{slug}/...`. (O Sidebar atualmente sempre prefixa com slug — pequena
mudança ali.)

Quando estamos na home, **não há `slug`** no Sidebar — `AppShell` precisa
suportar modo "global" (sem AccountSwitcher centrado em cliente; mostrar
"Todos os clientes" no Topbar).

### 7.2 Layout da tela

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR — "NUX · Command Center"   [DateRangePicker]   [+ Novo cliente]│
├──────────┬───────────────────────────────────────────────┬───────────┤
│ SIDEBAR  │                                               │ Drawer    │
│ (global) │  ┌─ HEADER STRIP — Portfolio KPIs ─────────┐  │ Alertas   │
│          │  │ KpiCard × 7 (reusando o componente)     │  │ (sticky   │
│ NUX      │  │ Clientes ativos · Spend MTD · Receita   │  │  >1440px) │
│ ▸ Cmd C  │  │ ROAS portf. · % S/A · #alerts crit ·   │  │           │
│          │  │ Δ score 7d                              │  │ neg ◐     │
│ ── ── ── │  └─────────────────────────────────────────┘  │ warn ◐    │
│          │                                               │ info ◐    │
│ FILTROS  │  ┌─ TIER BREAKDOWN BAR ──────────────────────┐│           │
│ Nicho    │  │ ▓▓▓ S(2)  ▓▓▓▓ A(3)  ▓▓ B(1)             │           │
│ Tier     │  └────────────────────────────────────────────┘           │
│ Δ score  │                                                            │
│ Conex.   │  [ Cards | Tabela | Por nicho ]   ← view toggle           │
│ ?Search  │                                                            │
│          │  ┌─ GRID DE CLIENTES ───────────────────────┐             │
│          │  │  Card                Card                │             │
│          │  │  ●cor  Nome    [A]   ●cor  Nome     [C]  │             │
│          │  │  nicho · spend       nicho · spend       │             │
│          │  │  ▁▂▄▆▇█ score        █▆▄▂▁▁ score        │             │
│          │  │  ROAS 3.2 ▲ CTR 5.8% ROAS 0.9 ▼          │             │
│          │  │  ◐ 0 alerts          ◐ 3 alerts          │             │
│          │  └──────────────────────────────────────────┘             │
└──────────┴───────────────────────────────────────────────┴───────────┘
```

### 7.3 Três views (toggle persistido em URL)

1. **Cards** (default, default em telas ≥ 1280px) — varredura visual rápida.
   Cada card carrega `accent_color` do cliente como linha lateral.

2. **Tabela densa** — uma row por cliente, 36px de altura
   (`data-density="compact"`), sortável. Colunas:
   `Cliente · Nicho · Tier · Score · Δ7d · Spend MTD · ROAS · CTR · Pacing · #Alertas · Última atualização`.
   Geist Mono em todas as colunas numéricas (já configurado em layout.tsx).

3. **Por nicho** — accordion. Header de cada nicho mostra: clientes do
   nicho, score médio, ROAS médio, % vs benchmark. Body lista cards/linhas.

### 7.4 Drawer drill-down (480px, lateral direito)

Ao clicar em qualquer card/linha, abre drawer:
- **Header**: nome, nicho, tier badge grande, score com sparkline 12 sem
- **Radar chart das 7 categorias** com benchmark do nicho sobreposto
  (linha tracejada). Implementar com Recharts ou SVG manual.
- **Lista de alertas ativos** do cliente
- **Top 3 campanhas** (mini-tabela, reusa shape de `metaCampaigns`)
- **5 últimas tasks** (`project_tasks`)
- **CTA**: "Abrir cliente" → `/c/{slug}/overview`

Drawer reusa motion/style já comum no Pulse (`TweaksPanel.tsx` é referência
de drawer lateral existente).

### 7.5 Filtros (sidebar esquerda da tela, abaixo do nav)

- Nicho (multi-select)
- Tier (chips S A B C D)
- Δ7d (range slider ±20)
- Status conexão (todas / com problema)
- Spend MTD (range)
- Search (nome/slug)

Estado em URL (`?niche=ecommerce-food&tier=A,B`). Compartilhável.

### 7.6 Feed de alertas (drawer direita, sticky)

Sempre visível em ≥ 1440px, colapsável abaixo. Agrupado por severidade.
Item:
```
[neg] há 12min
Evler — Meta token expirado
Reconectar a conta no Settings
[Reconectar →] [Ignorar 24h] [Criar task]
```

### 7.7 Aderência ao design system existente

Tokens usados (zero CSS novo necessário, **só extensões opcionais**):
- Surfaces: `--bg`, `--surface`, `--surface-2` (cards) e `--surface-3` (header strip)
- Texto: `--ink`, `--ink-3` (labels), `--ink-4` (helpers)
- Status: tiers usam `--pos`/`--warn`/`--neg` (com `-bg` e `-fill` correspondentes)
- Charts: `--chart-line`, `--chart-fill`, `--chart-grid`
- Density: respeita `data-density="compact"` (tabela) vs `comfortable` (cards)
- Radar chart usa `--info` para "este cliente" e `--ink-4` (tracejado) para benchmark

Componentes reusados:
- `KpiCard` (header strip)
- `Sparkline` (em cada card)
- `Delta` (Δ7d)
- `BigChart` (sparkline grande no drawer)
- `PlatChip` (Meta/Google badge nos cards quando ambas ativas)

Componentes novos a criar:
- `TierBadge` (S/A/B/C/D — letra + cor + tooltip)
- `RadarChart` (categorias × benchmark) — leve, só SVG
- `ClientCard` (composto — accent line + nome + tier + score sparkline + alerts dot)
- `AlertItem` (card no feed)
- `ScopeAppShell` — variante do `AppShell` sem slug, para a home

---

## 8. Roadmap em fases

| Fase | Duração | Entregáveis | Bloqueio |
|---|---|---|---|
| **0 — Limpeza & blockers** | 3 dias | Bug `get_meta_overview` corrigido · Evler reconectada · Toque Mineiro budget/meta cadastrados · Luana Corretora confirmar meta · cadastrar `niche` + `segment` em todos os 6 | nenhum |
| **1 — Modelo & engine** | 1 sem | Migrations 3.1–3.4 · seed `service_categories` + `niche_benchmarks` · `services/scoring/` · cron `/api/cron/score` (segunda 06h) · endpoint `/api/portfolio/overview` | Fase 0 |
| **2 — UI Command Center** | 2 sem | Substituir home `/` · Sidebar variante global · header KPIs · 3 views (cards/tabela/nicho) · filtros URL · drawer drill-down com radar | Fase 1 |
| **3 — Alertas portfolio** | 1 sem | Migration alerts portfolio-wide · regras 6.1 · feed lateral · alerta → task · notificação via NotificationsBell existente | Fase 2 |
| **4 — Benchmark do portfólio** | 1 sem | Recálculo de `niche_benchmarks` source='portfolio' quando n≥3 · indicador "vs portfólio NUX" no drawer · log de evolução por nicho | Fase 3 |
| **5 — IA layer** *(opcional)* | 2 sem | Resumo semanal por cliente em PT (LLM via Claude API) · sugestão de ação no alerta · "este mês vs anterior" automático | Fase 4 |

**MVP (Fase 0–3)**: ~5 semanas. Fase 4 é o que diferencia: NUX deixa de
usar benchmark público e passa a operar com benchmark próprio do portfólio.

---

## 9. Decisões fechadas (2026-04-27)

1. **Nichos como tabela self-service** (`niches`). Caique adiciona nicho
   novo direto pela UI no momento de cadastrar/editar cliente — sem
   migration. Seed inicial: `ecommerce-fashion`, `ecommerce-decor`,
   `ecommerce-food`, `imobiliaria`, `corretagem`, `servicos-locais`,
   `educacao`, `saude-estetica`, `b2b`, `infoproduto`, `outro`.
2. **Mapeamento cliente→nicho** sai do plano. Caique preenche o nicho
   no form de Cliente quando cadastra/edita. Princípio: toda empresa
   cadastrada (passada ou futura) aparece no Command Center
   automaticamente — sem allowlist.
3. **Pesos: 30/20/15/10/10/10/5** (na ordem da §4). Editáveis em
   `service_categories.weight` sem deploy.
4. **`relationship`** — formulário semanal sem dia fixo. Caique
   preenche por cliente: nota 0-100 + **frase opcional** (não
   obrigatória). 14 dias sem update → categoria recebe badge "stale"
   (sinaliza visualmente sem zerar o score).
5. **Tier D** dispara: alerta crítico no feed + **task urgente
   automática no Planejamento** (`priority='urgente'`, vinculada ao
   alerta via `alerts.task_id`). Push e email ficam pra Fase 5+.
6. **Periodicidade**: scoring **semanal** — segunda 06h BRT,
   `period_start` = segunda da ISO week.
7. **Auth real** fica para Fase 5+. Fase 1 mantém URL pública (estado
   atual). Premissa: validar valor do Command Center primeiro; auth
   entra depois.

---

## 10. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Bug do `get_meta_overview` MCP — outras automações dependem | Fase 0 obrigatória; tarefa específica |
| Conexão broken pode "envenenar" score | Categoria `account_health` deduz pesado; quando `last_error IS NOT NULL`, score do cliente todo fica com flag `stale` (ainda mostra, mas com badge "dado ruim") |
| Pesos viciados | Categorias têm `weight` editável no DB; UI admin de pesos na Fase 4 |
| `relationship` vira task esquecida | Regra `relationship_stale` (14d sem nota) gera alerta info; categoria fica congelada com badge "stale" no UI |
| Performance da home pesada | `/api/portfolio/overview` cache 10min; `client_scores` denormalizado em `clients.score_current` para filtros rápidos sem JOIN |
| Bench público pode não bater MG / Brasil | Fase 4 substitui pelo benchmark próprio; Fase 1–3 usa público com nota visual "fonte: industry" |
| Auth ainda não existe | Documentar como pendência; não bloqueia MVP, mas Command Center é a primeira tela que faz sentido só pra gestor — possível trigger para subir auth na frente |

---

## 11. Status

- **Fase 0** ✅ fechada em 2026-04-27 (bug `get_meta_overview` corrigido em
  prod, tokens Meta da Evler/Luana reconectados, Toque Mineiro/Luana
  cadastros corrigidos, endpoint `PATCH /api/clients/{slug}` adicionado).
- **§9** decisões fechadas em 2026-04-27 (todas as 7 resolvidas).
- **Fase 1** próximo passo — abrir migration A (`niches` + colunas novas
  em `clients`).

---

### Fontes da pesquisa

- [Customer Health Score — Realm](https://www.withrealm.com/blog/what-is-customer-health-score)
- [Agency reporting dashboards 2026 — Cometly](https://www.cometly.com/post/agency-client-reporting-dashboard)
- [Tiered dashboard structure — Improvado](https://improvado.io/blog/12-best-marketing-dashboard-examples-and-templates)
- [Executive dashboard — clariBI](https://claribi.com/blog/post/build-executive-dashboards-that-get-used/)
- [Cross-portfolio benchmarking — Funnel.io](https://funnel.io/blog/agency-health-check-dashboard)
- [Weighted scoring model — ProductSchool](https://productschool.com/blog/product-fundamentals/weighted-scoring-model)
- [Meta Ads benchmarks 2026 — Triple Whale](https://www.triplewhale.com/blog/facebook-ads-benchmarks)
- [Meta Ads benchmarks vertical — MHI](https://mhigrowthengine.com/blog/meta-ads-benchmarks-ecommerce-2026/)
- [RAG status thresholds — ClearPoint](https://www.clearpointstrategy.com/blog/establish-rag-statuses-for-kpis)
