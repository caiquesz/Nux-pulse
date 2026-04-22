"use client";
import { usePathname } from "next/navigation";
import { Icon } from "./icons/Icon";
import { AccountSwitcher } from "./AccountSwitcher";
import { NotificationsBell } from "./NotificationsBell";

const CRUMBS: Record<string, string[]> = {
  overview:      ["DASHBOARDS", "VISÃO GERAL"],
  meta:          ["DASHBOARDS", "META ADS"],
  google:        ["DASHBOARDS", "GOOGLE ADS"],
  funnel:        ["DASHBOARDS", "FUNIL"],
  creatives:     ["ANÁLISE", "CRIATIVOS"],
  audience:      ["ANÁLISE", "AUDIÊNCIA"],
  "search-terms":["ANÁLISE", "SEARCH TERMS"],
  "geo-time":    ["ANÁLISE", "GEO & HORÁRIO"],
  pacing:        ["ANÁLISE", "PACING"],
  alerts:        ["ANÁLISE", "ALERTAS"],
  forecast:      ["ANÁLISE", "FORECAST"],
  project:       ["CLIENTE", "PLANEJAMENTO"],
  conversions:   ["CLIENTE", "CONVERSÕES"],
  reports:       ["CLIENTE", "RELATÓRIOS"],
  settings:      ["CLIENTE", "CONFIGURAÇÕES"],
  "sync-health": ["SISTEMA", "SYNC HEALTH"],
};

type Props = {
  slug: string;
  onOpenTweaks: () => void;
};

export function Topbar({ slug, onOpenTweaks }: Props) {
  const pathname = usePathname();
  const page = pathname.split("/").pop() ?? "overview";
  const crumbs = CRUMBS[page] ?? ["DASHBOARDS", page.toUpperCase()];

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i, arr) => (
          <span key={i} style={{ display: "contents" }}>
            <span className={i === arr.length - 1 ? "cur" : ""}>{c}</span>
            {i < arr.length - 1 && <span className="sep">/</span>}
          </span>
        ))}
      </div>

      <div className="topbar-spacer" />

      <AccountSwitcher currentSlug={slug} />

      <button className="pill">
        <Icon name="search" size={11} />
        <span style={{ color: "var(--ink-4)" }}>Buscar…</span>
        <span className="mono" style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>⌘K</span>
      </button>

      <NotificationsBell />

      <button className="icon-btn" onClick={onOpenTweaks} title="Tweaks">
        <Icon name="sliders" size={14} />
      </button>
    </div>
  );
}
