"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { metaCreatives } from "@/lib/api";
import { fmtBRL, fmtIntCompact, fmtPct } from "@/lib/fmt";

export default function CreativesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);
  const [filter, setFilter] = useState<"all" | "with-spend">("with-spend");

  const q = useQuery({
    queryKey: ["meta-creatives", slug, days],
    queryFn: () => metaCreatives(slug, { days, limit: 120 }),
    enabled: !!slug,
  });

  const creatives = (q.data?.creatives ?? []).filter((c) =>
    filter === "all" ? true : c.spend > 0
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">05 — CRIATIVOS</div>
          <h1>Biblioteca de criativos</h1>
          <div className="sub">
            {q.isLoading ? "Carregando…" : `${creatives.length} criativo(s) · ${days} dias`}
          </div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
          <div className="seg">
            <button className={filter === "with-spend" ? "on" : ""} onClick={() => setFilter("with-spend")}>
              Com gasto
            </button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
              Todos
            </button>
          </div>
        </div>
      </div>

      {q.isError && (
        <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)" }}>
          Erro ao carregar criativos.
        </div>
      )}

      {!q.isLoading && creatives.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          {filter === "with-spend" ? "Nenhum criativo teve gasto no período." : "Nenhum criativo ingerido ainda."}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {creatives.map((c) => (
          <div key={c.id} className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-2)" }}>
              {c.thumb_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.thumb_url} alt={c.name ?? ""}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 11 }}>
                  sem thumb
                </div>
              )}
              {c.creative_type && (
                <span className="tag mono" style={{
                  position: "absolute", top: 8, right: 8,
                  background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10,
                }}>{c.creative_type}</span>
              )}
            </div>

            <div style={{ padding: 12, display: "grid", gap: 8 }}>
              <div
                title={c.title ?? c.name ?? undefined}
                style={{
                  fontSize: 12, fontWeight: 600, lineHeight: 1.3,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {c.title || c.name || "sem título"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                <Metric label="Gasto" value={fmtBRL(c.spend)} />
                <Metric label="Impr." value={fmtIntCompact(c.impressions)} />
                <Metric label="Cliques" value={fmtIntCompact(c.clicks)} />
                <Metric label="CTR" value={fmtPct(c.ctr)} />
              </div>

              <div style={{ fontSize: 10, color: "var(--ink-4)", borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span>{c.ads_using} ad{c.ads_using !== 1 ? "s" : ""}</span>
                <span>CPC {fmtBRL(c.cpc)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--ink-4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
