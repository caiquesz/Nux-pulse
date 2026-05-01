"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SyncIndicator } from "@/components/SyncIndicator";
import { metaAds, metaAdsets, metaCampaigns } from "@/lib/api";
import { fmtBRL, fmtIntCompact, fmtPct } from "@/lib/fmt";
import { POLL_MS, useAutoSync } from "@/lib/useAutoSync";

type Tab = "campaigns" | "adsets" | "ads";

export default function MetaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [tab, setTab] = useState<Tab>("campaigns");
  const [days, setDays] = useState<number>(30);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [adsetFilter, setAdsetFilter] = useState<string | null>(null);
  const sync = useAutoSync(slug);

  const campaigns = useQuery({
    queryKey: ["meta-campaigns-list", slug, days],
    queryFn: () => metaCampaigns(slug, { days }),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });
  const adsets = useQuery({
    queryKey: ["meta-adsets-list", slug, days, campaignFilter],
    queryFn: () => metaAdsets(slug, { days, campaign_id: campaignFilter ?? undefined }),
    enabled: !!slug && tab === "adsets",
    refetchInterval: POLL_MS,
  });
  const ads = useQuery({
    queryKey: ["meta-ads-list", slug, days, campaignFilter, adsetFilter],
    queryFn: () => metaAds(slug, { days, campaign_id: campaignFilter ?? undefined, adset_id: adsetFilter ?? undefined, limit: 200 }),
    enabled: !!slug && tab === "ads",
    refetchInterval: POLL_MS,
  });

  const subLabel = campaignFilter
    ? `filtrado · ${campaigns.data?.campaigns.find((c) => c.id === campaignFilter)?.name ?? campaignFilter}`
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">02 — META ADS</div>
          <h1>Meta Ads</h1>
          <div className="sub">
            Facebook + Instagram · {days} dias{subLabel ? ` · ${subLabel}` : ""}
          </div>
        </div>
        <div className="page-head-actions">
          <SyncIndicator
            label={sync.lastSyncLabel}
            status={sync.lastSyncStatus}
            lastDoneAt={sync.lastDoneAt}
          />
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
                {d}D
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)", alignItems: "flex-end" }}>
        {(["campaigns", "adsets", "ads"] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: tab === k ? "2px solid var(--ink)" : "2px solid transparent",
              color: tab === k ? "var(--ink)" : "var(--ink-3)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {k === "campaigns" ? "Campanhas" : k === "adsets" ? "Conjuntos" : "Anúncios"}
          </button>
        ))}
        {(campaignFilter || adsetFilter) && (
          <button
            onClick={() => { setCampaignFilter(null); setAdsetFilter(null); }}
            className="btn ghost" style={{ marginLeft: "auto", marginBottom: 4 }}
          >
            Limpar filtros ✕
          </button>
        )}
      </div>

      {tab === "campaigns" && (
        <DataTable
          loading={campaigns.isLoading}
          empty="Nenhuma campanha ingerida ainda — rode Sincronizar."
          headers={["Campanha", "Status", "Budget/dia", "Investido", "Impressões", "Cliques", "CTR", "CPC"]}
          rows={(campaigns.data?.campaigns ?? []).map((c) => ({
            key: c.id,
            cells: [
              <button
                key="n" onClick={() => { setCampaignFilter(c.id); setTab("adsets"); }}
                style={linkStyle} title="Ver conjuntos desta campanha"
              >{c.name}</button>,
              <StatusDot key="s" status={c.effective_status} />,
              fmtBRL(c.daily_budget),
              fmtBRL(c.spend),
              fmtIntCompact(c.impressions),
              fmtIntCompact(c.clicks),
              fmtPct(c.ctr),
              fmtBRL(c.cpc),
            ],
          }))}
        />
      )}

      {tab === "adsets" && (
        <DataTable
          loading={adsets.isLoading}
          empty="Nenhum conjunto encontrado."
          headers={["Conjunto", "Campanha", "Status", "Budget/dia", "Investido", "Impressões", "Cliques", "CTR"]}
          rows={(adsets.data?.adsets ?? []).map((a) => ({
            key: a.id,
            cells: [
              <button
                key="n" onClick={() => { setAdsetFilter(a.id); setTab("ads"); }}
                style={linkStyle} title="Ver anúncios deste conjunto"
              >{a.name}</button>,
              <span key="c" style={{ color: "var(--ink-3)" }}>{a.campaign_name}</span>,
              <StatusDot key="s" status={a.status} />,
              fmtBRL(a.daily_budget),
              fmtBRL(a.spend),
              fmtIntCompact(a.impressions),
              fmtIntCompact(a.clicks),
              fmtPct(a.ctr),
            ],
          }))}
        />
      )}

      {tab === "ads" && (
        <DataTable
          loading={ads.isLoading}
          empty="Nenhum anúncio encontrado."
          headers={["", "Anúncio", "Status", "Investido", "Impressões", "Cliques", "CTR", "CPC"]}
          rows={(ads.data?.ads ?? []).map((a) => ({
            key: a.id,
            cells: [
              a.thumb_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key="t" src={a.thumb_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
              ) : <span key="t" style={{ width: 40, height: 40, display: "block", background: "var(--surface-2)", borderRadius: 6 }} />,
              <div key="n">
                <div>{a.name}</div>
                {a.creative_title && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.creative_title}</div>}
              </div>,
              <StatusDot key="s" status={a.status} />,
              fmtBRL(a.spend),
              fmtIntCompact(a.impressions),
              fmtIntCompact(a.clicks),
              fmtPct(a.ctr),
              fmtBRL(a.cpc),
            ],
          }))}
        />
      )}
    </>
  );
}

const linkStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "var(--ink)",
  textAlign: "left", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline",
  textDecorationColor: "var(--border)", textUnderlineOffset: 3,
};

function StatusDot({ status }: { status: string | null }) {
  const up = (status ?? "").toUpperCase();
  const cls = up === "ACTIVE" ? "on" : up.includes("PAUSED") ? "off" : status ? "warn" : "off";
  const color = cls === "on" ? "var(--pos)" : cls === "warn" ? "var(--warn)" : "var(--ink-4)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{up || "—"}</span>
    </span>
  );
}

function DataTable({ loading, empty, headers, rows }: {
  loading: boolean; empty: string;
  headers: string[]; rows: { key: string; cells: React.ReactNode[] }[];
}) {
  return (
    <div className="card tight" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "10px 12px", textAlign: i > 1 ? "right" : "left", color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
              {r.cells.map((c, i) => (
                <td key={i} style={{ padding: "10px 12px", textAlign: i > 1 ? "right" : "left", fontVariantNumeric: i > 1 ? "tabular-nums" : undefined, verticalAlign: "middle" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={headers.length} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>{empty}</td></tr>
          )}
          {loading && (
            <tr><td colSpan={headers.length} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Carregando…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
