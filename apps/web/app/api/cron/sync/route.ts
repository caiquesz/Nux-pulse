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

  // Chama a API com o mesmo CRON_SECRET (X-Cron-Secret) — a API também valida.
  try {
    const r = await fetch(`${apiBase}/api/sync/all?days=3&level=ad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { "X-Cron-Secret": cronSecret } : {}),
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
