"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { metaAlerts } from "@/lib/api";
import { Icon, type IconName } from "./icons/Icon";

type NavItem = { id: string; label: string; icon: IconName };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { group: "Dashboards", items: [
    { id: "overview", label: "Visão geral", icon: "overview" },
    { id: "meta",     label: "Meta Ads",    icon: "meta" },
    { id: "google",   label: "Google Ads",  icon: "google" },
    { id: "funnel",   label: "Funil",       icon: "funnel" },
  ]},
  { group: "Análise", items: [
    { id: "creatives",    label: "Criativos",    icon: "creatives" },
    { id: "audience",     label: "Audiência",    icon: "audience" },
    { id: "search-terms", label: "Search Terms", icon: "terms" },
    { id: "geo-time",     label: "Geo & Horário",icon: "geo" },
    { id: "pacing",       label: "Pacing",       icon: "pacing" },
    { id: "alerts",       label: "Alertas",      icon: "alerts" },
    { id: "forecast",     label: "Forecast",     icon: "forecast" },
  ]},
  { group: "Cliente", items: [
    { id: "project",     label: "Planejamento", icon: "pacing" },
    { id: "conversions", label: "Conversões",   icon: "funnel" },
    { id: "reports",     label: "Relatórios",   icon: "report" },
    { id: "settings",    label: "Configurações", icon: "gear" },
  ]},
  { group: "Sistema", items: [
    { id: "sync-health", label: "Sync Health", icon: "health" },
  ]},
];

type Props = {
  slug: string;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ slug, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const current = pathname.split("/").pop() ?? "overview";

  // Badge de "Alertas" = número de alertas reais do cliente atual (API).
  // staleTime 60s pra não martelar o endpoint a cada navegação.
  const alertsQ = useQuery({
    queryKey: ["meta-alerts", slug],
    queryFn: () => metaAlerts(slug),
    enabled: !!slug,
    staleTime: 60_000,
  });
  const alertCount = alertsQ.data?.alerts.length ?? 0;
  const badgeFor = (id: string): string | null =>
    id === "alerts" && alertCount > 0 ? String(alertCount) : null;

  return (
    <aside className="sidebar">
      <div
        className="sb-brand"
        style={
          collapsed
            ? {
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "16px 0 14px",
                minHeight: "auto",
              }
            : undefined
        }
      >
        {collapsed ? (
          <>
            {/* Colapsado: só o símbolo ▽ (PNG dedicado, quadrado). */}
            <Image
              src="/nux-mark.png"
              alt="NUX"
              width={28}
              height={28}
              priority
              className="sb-logo-mark"
            />
            <button
              className="icon-btn"
              onClick={onToggle}
              title="Expandir sidebar"
              aria-label="Expandir sidebar"
            >
              <Icon name="sidebar" size={14} />
            </button>
          </>
        ) : (
          <>
            <Image
              src="/nux-wordmark.png"
              alt="NUX"
              width={90}
              height={24}
              priority
              className="sb-logo-wordmark"
            />
            <span className="sb-pulse-tag">Pulse</span>
            <button
              className="icon-btn"
              style={{ marginLeft: "auto" }}
              onClick={onToggle}
              title="Colapsar sidebar"
              aria-label="Colapsar sidebar"
            >
              <Icon name="sidebar" size={14} />
            </button>
          </>
        )}
      </div>

      {/* Área de navegação rola quando o viewport é curto (notebook em 768-900px de
          altura). Brand/foot ficam fixos, só os grupos scrollam. */}
      <div className="sb-scroll">
        {NAV.map((g) => (
          <div key={g.group} className="sb-group">
            {!collapsed && <div className="sb-group-label">{g.group}</div>}
            {g.items.map((it) => {
              const active = current === it.id;
              const badge = badgeFor(it.id);
              return (
                <Link
                  key={it.id}
                  href={`/c/${slug}/${it.id}`}
                  className={`sb-item ${active ? "active" : ""}`}
                  title={collapsed ? it.label : undefined}
                >
                  <span className="sb-ic"><Icon name={it.icon} size={16} /></span>
                  {!collapsed && <span className="sb-label">{it.label}</span>}
                  {!collapsed && badge && <span className="sb-badge dot-warn">{badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-avatar">CD</div>
        {!collapsed && (
          <div className="sb-foot-info">
            <span className="n">Caique Divino</span>
            <span className="r">NUX · Diretor</span>
          </div>
        )}
      </div>
    </aside>
  );
}
