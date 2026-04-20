# NUX Pulse

Sistema interno de análise de dados de tráfego pago. Puxa dados de Meta Ads e Google Ads, organiza por cliente, entrega dashboards profissionais.

## Stack

| Camada | Tech |
|---|---|
| Frontend | Next.js 15 + TypeScript + React 19 |
| Backend | FastAPI + SQLAlchemy 2 + Alembic (Python 3.12) |
| DB | PostgreSQL 16 |
| Fila | Redis + Celery (Fase 2) |
| Meta API | httpx direto (v22.0) com paginação e retry |
| Google Ads | `google-ads-python` (Fase 3) |

## Portas locais

| Porta | Serviço |
|---|---|
| 3010 | NUX Pulse web |
| 8000 | NUX Pulse API |
| 5432 | Postgres |
| 6379 | Redis |

> As portas 3000 (site COMTEX) e 3001 (Dolphin Anty) são preservadas.

## Setup (primeira vez)

1. **Instalar** [Docker Desktop](https://www.docker.com/products/docker-desktop).
2. **Copiar o env**:
   ```bash
   cp .env.example .env
   ```
3. **Preencher o `.env`** (apenas Meta nesta fase):
   ```
   META_SYSTEM_USER_TOKEN=<seu system user token>
   META_APP_ID=<app id>          # opcional
   META_APP_SECRET=<app secret>   # opcional
   API_SECRET_KEY=<string aleatória longa — usada pra derivar a Fernet key dos tokens no DB>
   ```
4. **Subir tudo**:
   ```bash
   docker compose up
   ```
   Alembic roda automaticamente no boot e aplica as migrations.

## Primeiro uso — cliente piloto (Segredos de Minas)

Com os containers rodando, em outro terminal:

```bash
# 1) Seed: cria o cliente 'segredos-de-minas' e grava a connection Meta (token criptografado)
docker compose exec api python -m scripts.seed

# 2) Backfill: puxa estrutura (campanhas/adsets/ads/creatives) + insights diários dos últimos 30 dias
docker compose exec api python -m scripts.backfill --slug segredos-de-minas --days 30 --level ad

# 3) Conferir o resultado
curl http://localhost:8000/api/clients/segredos-de-minas/meta/overview?days=30 | python -m json.tool
curl http://localhost:8000/api/clients/segredos-de-minas/meta/campaigns?days=30 | python -m json.tool
curl http://localhost:8000/api/sync/jobs?client_slug=segredos-de-minas | python -m json.tool
```

Também dá pra disparar o backfill via HTTP (async):

```bash
curl -X POST http://localhost:8000/api/sync/meta/segredos-de-minas/backfill \
     -H 'content-type: application/json' \
     -d '{"days": 30, "level": "ad"}'
```

## Endpoints disponíveis

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/api/health`                                   | Status (checa DB) |
| GET  | `/api/clients`                                  | Lista clientes ativos |
| POST | `/api/clients`                                  | Cria cliente |
| GET  | `/api/clients/{slug}`                           | Detalhe do cliente |
| GET  | `/api/clients/{slug}/meta/overview?days=N`      | KPIs consolidados Meta |
| GET  | `/api/clients/{slug}/meta/campaigns?days=N`     | Lista de campanhas com métricas |
| GET  | `/api/clients/{slug}/meta/insights/daily?days=N`| Série diária (account level) |
| POST | `/api/sync/meta/{slug}/backfill`                | Dispara backfill async |
| GET  | `/api/sync/jobs?client_slug=...`                | Histórico de jobs |

Swagger interativo: **http://localhost:8000/docs**

## Estrutura

```
nux-pulse/
├── apps/
│   ├── web/                    Next 15 (frontend)
│   └── api/
│       ├── app/
│       │   ├── core/           config · db · crypto (Fernet)
│       │   ├── models/         SQLAlchemy (clients, meta, google, unified, taxonomy, ops)
│       │   ├── routers/        FastAPI (clients, sync, insights, health)
│       │   ├── schemas/        Pydantic v2
│       │   └── services/
│       │       ├── meta/       client.py (Graph API) + ingest.py (UPSERT)
│       │       └── google/     stub para Fase 3
│       ├── alembic/            migrations
│       └── scripts/            seed.py, backfill.py (CLI)
├── docker-compose.yml
└── .env.example
```

## Fases

- [x] **Fase 0** — Setup: monorepo, shell portada, schema SQL completo
- [x] **Fase 1** — Ingestão Meta Ads: MetaClient + ingest + seed + CLI + endpoints  *(código pronto, falta rodar contra DB real)*
- [ ] **Fase 2** — UI Meta ligada a dados reais
- [ ] **Fase 3** — Ingestão Google Ads
- [ ] **Fase 4** — UI Google + cross-canal
- [ ] **Fase 5** — Análise avançada (geo/horário, taxonomia, pacing, alertas)
- [ ] **Fase 6** — Polish (export PDF, relatórios compartilháveis, forecast)

Ver [PLANEJAMENTO.md](./PLANEJAMENTO.md) para detalhes.
