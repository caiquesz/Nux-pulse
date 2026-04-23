/**
 * Vercel Cron handler — chamado 1×/dia (configurado em vercel.json → crons).
 * Proxia pra /api/sync/all da API Railway com o CRON_SECRET no header.
 *
 * Vercel autentica a request de cron com o header `Authorization: Bearer $CRON_SECRET`
 * (quando `CRON_SECRET` está setado em env vars da Vercel).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  // API_SECRET_KEY é lido server-side (sem NEXT_PUBLIC_) — fica só no edge,
  // nunca no bundle do browser. Necessário porque o router sync agora exige
  // X-API-Key em todos endpoints (defense-in-depth: cron também passa por auth).
  const apiKey = process.env.API_SECRET_KEY;

  // Vercel Cron envia "Authorization: Bearer <CRON_SECRET>". Rejeita se não bater.
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBase) {
    return Response.json({ error: "NEXT_PUBLIC_API_URL not set" }, { status: 500 });
  }

  // Chama a API com CRON_SECRET (X-Cron-Secret) + API_SECRET_KEY (X-API-Key).
  // A API valida os dois — cron deve ter ambas as credenciais.
  try {
    const r = await fetch(`${apiBase}/api/sync/all?days=3&level=ad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { "X-Cron-Secret": cronSecret } : {}),
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
    });
    const body = await r.json().catch(() => ({ parse_error: true }));
    return Response.json({
      triggered_at: new Date().toISOString(),
      api_status: r.status,
      api_response: body,
    }, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
