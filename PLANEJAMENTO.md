# NUX Pulse — Planejamento completo

Sistema interno de análise de dados de tráfego pago. Agrega Meta Ads e Google Ads de múltiplos clientes da agência NUX em dashboards profissionais ao estilo Reportei/Nalk, com mais profundidade em criativos, search terms e impression share.

---

## 1. Princípios de produto

- **Mono-tenant interno.** Ferramenta da NUX, não SaaS. Sem cadastro público, sem billing, sem plano.
- **Multi-cliente.** Separação clara por cliente via rota `/c/{slug}/*` e cor-tema de identificação visual no topbar.
- **Sem ruído.** Hierarquia de tipografia rígida (Inter + DM Mono), microtype em labels, cards 12px, densidade ajustável, tema claro/escuro.
- **Dados crus confiáveis.** Toda métrica vem do SDK oficial da plataforma. Sem scraping, sem intermediários. O sistema mostra *o que a plataforma mostra*, mais o que a plataforma esconde atrás de UI ruim.
- **Fonte da verdade é o banco.** Dashboards leem do banco, nunca da API em tempo real (exceto D-0 via sync horário).

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────┐
│  FRONTEND — Next.js 15 + React 19 + TS          │
│  App Router · TanStack Query · CSS do NUX Pulse │
└─────────────┬───────────────────────────────────┘
              │ REST + SWR
┌─────────────▼───────────────────────────────────┐
│  BACKEND — FastAPI (Python 3.12)                │
│  SQLAlchemy 2 · Alembic · Pydantic v2           │
└─────────────┬───────────────────────────────────┘
              │
     ┌────────┴─────────┐
     ▼                  ▼
┌──────────┐    ┌─────────────────┐
│ Postgres │    │ Celery + Redis  │
│    16    │    │  (ingestão)     │
└──────────┘    └────────┬────────┘
                         │
            ┌────────────┼────────────┐
            ▼                         ▼
     ┌──────────────┐         ┌──────────────┐
     │ facebook-    │         │ google-ads-  │
     │ business SDK │         │ python SDK   │
     └──────────────┘         └──────────────┘
```

**Portas locais:** `3010` web (NUX Pulse) · `8000` api · `5432` db · `6379` redis.
Portas reservadas pelo ambiente: `3000` = site COMTEX, `3001` = Dolphin Anty.

---

## 3. Modelo de dados (resumo)

| Tabela | Chave | Uso |
|---|---|---|
| `clients` | id + slug | Tenants lógicos (cliente atendido pela NUX) |
| `account_connections` | (client, platform) | Credenciais Meta/Google criptografadas (Fernet) |
| `meta_campaigns / adsets / ads / creatives` | external id | Hierarquia Meta espelhada |
| `meta_insights_daily` | (client, date, level, object, breakdown) | Métricas diárias Meta |
| `google_campaigns / ad_groups / ads / keywords / asset_groups` | external id | Hierarquia Google |
| `google_search_terms_daily` | (client, date, campaign, ag, term) | Termos de busca |
| `google_insights_daily` | (client, date, level, object, segment) | Métricas diárias Google |
| `unified_insights_daily` | (client, date, platform, campaign) | View ETL cross-canal |
| `campaign_tag_rules / campaign_tag_matches` | — | Taxonomia (TOFU/MOFU/BOFU, produto) |
| `sync_jobs / alerts` | — | Operacional |

Ver `apps/api/alembic/versions/20260419_0001_initial_schema.py` para o schema completo.

---

## 4. Fases de entrega

### Fase 0 — Setup ✅ (concluída)

- [x] Monorepo `apps/web` (Next 15) + `apps/api` (FastAPI)
- [x] Docker Compose com Postgres 16 + Redis 7
- [x] `styles.css` do protótipo NUX Pulse portado integralmente
- [x] Shell (Sidebar · Topbar · AccountSwitcher · TweaksPanel)
- [x] Primitivos (Icon · Sparkline · BigChart · KpiCard · Delta · PlatChip · Thumb)
- [x] Rotas por cliente `/c/{slug}/*` com 14 telas (Overview real + 13 placeholders)
- [x] Schema SQL completo (Meta + Google + unificada + taxonomia + ops)
- [x] Alembic migration inicial
- [x] Stubs de serviços Meta/Google

### Fase 1 — Ingestão Meta Ads

- [x] Criptografia Fernet para `tokens_enc` (`app/core/crypto.py`)
- [x] Campo `timezone_name` + `currency` em `account_connections` (migration 0002)
- [x] `MetaClient` real com httpx, paginação e retry com backoff (`services/meta/client.py`)
- [x] `MetaClient.fetch_campaigns / adsets / ads / creatives / insights`
- [x] `sync_structure` + `sync_insights` + `run_backfill` (`services/meta/ingest.py`)
- [x] UPSERT idempotente em todas as tabelas Meta
- [x] Seed script (`scripts/seed.py`) — cria cliente **Segredos de Minas** + conexão
- [x] CLI backfill (`scripts/backfill.py`)
- [x] Router `/api/sync/meta/{slug}/backfill` (assíncrono via BackgroundTasks)
- [x] Router `/api/clients/{slug}/meta/{overview,campaigns,insights/daily}`
- [ ] **Próximo:** rodar contra DB real e validar que os dados batem com o Ads Manager
- [ ] Breakdowns age/gender/placement/device (ampliar chamadas após validação)
- [ ] Sync diário 03h via Celery beat (hoje é manual via CLI/HTTP)
- [ ] Sync horário D-0
- [ ] Monitoramento de rate limit (`X-Business-Use-Case-Usage`)

### Fase 2 — UI Meta ligada a dados reais (4-6 dias)

- [ ] `Overview` consumindo `unified_insights_daily`
- [ ] Tela `Meta Ads` completa (drill campanha → adset → ad → creative)
- [ ] Tela `Criativos` com grid visual real (thumb/vídeo) + ranking
- [ ] Tela `Funil` com cascata impressão → clique → carrinho → compra
- [ ] Tela `Sync Health` mostrando `sync_jobs` em tempo real
- [ ] Filtros globais (período, plataforma, tag, status)
- [ ] Seletor de métrica no `BigChart` do Overview

### Fase 3 — Ingestão Google Ads (5-7 dias)

- [ ] OAuth MCC + developer token
- [ ] `GoogleAdsClient.query(gaql)` com retry e paginação
- [ ] Ingestão `campaign / ad_group / ad / keyword / asset_group`
- [ ] Ingestão `search_term_view` (termos de busca)
- [ ] Ingestão `customer / campaign` insights com IS e quality score
- [ ] Tratamento dos 6 channel types (Search, Display, Shopping, Video, PMax, DemandGen)
- [ ] Backfill 13 meses para COMTEX

### Fase 4 — UI Google + cross-canal (4-5 dias)

- [ ] Tela `Google Ads` (drill campaign → ad group → keyword/asset)
- [ ] Tela `Search Terms` com filtros de negativação rápida
- [ ] Overview agora com gráfico Meta × Google lado a lado
- [ ] Blended ROAS / MER
- [ ] Impression Share alerts

### Fase 5 — Análise avançada (5-7 dias)

- [ ] Tela `Audiência` (Meta audiences + Google audience segments)
- [ ] Tela `Geo & Horário` com heatmap hora × dia
- [ ] Tela `Pacing` com budget vs. projeção mensal
- [ ] Tela `Alertas` consumindo tabela `alerts` + regras de detecção:
  - Fadiga criativa (frequency > 4, CTR caindo 7d)
  - CPA acima da meta (configurável)
  - Impression Share perdido por budget/rank
  - Divergência entre Meta/Google/GA4
- [ ] Tela `Configurações do cliente`:
  - Metas mensais (budget, receita)
  - Taxonomia: CRUD de regex → tag
  - Conexões: status dos tokens
  - Mapeamento de conversões (qual `action` do Meta conta como compra)

### Fase 6 — Polish (4-5 dias)

- [ ] Export PDF (Overview, Meta, Google, Criativos)
- [ ] Link público compartilhável (token curto, expiração)
- [ ] Agendamento automático de relatórios (WhatsApp + email)
- [ ] Tela `Forecast` (projeção linear ou Prophet simples)
- [ ] Comentários/anotações em KPIs (timeline)
- [ ] Histórico YoY nas sparklines

**Total estimado:** ~6 semanas de desenvolvimento focado.

---

## 5. Catálogo de métricas

### Meta Ads

**Volume:** impressions · reach · frequency · clicks · unique_clicks · inline_link_clicks
**Custo:** spend · cpm · cpc · cpp · cost_per_action_type
**Engajamento:** ctr · unique_ctr · video_p25/50/75/100_watched · thruplays · reactions · shares
**Conversão:** actions (purchase, lead, add_to_cart, initiate_checkout, view_content) · action_values · purchase_roas
**Breakdowns:** age · gender · country · region · publisher_platform · platform_position · impression_device · hourly
**Metadados:** objective · bid_strategy · budget · effective_status

### Google Ads

**Custo:** cost_micros · average_cpc · average_cpm · cost_per_conversion · cost_per_all_conversions
**Volume:** impressions · clicks · interactions · video_views
**Conversão:** conversions · all_conversions · conversion_value · value_per_conversion · view_through · cross_device
**Qualidade (Search):** quality_score · search_impression_share · search_top_is · search_abs_top_is · search_budget_lost_is · search_rank_lost_is
**Segmentações:** device · day_of_week · hour · geo_target_city · ad_network_type
**PMax:** asset_group_performance · listing_group · asset_performance_label
**RSA:** headline/description com performance_label (BEST/GOOD/LOW)

---

## 6. Decisões arquiteturais

| Decisão | Alternativa | Motivo da escolha |
|---|---|---|
| Python backend | Node/NestJS | SDKs Meta e Google muito mais maduros em Python |
| Postgres relacional | ClickHouse | Volume inicial não justifica OLAP; JSONB cobre flexibilidade |
| Next 15 App Router | Vite SPA | SSR útil pra relatórios compartilháveis + rotas por cliente |
| Celery | FastAPI background tasks | Backfills de horas precisam de worker dedicado |
| CSS puro do NUX Pulse | Tailwind | Já existe sistema de tokens bem pensado; não recriar |
| localStorage pra tweaks | Cookies | Uso interno, sem SSR crítico pra preferências de UI |
| Cor-tema por cliente | Favicon diferente | Mais econômico e visível durante switch |

---

## 7. Operação

- **Deploy alvo:** VPS única (Hetzner CX22 ou Contabo VPS S, ~€5/mês) com Docker Compose. TLS via Caddy ou Traefik.
- **Backup:** `pg_dump` diário → S3/Backblaze B2.
- **Logs:** stdout → Docker → `journalctl` (suficiente pra uso interno).
- **Monitoramento mínimo:** UptimeRobot no `/api/health`; alerta em e-mail se a API cair.

---

## 8. Próximos passos imediatos

1. Validar Docker Compose subindo limpo (`docker compose up`)
2. Criar COMTEX via `POST /api/clients` (ou seed direto no DB)
3. Começar Fase 1: obter system user token Meta + ad account ID COMTEX
4. Primeira ingestão real → validar schema no dia-a-dia
