"use client";
import { useMemo, useState } from "react";

type Props = {
  value: string | null;           // ISO string ou null
  onChange: (iso: string | null) => void;
};

// Retorna Date arredondado pra um horário específico (hora:minuto)
function atTime(base: Date, h: number, m: number = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=dom, 1=seg…
  const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + daysUntilMon);
  return d;
}

function formatLocal(date: Date): string {
  // "YYYY-MM-DDTHH:MM" — formato aceito por datetime-local
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatReadable(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  let day: string;
  if (diffDays === 0) day = "Hoje";
  else if (diffDays === 1) day = "Amanhã";
  else if (diffDays === -1) day = "Ontem";
  else if (diffDays > 0 && diffDays < 7) {
    day = d.toLocaleDateString("pt-BR", { weekday: "short" });
    day = day.charAt(0).toUpperCase() + day.slice(1).replace(".", "");
  } else {
    day = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  return `${day} · ${time}`;
}

export function DateTimePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const presets = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const mon = nextMonday(now);
    return [
      { label: "Hoje 09:00",   iso: atTime(now, 9).toISOString() },
      { label: "Hoje 14:00",   iso: atTime(now, 14).toISOString() },
      { label: "Amanhã 09:00", iso: atTime(tomorrow, 9).toISOString() },
      { label: "Amanhã 14:00", iso: atTime(tomorrow, 14).toISOString() },
      { label: "Seg 09:00",    iso: atTime(mon, 9).toISOString() },
    ];
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="seg-input"
        style={{
          width: "100%", textAlign: "left",
          padding: "9px 11px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: value ? "var(--ink)" : "var(--ink-4)",
          fontSize: 13,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}
      >
        <span>{value ? formatReadable(value) : "Quando?"}</span>
        <span style={{ color: "var(--ink-4)", fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              zIndex: 41, minWidth: 280,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
              padding: 10,
            }}
          >
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, padding: "0 4px" }}>
              Atalhos
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {presets.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => { onChange(p.iso); setOpen(false); }}
                  style={{
                    textAlign: "left", padding: "7px 10px",
                    background: "transparent", border: "none",
                    color: "var(--ink-2)", fontSize: 13, cursor: "pointer",
                    borderRadius: 5,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, padding: "0 4px" }}>
                Data e hora exatas
              </div>
              <input
                type="datetime-local"
                value={value ? formatLocal(new Date(value)) : ""}
                onChange={(e) => {
                  if (!e.target.value) { onChange(null); return; }
                  // datetime-local dá hora local; convertemos para ISO UTC
                  const local = new Date(e.target.value);
                  onChange(local.toISOString());
                }}
                style={{
                  width: "100%", padding: "8px 10px",
                  borderRadius: 5, border: "1px solid var(--border)",
                  background: "var(--surface-2)", color: "var(--ink)", fontSize: 12,
                  outline: "none",
                }}
              />
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); }}
                  style={{
                    marginTop: 6, background: "transparent", border: "none",
                    color: "var(--neg)", fontSize: 11, cursor: "pointer", padding: "4px 4px",
                  }}
                >
                  Limpar data
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
