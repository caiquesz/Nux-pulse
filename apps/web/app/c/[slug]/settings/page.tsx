"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  createGoogleConnection,
  createMetaConnection,
  getClient,
  listConnections,
  listJobs,
  listNiches,
  triggerMetaBackfill,
  updateClient,
  type ClientUpdatePayload,
  type GoogleConnectionPayload,
  type MetaConnectionPayload,
} from "@/lib/api";

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const qc = useQueryClient();

  const conns = useQuery({
    queryKey: ["connections", slug],
    queryFn: () => listConnections(slug),
    enabled: !!slug,
  });

  const metaConn = conns.data?.find((c) => c.platform === "meta");
  const googleConn = conns.data?.find((c) => c.platform === "google");

  // ─── Dados do cliente (editáveis) ────────────────────────────────────
  const clientQ = useQuery({
    queryKey: ["client", slug],
    queryFn: () => getClient(slug),
    enabled: !!slug,
  });
  const nichesQ = useQuery({ queryKey: ["niches"], queryFn: () => listNiches() });

  const [pName, setPName] = useState("");
  const [pNiche, setPNiche] = useState<string>("");
  const [pSegment, setPSegment] = useState("");
  const [pBudget, setPBudget] = useState<string>("");
  const [pRevenueGoal, setPRevenueGoal] = useState<string>("");
  const [pAccent, setPAccent] = useState<string>("#FF6B35");
  const [profileSaved, setProfileSaved] = useState(false);

  // Hidrata o form quando o cliente carrega (ou quando mudar de slug).
  useEffect(() => {
    const c = clientQ.data;
    if (!c) return;
    setPName(c.name ?? "");
    setPNiche(c.niche_code ?? "");
    setPSegment(c.segment ?? "");
    setPBudget(c.monthly_budget ?? "");
    setPRevenueGoal(c.monthly_revenue_goal ?? "");
    setPAccent(c.accent_color ?? "#FF6B35");
  }, [clientQ.data]);

  const saveProfile = useMutation({
    mutationFn: (body: ClientUpdatePayload) => updateClient(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", slug] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
  });

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    const toNum = (s: string) => {
      const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };
    saveProfile.mutate({
      name: pName.trim() || undefined,
      niche_code: pNiche || null,
      segment: pSegment.trim() || null,
      monthly_budget: pBudget.trim() ? toNum(pBudget) : null,
      monthly_revenue_goal: pRevenueGoal.trim() ? toNum(pRevenueGoal) : null,
      accent_color: pAccent || null,
    });
  }

  const [adAccount, setAdAccount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  // Google connection state
  const [gCustomerId, setGCustomerId] = useState("");
  const [gDisplayName, setGDisplayName] = useState("");
  const [gDevToken, setGDevToken] = useState("");
  const [gClientId, setGClientId] = useState("");
  const [gClientSecret, setGClientSecret] = useState("");
  const [gRefreshToken, setGRefreshToken] = useState("");
  const [gLoginCustomer, setGLoginCustomer] = useState("");
  const [gJustSaved, setGJustSaved] = useState(false);

  const saveGoogle = useMutation({
    mutationFn: (body: GoogleConnectionPayload) => createGoogleConnection(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", slug] });
      setGJustSaved(true);
      setGDevToken("");
      setGClientSecret("");
      setGRefreshToken("");
      setTimeout(() => setGJustSaved(false), 3000);
    },
  });

  function submitGoogle(e: React.FormEvent) {
    e.preventDefault();
    if (!gCustomerId || !gDevToken || !gClientId || !gClientSecret || !gRefreshToken) return;
    saveGoogle.mutate({
      customer_id: gCustomerId.trim(),
      display_name: gDisplayName.trim() || null,
      developer_token: gDevToken.trim(),
      oauth_client_id: gClientId.trim(),
      oauth_client_secret: gClientSecret.trim(),
      refresh_token: gRefreshToken.trim(),
      login_customer_id: gLoginCustomer.trim() || null,
    });
  }

  const save = useMutation({
    mutationFn: (body: MetaConnectionPayload) => createMetaConnection(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", slug] });
      setJustSaved(true);
      setToken(""); // nunca mais mostra o token
      setTimeout(() => setJustSaved(false), 3000);
    },
  });

  // ─── Sync manual ─────────────────────────────────────────────
  const [syncDays, setSyncDays] = useState<number>(7);

  // Último job + polling enquanto estiver rodando
  const jobs = useQuery({
    queryKey: ["sync-jobs", slug],
    queryFn: () => listJobs(slug, 1),
    enabled: !!slug,
    refetchInterval: (q) => {
      const last = q.state.data?.[0];
      return last && last.status === "running" ? 3000 : false;
    },
  });
  const lastJob = jobs.data?.[0];
  const running = lastJob?.status === "running";

  const backfill = useMutation({
    mutationFn: (days: number) => triggerMetaBackfill(slug, { days, level: "ad" }),
    onSuccess: () => {
      // força re-fetch do job e invalida dashboards
      qc.invalidateQueries({ queryKey: ["sync-jobs", slug] });
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["meta-daily"] });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!adAccount.trim() || !token.trim()) return;
    const id = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
    save.mutate({
      external_account_id: id.trim(),
      display_name: displayName.trim() || null,
      system_user_token: token.trim(),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">13 — CONFIGURAÇÕES</div>
          <h1>Configurações do cliente</h1>
          <div className="sub">Integrações · metas · taxonomia</div>
        </div>
      </div>

      <section style={{ maxWidth: 640, marginTop: 24 }}>
        {/* ─── Dados do cliente (perfil editável) ─── */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Dados do cliente</h2>
            <span className="tag" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
              perfil
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
            Investimento mensal, meta de receita, nicho e segmento — usados pelo Command Center, scoring
            e relatórios.
          </p>

          <form onSubmit={submitProfile} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Nome</span>
              <input
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Nome do cliente"
                style={inputStyle}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Nicho</span>
                <select
                  value={pNiche}
                  onChange={(e) => setPNiche(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— sem nicho —</option>
                  {(nichesQ.data ?? []).map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Segmento (opcional)</span>
                <input
                  value={pSegment}
                  onChange={(e) => setPSegment(e.target.value)}
                  placeholder="ex: ecommerce, b2b, varejo"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Investimento mensal (R$)
                </span>
                <input
                  inputMode="decimal"
                  value={pBudget}
                  onChange={(e) => setPBudget(e.target.value)}
                  placeholder="10000"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Meta de receita mensal (R$)
                </span>
                <input
                  inputMode="decimal"
                  value={pRevenueGoal}
                  onChange={(e) => setPRevenueGoal(e.target.value)}
                  placeholder="50000"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Cor do tema do cliente</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  value={pAccent}
                  onChange={(e) => setPAccent(e.target.value)}
                  style={{
                    width: 44,
                    height: 36,
                    padding: 0,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                />
                <input
                  value={pAccent}
                  onChange={(e) => setPAccent(e.target.value)}
                  placeholder="#FF6B35"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", flex: 1 }}
                />
              </div>
            </label>

            {saveProfile.isError && (
              <div style={{ color: "var(--neg)", fontSize: 12 }}>
                {(saveProfile.error as Error).message}
              </div>
            )}
            {profileSaved && (
              <div style={{ color: "var(--pos)", fontSize: 12 }}>✓ Dados atualizados.</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button type="submit" className="btn" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Salvando…" : "Salvar dados"}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Meta Ads</h2>
            {metaConn ? (
              <span className="tag" style={{ background: "var(--pos-bg)", color: "var(--pos)" }}>
                conectado
              </span>
            ) : (
              <span className="tag" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>
                não conectado
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
            {metaConn
              ? `Conta ${metaConn.external_account_id}${metaConn.display_name ? ` — ${metaConn.display_name}` : ""}. Preencha de novo para rotacionar o token.`
              : "Cole o Ad Account ID e um System User Token permanente da Meta. O token é criptografado com Fernet antes de ir pro banco."}
          </p>

          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Ad Account ID *</span>
              <input
                value={adAccount}
                onChange={(e) => setAdAccount(e.target.value)}
                placeholder="act_2221699994983146"
                required
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Nome de exibição (opcional)</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Segredos de Minas - 01"
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                System User Token *{" "}
                <span style={{ color: "var(--ink-4)" }}>
                  (Business Manager → System Users → Generate Token)
                </span>
              </span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAB..."
                required
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </label>

            {save.isError && (
              <div style={{ color: "var(--neg)", fontSize: 12 }}>
                {(save.error as Error).message}
              </div>
            )}
            {justSaved && (
              <div style={{ color: "var(--pos)", fontSize: 12 }}>
                ✓ Salvo. Token criptografado no banco.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button type="submit" className="btn" disabled={save.isPending}>
                {save.isPending ? "Salvando…" : metaConn ? "Atualizar token" : "Conectar Meta Ads"}
              </button>
            </div>
          </form>
        </div>

        {metaConn && (
          <div className="card" style={{ padding: 24, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Sincronizar dados</h2>
              {running && (
                <span className="tag" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
                  rodando…
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
              {lastJob
                ? `Último job #${lastJob.id} · ${lastJob.status} · ${lastJob.rows_written} rows${
                    lastJob.finished_at ? ` · ${new Date(lastJob.finished_at).toLocaleString("pt-BR")}` : ""
                  }`
                : "Nenhum backfill executado ainda."}
            </p>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 6, flex: "0 0 auto" }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Janela</span>
                <select
                  value={syncDays}
                  onChange={(e) => setSyncDays(Number(e.target.value))}
                  disabled={running || backfill.isPending}
                  style={{ ...inputStyle, minWidth: 120 }}
                >
                  <option value={1}>1 dia</option>
                  <option value={7}>7 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </label>

              <button
                type="button"
                className="btn"
                onClick={() => backfill.mutate(syncDays)}
                disabled={running || backfill.isPending}
              >
                {running ? "Sincronizando…" : backfill.isPending ? "Enviando…" : "Sincronizar agora"}
              </button>
            </div>

            {lastJob?.status === "error" && lastJob.error_message && (
              <div style={{ color: "var(--neg)", fontSize: 12, marginTop: 10 }}>
                ⚠ {lastJob.error_message}
              </div>
            )}
            {backfill.isError && (
              <div style={{ color: "var(--neg)", fontSize: 12, marginTop: 10 }}>
                {(backfill.error as Error).message}
              </div>
            )}
          </div>
        )}

        {/* ─── Google Ads ─── */}
        <div className="card" style={{ padding: 24, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Google Ads</h2>
            {googleConn ? (
              <span className="tag" style={{ background: "var(--pos-bg)", color: "var(--pos)" }}>conectado</span>
            ) : (
              <span className="tag" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>não conectado</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
            {googleConn
              ? `Customer ID ${googleConn.external_account_id}. Preencha de novo pra rotacionar o refresh token.`
              : "Cole as credenciais OAuth + Developer Token. Ingestão do Google Ads chega na Fase 3 — as credenciais ficam salvas aqui, prontas."}
          </p>

          <form onSubmit={submitGoogle} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Customer ID *</span>
                <input
                  value={gCustomerId}
                  onChange={(e) => setGCustomerId(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="1234567890"
                  required
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Login Customer ID (MCC)</span>
                <input
                  value={gLoginCustomer}
                  onChange={(e) => setGLoginCustomer(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="opcional — ID da MCC gestora"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Nome de exibição (opcional)</span>
              <input
                value={gDisplayName}
                onChange={(e) => setGDisplayName(e.target.value)}
                placeholder="Segredos de Minas — Google"
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Developer Token *{" "}
                <span style={{ color: "var(--ink-4)" }}>(Google Ads → Tools → API Center)</span>
              </span>
              <input
                type="password"
                value={gDevToken}
                onChange={(e) => setGDevToken(e.target.value)}
                placeholder="..."
                required
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>OAuth Client ID *</span>
                <input
                  value={gClientId}
                  onChange={(e) => setGClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  required
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>OAuth Client Secret *</span>
                <input
                  type="password"
                  value={gClientSecret}
                  onChange={(e) => setGClientSecret(e.target.value)}
                  placeholder="..."
                  required
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Refresh Token *{" "}
                <span style={{ color: "var(--ink-4)" }}>(obtido via OAuth playground ou fluxo install)</span>
              </span>
              <input
                type="password"
                value={gRefreshToken}
                onChange={(e) => setGRefreshToken(e.target.value)}
                placeholder="1//..."
                required
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </label>

            {saveGoogle.isError && (
              <div style={{ color: "var(--neg)", fontSize: 12 }}>
                {(saveGoogle.error as Error).message}
              </div>
            )}
            {gJustSaved && (
              <div style={{ color: "var(--pos)", fontSize: 12 }}>✓ Credenciais salvas (criptografadas).</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn" disabled={saveGoogle.isPending}>
                {saveGoogle.isPending ? "Salvando…" : googleConn ? "Atualizar credenciais" : "Conectar Google Ads"}
              </button>
            </div>
          </form>
        </div>

        <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 12, lineHeight: 1.5 }}>
          Metas, taxonomia e integração Google Ads (ingestão real) chegam nas próximas iterações.
          Meta Ads: backfill popula todos os níveis (account · campaign · adset · ad) + breakdowns.
        </p>
      </section>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  outline: "none",
};
