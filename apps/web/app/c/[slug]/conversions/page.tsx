"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createManualConversion, deleteManualConversion, listManualConversions,
  listTeam, updateManualConversion,
  type ConvKind, type ManualConversion, type ManualConversionCreatePayload,
} from "@/lib/api";

const KIND_CFG: Record<ConvKind, { label: string; plural: string; color: string; icon: string; tone: string }> = {
  purchase: { label: "Venda",    plural: "Vendas",    color: "oklch(0.58 0.13 155)", icon: "🛒", tone: "pos" },
  lead:     { label: "Lead",     plural: "Leads",     color: "oklch(0.52 0.08 235)", icon: "🎯", tone: "info" },
  message:  { label: "Conversa", plural: "Conversas", color: "oklch(0.45 0.14 255)", icon: "💬", tone: "hero" },
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBr(iso: string): string {
  // "2026-04-21" -> "21 abr 2026"
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ConversionsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ConvKind | "all">("all");
  const [editing, setEditing] = useState<ManualConversion | null>(null);
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ["manual-conv", slug, filter],
    queryFn: () => listManualConversions(slug, filter === "all" ? {} : { kind: filter }),
    enabled: !!slug,
  });

  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });

  const createMut = useMutation({
    mutationFn: (body: ManualConversionCreatePayload) => createManualConversion(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-conv"] });
      qc.invalidateQueries({ queryKey: ["meta", "overview"] });
      qc.invalidateQueries({ queryKey: ["meta", "daily"] });
      setCreating(false);
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<ManualConversionCreatePayload> }) =>
      updateManualConversion(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-conv"] });
      qc.invalidateQueries({ queryKey: ["meta", "overview"] });
      qc.invalidateQueries({ queryKey: ["meta", "daily"] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteManualConversion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-conv"] });
      qc.invalidateQueries({ queryKey: ["meta", "overview"] });
      qc.invalidateQueries({ queryKey: ["meta", "daily"] });
    },
  });

  const data = listQ.data ?? [];

  // Totais no topo
  const totals = useMemo(() => {
    const base = { purchase: 0, lead: 0, message: 0, revenue: 0 };
    for (const r of data) {
      base[r.kind as ConvKind] += r.count;
      if (r.kind === "purchase") base.revenue += Number(r.revenue ?? 0);
    }
    return base;
  }, [data]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">14 — CONVERSÕES</div>
          <h1>Conversões manuais</h1>
          <div className="sub">
            Registre vendas/leads/conversas que <strong>não entraram via CAPI ou pixel</strong> —
            entram automaticamente no ROAS e nos custos por conversão.
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => setCreating(true)}>+ Nova conversão</button>
        </div>
      </div>

      {/* Totais */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10, marginTop: 18, marginBottom: 18,
      }}>
        <TotalCard
          label="Vendas" value={totals.purchase} icon="🛒" color={KIND_CFG.purchase.color}
        />
        <TotalCard
          label="Receita manual" value={totals.revenue} icon="💰"
          color={KIND_CFG.purchase.color} isCurrency
        />
        <TotalCard
          label="Leads" value={totals.lead} icon="🎯" color={KIND_CFG.lead.color}
        />
        <TotalCard
          label="Conversas" value={totals.message} icon="💬" color={KIND_CFG.message.color}
        />
      </div>

      {/* Filtro */}
      <div className="seg" style={{ fontSize: 11, marginBottom: 14 }}>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          Todas <span className="mono" style={{ marginLeft: 5, opacity: 0.6 }}>{data.length}</span>
        </button>
        {(["purchase", "lead", "message"] as ConvKind[]).map((k) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {KIND_CFG[k].plural}
          </button>
        ))}
      </div>

      {/* Lista */}
      {listQ.isLoading && (
        <div style={{ color: "var(--ink-3)", fontSize: 13, padding: 14 }}>Carregando…</div>
      )}
      {!listQ.isLoading && data.length === 0 && (
        <EmptyState onCreate={() => setCreating(true)} />
      )}

      {data.length > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th align="right">Qtd</Th>
                <Th align="right">Receita</Th>
                <Th>Campanha / Observação</Th>
                <Th>Registrado por</Th>
                <Th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <RowItem
                  key={r.id}
                  row={r}
                  onEdit={() => setEditing(r)}
                  onDelete={() => {
                    if (confirm(`Excluir este registro de ${KIND_CFG[r.kind as ConvKind].label.toLowerCase()}?`)) {
                      deleteMut.mutate(r.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modais */}
      {creating && (
        <ConversionModal
          team={teamQ.data ?? []}
          onSubmit={(body) => createMut.mutate(body)}
          onCancel={() => setCreating(false)}
          submitting={createMut.isPending}
          error={createMut.error ? (createMut.error as Error).message : null}
        />
      )}
      {editing && (
        <ConversionModal
          team={teamQ.data ?? []}
          initial={editing}
          onSubmit={(patch) => editMut.mutate({ id: editing.id, patch })}
          onCancel={() => setEditing(null)}
          submitting={editMut.isPending}
          error={editMut.error ? (editMut.error as Error).message : null}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Pieces
// ─────────────────────────────────────────────────────────────────────

function TotalCard({ label, value, icon, color, isCurrency }: {
  label: string; value: number; icon: string; color: string; isCurrency?: boolean;
}) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
    }}>
      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
        textTransform: "uppercase", fontWeight: 600, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {isCurrency ? fmtBRL(value) : value.toLocaleString("pt-BR")}
        </span>
        <span style={{ fontSize: 14, opacity: 0.5 }}>{icon}</span>
      </div>
    </div>
  );
}

function Th({ children, align, style }: { children?: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties }) {
  return (
    <th
      className="mono"
      style={{
        fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase",
        color: "var(--ink-3)", fontWeight: 600,
        padding: "10px 14px", textAlign: align ?? "left", whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function RowItem({ row, onEdit, onDelete }: {
  row: ManualConversion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = KIND_CFG[row.kind as ConvKind];
  const [hover, setHover] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderBottom: "1px solid var(--border)",
        background: hover ? "var(--hover)" : "transparent",
        transition: "background .08s",
      }}
    >
      <td style={tdStyle} className="mono">{fmtDateBr(row.date)}</td>
      <td style={tdStyle}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11, padding: "3px 9px", borderRadius: 999,
          background: "var(--surface-2)", color: "var(--ink-2)",
          fontWeight: 500,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
          {cfg.label}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {row.count}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="mono">
        {row.kind === "purchase" && row.revenue ? fmtBRL(Number(row.revenue)) : <span style={{ color: "var(--ink-4)" }}>—</span>}
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: "var(--ink-3)", maxWidth: 300 }}>
        {row.campaign_name ? (
          <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{row.campaign_name}</span>
        ) : null}
        {row.campaign_name && row.notes ? <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span> : null}
        {row.notes ? (
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "inline-block", maxWidth: 220, verticalAlign: "bottom",
          }}>
            {row.notes}
          </span>
        ) : null}
        {!row.campaign_name && !row.notes && <span style={{ color: "var(--ink-4)" }}>—</span>}
      </td>
      <td style={{ ...tdStyle, fontSize: 11, color: "var(--ink-3)" }}>
        {row.created_by_name ?? "—"}
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {hover && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
            <button
              onClick={onEdit} title="Editar"
              style={{
                background: "transparent", border: "none",
                color: "var(--ink-3)", cursor: "pointer", padding: 4,
                borderRadius: 4, lineHeight: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              onClick={onDelete} title="Excluir"
              style={{
                background: "transparent", border: "none",
                color: "var(--ink-4)", cursor: "pointer", padding: 4,
                fontSize: 12, lineHeight: 1,
              }}
            >✕</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      padding: "56px 24px", textAlign: "center",
      border: "1px dashed var(--border-2)", borderRadius: 12,
      background: "var(--surface-2)",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "var(--surface)", color: "var(--ink-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 14px", border: "1px solid var(--border)",
        fontSize: 26,
      }}>
        💸
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
        Nenhuma conversão manual ainda
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 420, margin: "0 auto 18px", lineHeight: 1.5 }}>
        Cadastre aqui vendas offline, leads por WhatsApp ou qualquer conversão que não
        entrou automaticamente via pixel/CAPI. O valor vai compor o ROAS do cliente.
      </div>
      <button className="btn" onClick={onCreate}>+ Registrar primeira conversão</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Modal de criação / edição
// ─────────────────────────────────────────────────────────────────────

function ConversionModal({
  team, initial, onSubmit, onCancel, submitting, error,
}: {
  team: { id: number; name: string }[];
  initial?: ManualConversion;
  onSubmit: (body: Partial<ManualConversionCreatePayload>) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const isEdit = !!initial;
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [kind, setKind] = useState<ConvKind>((initial?.kind as ConvKind) ?? "purchase");
  const [count, setCount] = useState<string>(String(initial?.count ?? 1));
  const [revenue, setRevenue] = useState<string>(initial?.revenue ? String(initial.revenue) : "");
  const [campaignName, setCampaignName] = useState(initial?.campaign_name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [createdById, setCreatedById] = useState<number | "">(initial?.created_by_id ?? "");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(count || 1);
    if (!date || c < 1) return;
    const payload: ManualConversionCreatePayload = {
      date,
      kind,
      count: c,
      revenue: kind === "purchase" && revenue ? Number(revenue) : null,
      campaign_name: campaignName.trim() || null,
      notes: notes.trim() || null,
      created_by_id: createdById === "" ? null : Number(createdById),
    };
    onSubmit(payload);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(10, 10, 8, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "10vh 16px 16px", overflow: "auto",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 520,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "0 24px 56px rgba(0,0,0,0.32)",
        padding: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {isEdit ? "Editar conversão" : "Registrar conversão manual"}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {isEdit ? "altera contagem / receita / observação" : "venda, lead ou conversa fora do pixel"}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "none", color: "var(--ink-4)", fontSize: 16, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}
            aria-label="Fechar"
          >✕</button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          {/* Kind picker */}
          <div>
            <Lbl>Tipo</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {(["purchase", "lead", "message"] as ConvKind[]).map((k) => {
                const cfg = KIND_CFG[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    style={{
                      padding: "10px 12px",
                      border: `1px solid ${active ? cfg.color : "var(--border)"}`,
                      background: active ? `${cfg.color}22` : "var(--surface-2)",
                      color: active ? cfg.color : "var(--ink-2)",
                      borderRadius: 8, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      fontSize: 12, fontWeight: 600,
                      transition: "all .08s",
                    }}
                  >
                    <span>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 10 }}>
            <div>
              <Lbl>Data *</Lbl>
              <input
                ref={firstRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                max={todayISO()}
                style={inputStyle}
              />
            </div>
            <div>
              <Lbl>Quantidade *</Lbl>
              <input
                type="number" min="1" step="1"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
          </div>

          {kind === "purchase" && (
            <div>
              <Lbl>Receita total (R$) <span style={{ color: "var(--ink-4)", fontWeight: 400, letterSpacing: 0 }}>— alimenta ROAS</span></Lbl>
              <input
                type="number" min="0" step="0.01"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="Ex: 350.00"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <Lbl>Campanha (opcional)</Lbl>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: [Cp 01] [Vendas] [Prospecção] — deixe vazio pra contar na conta"
              style={inputStyle}
            />
          </div>

          <div>
            <Lbl>Observação</Lbl>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: venda fechada por WhatsApp após contato direto"
              style={{ ...inputStyle, resize: "vertical", minHeight: 54 }}
            />
          </div>

          {team.length > 0 && (
            <div>
              <Lbl>Registrado por</Lbl>
              <select
                value={createdById === "" ? "" : String(createdById)}
                onChange={(e) => setCreatedById(e.target.value === "" ? "" : Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">— não informado —</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancelar</button>
            <button type="submit" className="btn" disabled={submitting || !date || Number(count) < 1}>
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
      textTransform: "uppercase", marginBottom: 4, fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "11px 14px",
  fontSize: 13,
  color: "var(--ink-2)",
  borderBottom: "none",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  outline: "none",
  width: "100%",
};
