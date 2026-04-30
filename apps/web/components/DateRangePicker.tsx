"use client";
import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear,
  differenceInCalendarDays,
} from "date-fns";
import "react-day-picker/dist/style.css";

import { Icon } from "./icons/Icon";

type Props = {
  value: DateRange | undefined;
  onChange: (r: DateRange | undefined) => void;
  placeholder?: string;
};

type Preset = { label: string; build: () => DateRange };

const today = () => new Date();
const PRESETS: Preset[] = [
  { label: "Hoje",            build: () => ({ from: today(), to: today() }) },
  { label: "Ontem",           build: () => ({ from: subDays(today(), 1), to: subDays(today(), 1) }) },
  { label: "Últimos 7 dias",  build: () => ({ from: subDays(today(), 6), to: today() }) },
  { label: "Últimos 14 dias", build: () => ({ from: subDays(today(), 13), to: today() }) },
  { label: "Últimos 30 dias", build: () => ({ from: subDays(today(), 29), to: today() }) },
  { label: "Últimos 90 dias", build: () => ({ from: subDays(today(), 89), to: today() }) },
  { label: "Este mês",        build: () => ({ from: startOfMonth(today()), to: today() }) },
  { label: "Mês passado",     build: () => ({
      from: startOfMonth(subMonths(today(), 1)),
      to: endOfMonth(subMonths(today(), 1)),
    }) },
  { label: "Este ano",        build: () => ({ from: startOfYear(today()), to: today() }) },
];

const sameDay = (a?: Date, b?: Date) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const rangesEqual = (a?: DateRange, b?: DateRange) =>
  sameDay(a?.from, b?.from) && sameDay(a?.to, b?.to);

export function DateRangePicker({ value, onChange, placeholder = "Personalizado" }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const ref = useRef<HTMLDivElement>(null);
  // Marca se o usuario interagiu manualmente. Usado pra decidir se faz
  // auto-apply quando o range fica completo (evita auto-apply do useEffect
  // que sincroniza draft com value).
  const interactedRef = useRef(false);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Auto-apply: quando draft tem range MULTI-DIA completo (from !== to),
  // aplica e fecha automaticamente. Single-day requer clicar "Aplicar"
  // explicitamente — necessario porque a lib seta from=to no primeiro
  // click, e auto-apply imediato roubaria a chance de selecionar o fim.
  useEffect(() => {
    if (!open || !interactedRef.current) return;
    if (!draft?.from || !draft?.to) return;
    if (sameDay(draft.from, draft.to)) return; // 1-dia: aguarda Aplicar
    if (rangesEqual(draft, value)) return;
    const id = setTimeout(() => {
      onChange(draft);
      setOpen(false);
      interactedRef.current = false;
    }, 180);
    return () => clearTimeout(id);
  }, [draft, value, open, onChange]);

  const handleSelect = (r: DateRange | undefined) => {
    interactedRef.current = true;
    setDraft(r);
  };

  const fmt = (d: Date) => format(d, "d MMM", { locale: ptBR });
  const label =
    value?.from && value?.to
      ? sameDay(value.from, value.to)
        ? fmt(value.from)
        : `${fmt(value.from)} — ${fmt(value.to)}`
      : placeholder;

  const apply = (r?: DateRange) => {
    interactedRef.current = false;
    onChange(r);
    setOpen(false);
  };

  // Estado da seleção: "vazia" / "início definido, aguardando fim" / "completa"
  const state: "empty" | "partial" | "complete" =
    !draft?.from ? "empty" : !draft?.to ? "partial" : "complete";

  const dayCount =
    draft?.from && draft?.to
      ? differenceInCalendarDays(draft.to, draft.from) + 1
      : 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className={`pill ${value?.from && value?.to ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="calendar" size={12} />
        <span>{label}</span>
        <Icon name="chevdown" size={10} />
      </button>
      {open && (
        <div className="drp-popover">
          <div className="drp-presets">
            <div className="drp-presets-label">Atalhos</div>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="drp-preset"
                onClick={() => apply(p.build())}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="drp-calendar">
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={2}
              locale={ptBR}
              showOutsideDays={false}
              weekStartsOn={0}
              disabled={{ after: today() }}
            />
            <div className="drp-footer">
              <div className="drp-summary">
                {state === "empty" && (
                  <span style={{ color: "var(--ink-4)", fontSize: 11 }}>
                    Clique para selecionar a data inicial
                  </span>
                )}
                {state === "partial" && draft?.from && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="mono">{fmt(draft.from)}</span>
                    <span style={{ color: "var(--ink-4)", fontSize: 11 }}>
                      → selecione a data final
                    </span>
                  </span>
                )}
                {state === "complete" && draft?.from && draft?.to && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="mono">
                      {sameDay(draft.from, draft.to)
                        ? fmt(draft.from)
                        : `${fmt(draft.from)} — ${fmt(draft.to)}`}
                    </span>
                    <span className="mono" style={{ color: "var(--ink-4)", fontSize: 10 }}>
                      {dayCount} {dayCount === 1 ? "dia" : "dias"}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn ghost"
                  onClick={() => {
                    interactedRef.current = false;
                    setDraft(undefined);
                    apply(undefined);
                  }}
                >
                  Limpar
                </button>
                <button
                  className="btn"
                  disabled={state !== "complete"}
                  onClick={() => apply(draft)}
                  style={state !== "complete" ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
