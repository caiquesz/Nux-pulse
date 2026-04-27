"use client";
import type { Tier } from "@/lib/api";

const TIER_STYLE: Record<Tier, { bg: string; fg: string; border: string; glow?: string; label: string }> = {
  S: { bg: "var(--pos-bg)", fg: "var(--pos)",  border: "var(--pos)",  glow: "0 0 0 3px color-mix(in srgb, var(--pos) 22%, transparent)", label: "Thriving" },
  A: { bg: "var(--pos-bg)", fg: "var(--pos)",  border: "transparent", label: "Healthy" },
  B: { bg: "var(--warn-bg)", fg: "var(--warn)", border: "transparent", label: "Atenção" },
  C: { bg: "var(--warn-bg)", fg: "var(--neg)",  border: "transparent", label: "Em risco" },
  D: { bg: "color-mix(in srgb, var(--neg) 18%, transparent)", fg: "var(--neg)", border: "transparent", label: "Crítico" },
};

export function TierBadge({
  tier, size = "md",
}: { tier: Tier | null; size?: "sm" | "md" | "lg" }) {
  if (!tier) {
    return (
      <span
        className="mono"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: size === "lg" ? 36 : size === "md" ? 24 : 18,
          height: size === "lg" ? 36 : size === "md" ? 24 : 18,
          borderRadius: 6,
          background: "var(--surface-2)",
          color: "var(--ink-4)",
          fontSize: size === "lg" ? 16 : size === "md" ? 12 : 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          border: "1px dashed var(--border)",
        }}
        title="Sem score ainda"
      >
        —
      </span>
    );
  }
  const s = TIER_STYLE[tier];
  return (
    <span
      className="mono"
      title={s.label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size === "lg" ? 36 : size === "md" ? 24 : 18,
        height: size === "lg" ? 36 : size === "md" ? 24 : 18,
        borderRadius: 6,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        boxShadow: s.glow,
        fontSize: size === "lg" ? 16 : size === "md" ? 12 : 10,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {tier}
    </span>
  );
}
