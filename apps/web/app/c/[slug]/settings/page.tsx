"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  createMetaConnection,
  listConnections,
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

  const [adAccount, setAdAccount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: MetaConnectionPayload) => createMetaConnection(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", slug] });
      setJustSaved(true);
      setToken(""); // nunca mais mostra o token
      setTimeout(() => setJustSaved(false), 3000);
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

        <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 12, lineHeight: 1.5 }}>
          Google Ads, metas e taxonomia vêm nas próximas fases. Enquanto isso, depois de conectar a Meta,
          chame <code className="mono">POST /api/sync/meta/{slug}/backfill</code> pra popular 30 dias de dados.
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
