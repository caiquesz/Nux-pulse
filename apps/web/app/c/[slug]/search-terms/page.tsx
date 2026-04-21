"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { listConnections } from "@/lib/api";

export default function SearchTermsPage() {
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
          <div className="meta">07 — SEARCH TERMS</div>
          <h1>Termos de busca</h1>
          <div className="sub">
            Mining de termos reais · oportunidades e negativadas sugeridas
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 48, textAlign: "center", display: "grid", gap: 16, justifyItems: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: "var(--surface-2)", color: "var(--ink-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>🔍</div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>
            {googleConn ? "Aguardando ingestão de search terms" : "Precisa conectar o Google Ads"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 500, marginTop: 8, lineHeight: 1.5 }}>
            Search terms vêm do Google Ads (relatório <code className="mono">search_term_view</code> via GAQL).
            {!googleConn && " Conecte o Google Ads primeiro em Configurações."}
          </p>
        </div>
        {!googleConn && (
          <Link href={`/c/${slug}/settings`}>
            <button className="btn">Configurações →</button>
          </Link>
        )}
        <span className="tag mono" style={{ background: "var(--info-bg)", color: "var(--info)" }}>FASE 4</span>
      </div>
    </>
  );
}
