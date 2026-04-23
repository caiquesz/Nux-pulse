"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createManualConversion, deleteManualConversion, listManualConversions,
  listTeam, updateManualConversion,
  type ConvKind, type ManualConversion, type ManualConversionCreatePayload,
} from "@/lib/api";

// Cores vibrantes e modernas — verde lima, cobalt electric, citrus
// (mesma paleta accent usada em hero banners e highlights)
const KIND_CFG: Record<ConvKind, {
  label: string;
  plural: string;
  color: string;
  Icon: (props: { size?: number }) => React.JSX.Element;
}> = {
  purchase: {
    label: "Venda", plural: "Vendas",
    color: "oklch(0.68 0.19 150)", // verde vibrante
    Icon: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  lead: {
    label: "Lead", plural: "Leads",
    color: "oklch(0.58 0.22 255)", // cobalt electric
    Icon: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="4" />
        <path d="M3 21v-1a6 6 0 0 1 6-6h0a6 6 0 0 1 6 6v1" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
  message: {
    label: "Conversa", plural: "Conversas",
    color: "oklch(0.72 0.19 55)", // citrus laranja vibrante
    Icon: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
};

// Cor/ícone do card de "Receita manual" (derivado de venda mas com icone próprio)
const REVENUE_ICON = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

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
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10, marginTop: 18, marginBottom: 18,
      }}>
        <TotalCard
          label="Vendas" value={totals.purchase}
          icon={<KIND_CFG.purchase.Icon size={18} />}
          color={KIND_CFG.purchase.color}
        />
        <TotalCard
          label="Receita manual" value={totals.revenue}
          icon={<REVENUE_ICON size={18} />}
          color={KIND_CFG.purchase.color}
          isCurrency
        />
        <TotalCard
          label="Leads" value={totals.lead}
          icon={<KIND_CFG.lead.Icon size={18} />}
          color={KIND_CFG.lead.color}
        />
        <TotalCard
          label="Conversas" value={totals.message}
          icon={<KIND_CFG.message.Icon size={18} />}
          color={KIND_CFG.message.color}
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
          onSubmit={(body) => createMut.mutate(body as ManualConversionCreatePayload)}
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
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  isCurrency?: boolean;
}) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      position: "relative",
    }}>
      {/* Icone no canto superior direito, na cor da métrica */}
      <div style={{
        position: "absolute", top: 12, right: 14,
        color, opacity: 0.9,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>

      <div className="mono" style={{
        fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
        textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
        paddingRight: 28,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {isCurrency ? fmtBRL(value) : value.toLocaleString("pt-BR")}
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
                    <cfg.Icon size={14} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 10 }}>
            <div>
              <Lbl>Data *</Lbl>
              <DateField
                value={date}
                onChange={setDate}
                max={todayISO()}
              />
            </div>
            <div>
              <Lbl>Quantidade *</Lbl>
              <QuantityStepper
                value={Number(count) || 1}
                onChange={(n) => setCount(String(Math.max(1, n)))}
                min={1}
              />
            </div>
          </div>

          {kind === "purchase" && (
            <div>
              <Lbl>Receita total (R$) <span style={{ color: "var(--ink-4)", fontWeight: 400, letterSpacing: 0 }}>— alimenta ROAS</span></Lbl>
              <CurrencyField
                value={revenue}
                onChange={setRevenue}
                placeholder="350,00"
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

// ═════════════════════════════════════════════════════════════════════
//  CUSTOM FIELDS — DateField, QuantityStepper, CurrencyField
//  Substituem os controles nativos do browser por versões alinhadas
//  ao design system (ícones SVG, paleta dark, tipografia consistente).
// ═════════════════════════════════════════════════════════════════════

const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS_SHORT = ["S", "T", "Q", "Q", "S", "S", "D"]; // seg..dom

function parseISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DateField({
  value, onChange, max, min,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string; // ISO
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = parseISO(value) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrap = useRef<HTMLDivElement>(null);

  const current = parseISO(value);
  const maxD = max ? parseISO(max) : null;
  const minD = min ? parseISO(min) : null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Grid de 6 semanas começando na segunda
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const jsDay = first.getDay(); // 0=dom
    const pre = (jsDay + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - pre);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push(d);
    }
    return out;
  }, [cursor]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const label = current
    ? current.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")
    : "Selecionar data";

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          ...inputStyle,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
          background: open ? "var(--surface)" : "var(--surface-2)",
          borderColor: open ? "var(--border-2)" : "var(--border)",
        }}
      >
        <span style={{ color: current ? "var(--ink)" : "var(--ink-4)" }}>{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)" }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 300,
          width: 280,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 16px 36px rgba(0,0,0,0.34)",
          padding: 12,
        }}>
          {/* Header: ← mês ano → */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              style={navBtn}
              aria-label="Mês anterior"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>
              {MONTHS_FULL[cursor.getMonth()]}{" "}
              <span style={{ color: "var(--ink-4)", fontWeight: 400 }} className="mono">
                {cursor.getFullYear()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              style={navBtn}
              aria-label="Próximo mês"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Dias da semana */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS_SHORT.map((d, i) => (
              <div key={i} className="mono" style={{
                fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8, fontWeight: 600,
                textAlign: "center", padding: "4px 0",
              }}>{d}</div>
            ))}
          </div>

          {/* Grid de dias */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = toISO(today) === iso;
              const isSelected = value === iso;
              const disabled = (maxD && d > maxD) || (minD && d < minD);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled || undefined}
                  onClick={() => {
                    if (disabled) return;
                    onChange(iso);
                    setOpen(false);
                  }}
                  style={{
                    height: 30, padding: 0, borderRadius: 5,
                    background: isSelected ? "var(--hero)" : "transparent",
                    color: isSelected ? "#fff"
                      : disabled ? "var(--ink-4)"
                      : inMonth ? (isToday ? "var(--ink)" : "var(--ink-2)") : "var(--ink-4)",
                    border: "none",
                    fontSize: 11, fontWeight: isSelected ? 700 : (isToday ? 700 : 500),
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontVariantNumeric: "tabular-nums",
                    opacity: disabled ? 0.35 : inMonth ? 1 : 0.45,
                    position: "relative",
                    transition: "background .08s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !disabled) e.currentTarget.style.background = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {d.getDate()}
                  {isToday && !isSelected && (
                    <span style={{
                      position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                      width: 3, height: 3, borderRadius: "50%", background: "var(--hero)",
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer: Limpar · Hoje */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
          }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                background: "transparent", border: "none",
                color: "var(--ink-3)", cursor: "pointer", fontSize: 11, padding: "2px 4px",
              }}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => { onChange(toISO(new Date())); setOpen(false); }}
              style={{
                background: "transparent", border: "none",
                color: "var(--hero)", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "2px 4px",
              }}
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--ink-2)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

function QuantityStepper({
  value, onChange, min = 0, max,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const inc = () => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1);
  const dec = () => onChange(Math.max(min, value - 1));

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "36px 1fr 36px",
      border: "1px solid var(--border)", borderRadius: 6,
      background: "var(--surface-2)", overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        style={stepperBtn}
        aria-label="Diminuir"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(n)) onChange(Math.max(min, typeof max === "number" ? Math.min(max, n) : n));
        }}
        style={{
          textAlign: "center", padding: "9px 6px", fontSize: 13, fontWeight: 600,
          fontVariantNumeric: "tabular-nums", color: "var(--ink)",
          background: "transparent", border: "none", outline: "none", width: "100%",
          fontFamily: "var(--font-sans)",
        }}
      />
      <button
        type="button"
        onClick={inc}
        disabled={typeof max === "number" ? value >= max : false}
        style={stepperBtn}
        aria-label="Aumentar"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  background: "transparent", border: "none",
  color: "var(--ink-3)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRight: "1px solid var(--border)",
};

function CurrencyField({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      border: "1px solid var(--border)", borderRadius: 6,
      background: "var(--surface-2)", overflow: "hidden",
    }}>
      <span className="mono" style={{
        padding: "9px 11px", fontSize: 12, color: "var(--ink-3)",
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        letterSpacing: 0.4, fontWeight: 600,
      }}>
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          // aceita "1234.56" ou "1234,56"
          const cleaned = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
          onChange(cleaned);
        }}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "9px 11px",
          background: "transparent", border: "none", outline: "none",
          color: "var(--ink)", fontSize: 13,
          fontFamily: "var(--font-sans)",
          fontVariantNumeric: "tabular-nums",
          width: "100%",
        }}
      />
    </div>
  );
}
