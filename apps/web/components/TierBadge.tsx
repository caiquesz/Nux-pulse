"use client";
import type { Tier } from "@/lib/api";

const TIER_STYLE: Record<Tier, { bg: string; fg: string; ring?: string; label: string }> = {
  S: {
    bg: "var(--pos-bg)", fg: "var(--pos)",
    ring: "0 0 0 2px color-mix(in srgb, var(--pos) 28%, transparent)",
    label: "Thriving",
  },
  A: { bg: "var(--pos-bg)", fg: "var(--pos)", label: "Healthy" },
  B: { bg: "var(--warn-bg)", fg: "var(--warn)", label: "Atenção" },
  C: { bg: "var(--warn-bg)", fg: "var(--neg)", label: "Em risco" },
  D: {
    bg: "color-mix(in srgb, var(--neg) 16%, transparent)",
    fg: "var(--neg)",
    label: "Crítico",
  },
};

const SIZES = {
  sm: { box: 18, font: 10 },
  md: { box: 28, font: 13 },
  lg: { box: 40, font: 18 },
} as const;

export function TierBadge({
  tier, size = "md",
}: { tier: Tier | null; size?: keyof typeof SIZES }) {
  const s = SIZES[size];

  if (!tier) {
    return (
      <span
        className="mono"
        title="Sem score"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: s.box, height: s.box, borderRadius: 6,
          background: "var(--surface-2)",
          color: "var(--ink-4)",
          fontSize: s.font, fontWeight: 700, letterSpacing: 0.5,
          border: "1px dashed var(--border)",
        }}
      >
        —
      </span>
    );
  }

  const t = TIER_STYLE[tier];
  return (
    <span
      className="mono"
      title={t.label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: s.box, height: s.box, borderRadius: 6,
        background: t.bg,
        color: t.fg,
        fontSize: s.font, fontWeight: 700, letterSpacing: 0.5,
        boxShadow: t.ring,
      }}
    >
      {tier}
    </span>
  );
}
