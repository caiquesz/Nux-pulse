# NUX Pulse — estado + próximos passos

Atualizado **2026-04-21**. Tudo deployado em https://nux-pulse.vercel.app .

---

## ✅ Pronto (em produção)

### Telas funcionais (substituindo placeholders)
| Fase | Tela | Dados |
|---|---|---|
| 2 | Overview | KPIs reais + deltas WoW + chart com overlay de conversões |
| 2 | Meta Ads | Drill campanhas → conjuntos → anúncios com filtros |
| 2 | Criativos | Grid visual com thumbs + ranking por gasto |
| 2 | Funil | Impressões → clique → LP → carrinho → compra |
| 2 | Sync Health | Cobertura, reconciliação, gaps, erros, histórico de jobs |
| 3 | Google Ads (stub) | Form conectar · aguardando ingest |
| 4 | Search Terms (stub) | Aguardando ingest Google |
| 5 | Pacing | Budget esperado × real por campanha |
| 5 | Alerts | Fatigue / CPC spike / underpace / no spend |
| 5 | Audiência | Breakdown idade × gênero |
| 5 | Geo & Horário | Regiões top + heatmap por hora |
| 6 | Reports | Relatório imprimível (Ctrl+P → PDF) |
| 6 | Forecast | Projeção linear vs. budget mensal |
| — | Settings | Conectar Meta / Google + sincronizar |

### Confiabilidade dos dados
- **Reconciliação**: `/meta/data-health` compara soma por breakdown vs soma base (tolera ±1%)
- **Detecção de gaps**: dias sem dado listados
- **Logs estruturados**: cada call Meta API loga URL + duração + rows
- **Loop-breaker de paginação**: detecta cursor `after` repetido (bug conhecido Graph API)
- **FK-safe upserts**: ads órfãos (referenciando creatives fora do paginate) são skipados, não travam a transação
- **Job monitoring**: cleanup automático de zombies (`/sync/jobs/cleanup-stale`)

### Auto-sync
- **Vercel Cron** configurado: `/api/cron/sync` dispara backfill diário **05:00 UTC (02:00 BRT)**
- Janela padrão: últimos 3 dias (cobre re-delivery / late events da Meta)
- Protegido por `CRON_SECRET` (já setado em Railway + Vercel)

### KPIs do Overview
Investimento · **Mensagens + CPM/msg** · **Leads + CPL** · **Compras + CPA** · **ROAS + Receita** · Impressões · Cliques · CTR. Cada card tem:
- Valor atual
- Sparkline (30 dias)
- **Delta % vs período anterior** back-to-back (sem overlap)
- Cor verde/vermelho conforme direção

---

## ⚠ Ações manuais suas (quando voltar)

### 1. Rotacionar token Meta (URGENTE)
O System User Token vazou em logs durante debug da paginação. Steps:
1. Business Manager → System Users → Generate Token (permissões `ads_read`)
2. Paste em https://nux-pulse.vercel.app/c/segredos-de-minas/settings → form Meta → Atualizar token
3. Clique **Sincronizar** pra validar

### 2. Rotacionar `API_SECRET_KEY`
Ainda com valor placeholder. **Atenção**: essa chave criptografa os tokens Meta/Google no DB — trocar invalida os tokens salvos, precisa reconectar depois.
```bash
new_secret=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
railway variables --set "API_SECRET_KEY=$new_secret"
# Depois re-conectar Meta em /settings (o token antigo não vai mais descriptografar)
```

### 3. Conectar Google Ads (opcional, quando quiser ativar)
Form em Settings. Precisa de: Developer Token (MCC) · Customer ID · OAuth Client ID/Secret · Refresh Token. As credenciais ficam criptografadas no DB. **A ingestão de Google Ads ainda é stub** — quando ativar, implementar `apps/api/app/services/google/{client.py,ingest.py}`.

### 4. Adicionar mais clientes
Home → **+ Novo cliente** → preenche slug, nome, budget mensal, cor. Depois conecta Meta em Settings e dispara Sync.

---

## 🛠 Arquitetura

```
Vercel (Next 16)  ──HTTPS──▶  Railway (FastAPI)  ──SQL──▶  Supabase (Postgres)
     │                              │
     └─ Vercel Cron ──────┘
        05:00 UTC diário → /api/cron/sync → /api/sync/all
```

### Endpoints críticos
- `GET  /api/clients` · `POST /api/clients`
- `GET  /api/clients/{slug}/connections` · `POST /api/clients/{slug}/connections/{meta|google}`
- `POST /api/sync/meta/{slug}/backfill`  — dispara manual (body: `{days, level}`)
- `POST /api/sync/all` — cron-friendly, dispara pra todos (header: `X-Cron-Secret`)
- `GET  /api/sync/jobs` · `POST /api/sync/jobs/cleanup-stale`
- `GET  /api/clients/{slug}/meta/overview` — KPIs + deltas
- `GET  /api/clients/{slug}/meta/data-health` — auditoria
- `GET  /api/clients/{slug}/meta/{campaigns,adsets,ads,creatives,funnel,pacing,alerts,audience,geo-time}`
- `GET  /api/sync/meta/{slug}/diagnose` — health-check rápido da Meta API

---

## 🔮 Pendências de produto (backlog)

**Alto valor:**
- **Auth real** (Supabase Auth ou Clerk) — hoje qualquer URL vê tudo
- **Google Ads ingest completo** (SDK google-ads, GAQL queries) — stub está pronto
- **Multi-account**: seletor já existe, falta isolar queries por workspace

**Médio:**
- Export real de PDF (Puppeteer serveless ou Browserless)
- Monitoring externo (Sentry pra erros, Better Uptime pra uptime)
- Attribution windows configuráveis (1d/7d/28d click) — requer param na Meta API
- Comparação manual de períodos (today vs last year, etc.)
- Webhooks da Meta pra receber updates realtime (vs polling)

**Baixo mas bom:**
- Modo dark/light toggle (já existe parcial no design system)
- Keyboard shortcuts (⌘K pra buscar conta)
- Email digest semanal automático
- Slack integration pra alertas críticos

---

## 💰 Custo

| Serviço | Plano | Preço/mês |
|---|---|---|
| Vercel | Hobby | R$ 0 |
| Railway | Starter | R$ 25 (~$5) depois dos créditos |
| Supabase | Free | R$ 0 (até 500MB DB + 1GB transfer) |
| **Total** | | **~R$ 25/mês** |

Escalando (quando passar de 5-10 clientes + sync contínua): migrar Railway pra plano "Developer" (~R$ 100/mês) e Supabase pra Pro (~R$ 130/mês). Total ~R$ 250/mês.
