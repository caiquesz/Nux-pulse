# NUX Pulse — próximos passos

Status do sistema em **2026-04-20**. Todo o código de Fase 2 até Fase 6 está no ar. Algumas ações dependem de você.

---

## ✅ Funcionando agora

- **Fase 2 (Meta UI + Health)**: sync-health · meta (drill campanha→adset→ad) · creatives (grid com thumbs) · funnel
- **Fase 5 (Analítica)**: pacing · alerts (CTR/CPC/budget/no-spend) · audience (age/gender) · geo-time (region/hour)
- **Fase 6 (Relatórios)**: reports (print→PDF) · forecast (projeção linear vs. budget mensal)
- **KPIs de conversão** no Overview: Mensagens · Leads · Compras · ROAS (+ custo unitário)
- **Botão Sincronizar** no Overview e em Settings
- **Sync automático de breakdowns** (age/gender/region/hour) — best-effort

## ⚠ Ações manuais do Caique

### 1. Rotacionar o System User Token da Meta (URGENTE)
O token vazou nos logs do Railway durante debug. Passos:
1. Business Manager → System Users → [seu system user] → Generate Token
2. Gera novo token com permissões `ads_read`, `business_management`
3. Em https://nux-pulse.vercel.app/c/segredos-de-minas/settings, cola o novo token no form Meta → "Atualizar token"
4. Faça "Sincronizar agora" pra validar

### 2. Rotacionar `API_SECRET_KEY` do Railway
Ainda com valor placeholder. Como essa chave criptografa os tokens Meta/Google no DB, **trocar invalida os tokens salvos**.
```bash
# 1. Gera novo secret
python -c "import secrets; print(secrets.token_urlsafe(48))"

# 2. Seta no Railway
railway variables --set "API_SECRET_KEY=<novo_valor>"

# 3. Re-conecte Meta Ads e Google (os tokens vão precisar ser colados de novo pelo form)
```

### 3. Conectar Google Ads (quando quiser Fase 3+4 real)
O form em Settings aceita credenciais, mas a **ingestão** ainda não está implementada (só o scaffold). Quando for ativar:
1. Tenha: Developer Token (MCC) · Customer ID da conta-cliente · OAuth Client ID/Secret · Refresh Token
2. Cola no form em Settings (chave "Google Ads")
3. Implementar `apps/api/app/services/google/client.py::query(gaql)` com `google-ads` SDK
4. Implementar `apps/api/app/services/google/ingest.py` (similar ao meta/ingest)

### 4. Configurar cron diário
BackgroundTasks do FastAPI morre a cada deploy — você vai perder jobs longos.
**Mais simples**: Cron Schedule no Railway
1. Railway → New Service → Cron Schedule
2. Conecta ao mesmo GitHub
3. Cron expression: `0 2 * * *` (2h BRT)
4. Command: `curl -X POST https://nux-pulse-production.up.railway.app/api/sync/meta/segredos-de-minas/backfill -H "Content-Type: application/json" -d '{"days":3,"level":"ad"}'`

**Melhor (quando escalar)**: Celery worker no Railway + Redis (precisa adicionar `worker` como service separado + `redis` plugin).

### 5. Limpar jobs zumbis
Jobs #1, #2, #6, #7, #8 ficaram com `status=running` eterno (foram interrompidos por deploys). Não atrapalham, mas poluem a tabela. Execute no SQL do Supabase:
```sql
UPDATE sync_jobs
SET status = 'error',
    error_message = 'zombie: deploy interrompeu',
    finished_at = now()
WHERE status = 'running' AND started_at < now() - interval '10 minutes';
```

---

## 📊 Arquitetura atual

```
┌────────────────────┐       ┌─────────────────────────┐
│ Vercel             │ HTTPS │ Railway                 │
│ (Next 16 + React)  │──────▶│ (FastAPI + uvicorn)     │
│ nux-pulse.vercel   │       │ nux-pulse-production    │
│   .app             │       │   .up.railway.app       │
└────────────────────┘       └──────────┬──────────────┘
                                        │
                                        ▼
                             ┌─────────────────────────┐
                             │ Supabase                │
                             │ (Postgres 16)           │
                             │ jscpmvlilqgmkicxmgeg    │
                             └─────────────────────────┘
```

**Custo mensal estimado:** $0 (Vercel Hobby + Railway $5 free credit + Supabase Free tier). Dobra quando passar os limites free — ainda &lt;$30/mês.

## 🗺 O que falta pra produção real

- **Auth**: qualquer um com a URL pode ver tudo. Adicionar login simples (Supabase Auth ou Clerk) antes de expor a URL.
- **Multi-tenant**: hoje cada cliente da agência é um `Client` no DB, mas sem isolamento forte. Checar antes de onboard segundo cliente.
- **Exportação de PDF real** (hoje é só `window.print()`): serveless com Puppeteer ou usar Browserless.
- **Monitoring/Alertas externos**: usar Sentry pra erros de API e Better Uptime pra uptime checks.
- **Backup explícito do DB**: Supabase faz backup mas só 7 dias no free tier — considerar export diário.
