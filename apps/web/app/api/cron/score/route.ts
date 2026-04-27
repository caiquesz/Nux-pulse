/**
 * Vercel Cron handler — roda o engine de scoring uma vez por semana.
 * Configurado em vercel.json → crons (segunda 06:00 BRT = 09:00 UTC).
 *
 * Proxia pra /api/cron/score da API Railway com CRON_SECRET + API_SECRET_KEY,
 * mesmo padrao do /api/cron/sync.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.API_SECRET_KEY;

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

  try {
    const r = await fetch(`${apiBase}/api/cron/score`, {
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
