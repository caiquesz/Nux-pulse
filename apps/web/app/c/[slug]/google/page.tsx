"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { listConnections } from "@/lib/api";

export default function GooglePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const q = useQuery({
    queryKey: ["connections", slug],
    queryFn: () => listConnections(slug),
    enabled: !!slug,
  });
  const googleConn = q.data?.find((c) => c.platform === "google");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">03 — GOOGLE ADS</div>
          <h1>Google Ads</h1>
          <div className="sub">Search · Display · PMax · Shopping · Demand Gen</div>
        </div>
      </div>

      {!googleConn ? (
        <div className="card" style={{ padding: 48, textAlign: "center", display: "grid", gap: 16, justifyItems: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: "var(--surface-2)", color: "var(--ink-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28,
          }}>🔌</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Google Ads ainda não conectado</h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 500, marginTop: 8, lineHeight: 1.5 }}>
              Pra ver campanhas do Google Ads aqui, você precisa de: <strong>Developer Token</strong> (via MCC),
              <strong> Customer ID</strong> da conta e um <strong>OAuth Refresh Token</strong>.
            </p>
          </div>
          <Link href={`/c/${slug}/settings`}>
            <button className="btn">Conectar Google Ads →</button>
          </Link>
          <span className="tag mono" style={{ marginTop: 8, background: "var(--info-bg)", color: "var(--info)" }}>FASE 3 · ingestão em stub</span>
        </div>
      ) : (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
            Conta conectada ({googleConn.external_account_id})
          </h2>
          <p style={{ fontSize: 13, marginTop: 8, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
            A ingestão de Google Ads ainda não está implementada neste deploy. Campanhas, métricas e Quality Score
            aparecem aqui quando o ingest entrar em produção (Fase 3).
          </p>
        </div>
      )}
    </>
  );
}
