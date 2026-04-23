/**
 * Catch-all proxy para a API NUX Pulse (FastAPI/Railway).
 *
 * Por que existe:
 *  - O backend agora exige header `X-API-Key` em todos endpoints.
 *  - Não queremos expor a chave no bundle do browser (NEXT_PUBLIC_* vira público).
 *  - Este handler roda server-side no Next.js, injeta o header e proxia.
 *
 * Fluxo:
 *    browser → /api/* (same-origin) → este handler → Railway API com X-API-Key
 *
 * Rotas mais específicas (ex.: /api/cron/sync) continuam tendo prioridade sobre
 * este catch-all (regra do App Router).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_BASE = process.env.NUX_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY = process.env.API_SECRET_KEY ?? "";

// Headers que o fetch() upstream NÃO deve herdar do request do browser.
// `host` quebra roteamento; `content-length` é recalculado pelo fetch; `connection`
// é hop-by-hop. Deixar o resto (Content-Type, Accept, etc) passar.
const STRIP_REQUEST_HEADERS = new Set(["host", "content-length", "connection", "x-api-key"]);

// Headers que não devemos devolver pro browser (hop-by-hop + encoding já decodificado).
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API_BASE}/api/${path.join("/")}${url.search}`;

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  }
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  // Body: só passa pra métodos que têm corpo. Usar req.body direto (stream) evita
  // parse/re-serialize e preserva binário. undici (fetch do Node) aceita ReadableStream.
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half"; // exigido pelo undici quando body é stream
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return Response.json({ error: "upstream_unreachable", detail: String(e) }, { status: 502 });
  }

  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) outHeaders.set(k, v);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
