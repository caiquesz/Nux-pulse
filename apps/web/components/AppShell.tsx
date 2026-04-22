"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TweaksPanel, type Theme, type Density, type ChartStyle, type Sidebar as SBState, type Period } from "./TweaksPanel";

function usePersistent<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) setValue(saved as T);
  }, [key]);
  const update = (v: T) => {
    setValue(v);
    if (typeof window !== "undefined") localStorage.setItem(key, v);
  };
  return [value, update];
}

export function AppShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  // Tema fixo em "dark" — versao "light" foi descontinuada.
  const theme: Theme = "dark";
  const [density, setDensity] = usePersistent<Density>("nux-density", "comfortable");
  const [chart, setChart]     = usePersistent<ChartStyle>("nux-chart", "area");
  const [sidebar, setSidebar] = usePersistent<SBState>("nux-sidebar", "expanded");
  const [period, setPeriod]   = usePersistent<Period>("nux-period", "30d");
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-density", density);
    // Limpa eventual preferencia antiga persistida em localStorage
    if (typeof window !== "undefined") localStorage.setItem("nux-theme", "dark");
  }, [density]);

  return (
    <div className="app" data-sidebar={sidebar} data-density={density}>
      <Sidebar
        slug={slug}
        collapsed={sidebar === "collapsed"}
        onToggle={() => setSidebar(sidebar === "expanded" ? "collapsed" : "expanded")}
      />
      <div className="main">
        <Topbar
          slug={slug}
          onOpenTweaks={() => setTweaksOpen(true)}
        />
        <div className="page page-fade">{children}</div>
      </div>
      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        density={density}   onDensity={setDensity}
        chartStyle={chart}  onChart={setChart}
        sidebar={sidebar}   onSidebar={setSidebar}
        period={period}     onPeriod={setPeriod}
      />
    </div>
  );
}
