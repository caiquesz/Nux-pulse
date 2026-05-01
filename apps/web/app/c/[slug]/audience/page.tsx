"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SyncIndicator } from "@/components/SyncIndicator";
import { metaAudience, type BreakdownRow } from "@/lib/api";
import { fmtBRL, fmtIntCompact, fmtPct } from "@/lib/fmt";
import { POLL_MS, useAutoSync } from "@/lib/useAutoSync";

export default function AudiencePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [days, setDays] = useState<number>(30);
  const sync = useAutoSync(slug);

  const q = useQuery({
    queryKey: ["meta-audience", slug, days],
    queryFn: () => metaAudience(slug, { days }),
    enabled: !!slug,
    refetchInterval: POLL_MS,
  });

  const empty = !q.isLoading && (q.data?.by_age.length ?? 0) + (q.data?.by_gender.length ?? 0) === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">06 — AUDIÊNCIA</div>
          <h1>Audiência</h1>
          <div className="sub">Demografia · idade × gênero · {days} dias</div>
        </div>
        <div className="page-head-actions">
          <SyncIndicator
            label={sync.lastSyncLabel}
            status={sync.lastSyncStatus}
            lastDoneAt={sync.lastDoneAt}
          />
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}D</button>
            ))}
          </div>
        </div>
      </div>

      {empty && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
          Dados de audiência aparecem após o próximo <strong>Sincronizar</strong> — o backfill agora inclui breakdowns por idade e gênero.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BreakdownCard title="Por idade" rows={q.data?.by_age ?? []} loading={q.isLoading} />
        <BreakdownCard title="Por gênero" rows={q.data?.by_gender ?? []} loading={q.isLoading} />
      </div>
    </>
  );
}

function BreakdownCard({ title, rows, loading }: { title: string; rows: BreakdownRow[]; loading: boolean }) {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{title}</h2>
      {loading && <div style={{ color: "var(--ink-3)", fontSize: 12 }}>Carregando…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ color: "var(--ink-4)", fontSize: 12 }}>Sem dados.</div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => {
          const pct = total > 0 ? (r.spend / total) * 100 : 0;
          return (
            <div key={r.value}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{r.value}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtBRL(r.spend)} · {fmtIntCompact(r.impressions)} imp · CTR {fmtPct(r.ctr)}
                </span>
              </div>
              <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--hero)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
