import type { ReactNode } from "react";

export type IconName =
  | "overview" | "meta" | "google" | "funnel" | "creatives" | "audience"
  | "alerts" | "forecast" | "report" | "search" | "filter" | "export"
  | "more" | "sun" | "moon" | "sliders" | "sidebar" | "chevdown" | "check"
  | "close" | "up" | "down" | "arrowup" | "arrowdown" | "calendar" | "play"
  | "plus" | "bell" | "sparkline" | "terms" | "geo" | "pacing" | "gear" | "health";

const PATHS: Record<IconName, ReactNode> = {
  overview: <path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>,
  meta: <><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/></>,
  google: <><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></>,
  funnel: <path d="M3 4h18l-7 9v7l-4-2v-5z"/>,
  creatives: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 5 5 3-3 5 5"/><circle cx="9" cy="9" r="1.5"/></>,
  audience: <><circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 7a3 3 0 010 6M21 20c0-2-1.5-3.5-3-4"/></>,
  alerts: <><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 20a2 2 0 004 0"/></>,
  forecast: <path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>,
  report: <><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></>,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z"/>,
  export: <path d="M12 3v12M7 10l5-5 5 5M5 17v3h14v-3"/>,
  more: <><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>,
  moon: <path d="M20 14A8 8 0 1110 4a7 7 0 0010 10z"/>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h14M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/></>,
  chevdown: <path d="m6 9 6 6 6-6"/>,
  check: <path d="m5 12 5 5L20 7"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  up: <path d="m6 15 6-6 6 6"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  arrowup: <path d="M12 5v14M5 12l7-7 7 7"/>,
  arrowdown: <path d="M12 19V5M5 12l7 7 7-7"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  play: <path d="M7 4l14 8-14 8z"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  bell: <><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 20a2 2 0 004 0"/></>,
  sparkline: <path d="M3 17l5-7 4 3 5-9 4 6"/>,
  terms: <><path d="M4 5h16M4 12h16M4 19h10"/></>,
  geo: <><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 00-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 00-8-8z"/></>,
  pacing: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></>,
  health: <path d="M3 12h4l3-8 4 16 3-8h4"/>,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

export function NuxBars({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes: Record<string, number[]> = { sm: [18, 14, 10, 6, 2.5, 2], md: [22, 17, 12, 7, 3, 3], lg: [32, 24, 17, 10, 4, 4] };
  const s = sizes[size];
  return (
    <div className="sb-bars" style={{ gap: `${s[5]}px` }}>
      <span style={{ width: s[0] + "px", height: s[4] + "px" }} />
      <span style={{ width: s[1] + "px", height: s[4] + "px" }} />
      <span style={{ width: s[2] + "px", height: s[4] + "px" }} />
      <span style={{ width: s[3] + "px", height: s[4] + "px" }} />
    </div>
  );
}
