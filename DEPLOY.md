# NUX Pulse — Deploy em produção

**Arquitetura:** Supabase (Postgres) + Railway (FastAPI) + Vercel (Next.js).
**Custo estimado:** $0 no começo, ~$5-20/mês com tráfego real.
**Tempo total:** ~1h (a maior parte é criar contas e colar chaves).

Siga **na ordem**. Cada passo tem um check "✅" no final — só avance quando passar.

---

## 0. Pré-requisitos

- Conta no GitHub com SSH configurado (ou HTTPS + PAT)
- Conta no Supabase — https://supabase.com
- Conta no Railway — https://railway.com
- Conta no Vercel — https://vercel.com

---

## 1. Subir o código pro GitHub

O repo local ainda não está versionado. Primeiro passo é inicializar e publicar.

```bash
cd C:\Users\Caique\nux-pulse
git init
git add -A
git commit -m "initial: NUX Pulse — setup + fase 1 Meta ingest"
```

Crie um repo privado em https://github.com/new (nome sugerido: `nux-pulse`, **Private**, sem README/gitignore — já temos).

```bash
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/nux-pulse.git
git push -u origin main
```

✅ **Check:** o repo aparece em `github.com/SEU_USUARIO/nux-pulse`.

---

## 2. Supabase — criar banco

1. https://supabase.com/dashboard → **New project**
2. Preencher:
   - **Name:** `nux-pulse`
   - **Database Password:** gere uma forte e **guarde** (vai precisar no Railway)
   - **Region:** idealmente `sa-east-1` (São Paulo). Outras regiões funcionam — só adicionam ~100-200ms de latência Brasil → host.
3. Clique **Create project** e espere ~2min provisionar.
4. Quando subir, vá em **Project Settings → Database → Connection string**.
5. Copie **duas** strings (substituindo `[YOUR-PASSWORD]` pela senha real):
   - **Connection pooling** (porta 6543, `?pgbouncer=true`) → será `DATABASE_URL`
   - **Direct connection** (porta 5432) → será `DIRECT_URL`

   Exemplo:
   ```
   DATABASE_URL=postgresql://postgres.jscpmvlilqgmkicxmgeg:SENHA@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true
   DIRECT_URL=postgresql://postgres.jscpmvlilqgmkicxmgeg:SENHA@aws-1-us-east-2.pooler.supabase.com:5432/postgres
   ```

✅ **Check:** você tem `DATABASE_URL` e `DIRECT_URL` anotadas.

---

## 3. Railway — deploy da API

1. https://railway.com → **New Project → Deploy from GitHub repo**
2. Autorize o GitHub (se ainda não fez) e selecione `nux-pulse`.
3. Na configuração:
   - **Root directory:** `apps/api`
   - Railway detecta o `Dockerfile` automaticamente.
4. Após iniciar build, vá em **Variables** e cole:

```
DATABASE_URL=postgresql://postgres.PROJECT:SENHA@aws-X-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT:SENHA@aws-X-REGION.pooler.supabase.com:5432/postgres
API_SECRET_KEY=<gere com: python -c "import secrets; print(secrets.token_urlsafe(48))">
CORS_ORIGINS=http://localhost:3010
```

> **Nota:** Railway injeta `$PORT` automaticamente — **não** precisa setar essa var.

> `CORS_ORIGINS` começa só com localhost — adicionamos o domínio Vercel depois.
> Deixe as envs do Meta/Google vazias por enquanto (só precisa quando conectar cliente real).

5. Vá em **Settings → Networking → Generate Domain**. Railway vai dar algo como `nux-pulse-api-production.up.railway.app`.
6. Espere o build terminar (~3-5min no primeiro deploy). Quando aparecer "Deployed", teste:

```bash
curl https://SEU-DOMINIO.up.railway.app/
# deve responder: {"service":"nux-pulse-api","version":"0.1.0"}
```

✅ **Check:** API responde 200 no domínio público, e logs do Railway mostram "alembic upgrade head" + "uvicorn running".

---

## 4. Vercel — deploy do frontend

1. https://vercel.com/new → importe o mesmo repo `nux-pulse`.
2. Configuração:
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Next.js (detectado)
   - **Build Command:** (deixa padrão)
3. Em **Environment Variables**, adicione:

```
NEXT_PUBLIC_API_URL=https://nux-pulse-api-production.up.railway.app
```
(usa o domínio que o Railway gerou no passo 3.5)

4. Clique **Deploy**. Aguarde ~2min.
5. Pegue a URL gerada (ex.: `nux-pulse-xxxx.vercel.app`).

✅ **Check:** você consegue abrir a URL do Vercel e ver a tela do NUX Pulse.

---

## 5. Fechar o loop — liberar CORS do Vercel na API

Volte ao **Railway → Variables** e atualize `CORS_ORIGINS` incluindo a URL do Vercel:

```
CORS_ORIGINS=https://nux-pulse-xxxx.vercel.app,http://localhost:3010
```

Railway reinicia o serviço automaticamente (~30s).

✅ **Check:** na tela do Vercel, o shell do NUX Pulse carrega lista de clients (mesmo vazia) sem erro de CORS no console do browser.

---

## 6. Conectar cliente piloto (Segredos de Minas)

Com tudo no ar, popule o DB:

```bash
# Localmente, exporte a DATABASE_URL do Supabase e rode o seed
cd apps/api
DATABASE_URL="postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres" python -m scripts.seed
```

> O seed cria o client `segredos-de-minas` e a conexão com o ad account da Meta.
> Token de sistema precisa estar em `META_SYSTEM_USER_TOKEN` no Railway antes do primeiro backfill.

---

## Manutenção

| Ação | Onde |
|---|---|
| Ver logs da API | Railway → Service → Logs |
| Ver queries lentas | Supabase → Database → Query Performance |
| Fazer deploy | `git push origin main` — Railway + Vercel rebuildam auto |
| Rollback | Railway: Deployments → clica na versão anterior → Redeploy |
| Backup do DB | Supabase → Database → Backups (automáticos, 7 dias no free tier) |

---

## Quando escalar

**Sinais que precisa melhorar:**

- Backfill de conta grande travando a API → **adicionar Celery worker** como service extra no Railway + Redis (Railway tem addon).
- Mais de 100 req/s → **upgrade do Supabase** pro Pro tier + usar pooler (porta 6543) em vez de direct.
- Latência alta Brasil → **Vercel região `gru1` (São Paulo)** já está por padrão; Railway tem `us-west` por padrão — migrar pra `eu-west` ou `ap-southeast` conforme onde estão os clientes.

---

## Troubleshooting rápido

**`alembic upgrade head` falha com `could not translate host name`** — URL do Supabase errada. Cheque que a senha não tem caracteres especiais não-escapados; se tiver `@` ou `:`, faça URL-encode.

**Vercel build falha em `Cannot find module ...`** — Root Directory não está em `apps/web`.

**CORS errors no console** — `CORS_ORIGINS` no Railway não inclui o domínio exato do Vercel (precisa ser com `https://` e sem barra final).

**`postgres://` vs `postgresql://`** — o `config.py` normaliza ambos; não precisa mexer.
