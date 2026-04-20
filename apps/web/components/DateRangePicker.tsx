"use client";
import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear,
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

export function DateRangePicker({ value, onChange, placeholder = "Personalizado" }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const fmt = (d: Date) => format(d, "d MMM", { locale: ptBR });
  const label =
    value?.from && value?.to
      ? value.from.getTime() === value.to.getTime()
        ? fmt(value.from)
        : `${fmt(value.from)} — ${fmt(value.to)}`
      : placeholder;

  const apply = (r?: DateRange) => {
    onChange(r);
    setOpen(false);
  };

  const canApply = !!(draft?.from && draft?.to);

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
              onSelect={setDraft}
              numberOfMonths={2}
              locale={ptBR}
              showOutsideDays={false}
              weekStartsOn={0}
              disabled={{ after: today() }}
            />
            <div className="drp-footer">
              <div className="drp-summary">
                {draft?.from && (
                  <span className="mono">
                    {fmt(draft.from)}
                    {draft.to && draft.from.getTime() !== draft.to.getTime() && ` — ${fmt(draft.to)}`}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setDraft(undefined);
                    apply(undefined);
                  }}
                >
                  Limpar
                </button>
                <button
                  className="btn"
                  disabled={!canApply}
                  onClick={() => apply(draft)}
                  style={!canApply ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
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
