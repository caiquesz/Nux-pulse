"use client";
import { Icon } from "./icons/Icon";

export type Theme = "light" | "dark";
export type Density = "compact" | "comfortable";
export type ChartStyle = "line" | "area" | "bar";
export type Sidebar = "expanded" | "collapsed";
export type Period = "7d" | "30d" | "90d";

type Props = {
  open: boolean;
  onClose: () => void;
  theme: Theme;       onTheme: (v: Theme) => void;
  density: Density;   onDensity: (v: Density) => void;
  chartStyle: ChartStyle; onChart: (v: ChartStyle) => void;
  sidebar: Sidebar;   onSidebar: (v: Sidebar) => void;
  period: Period;     onPeriod: (v: Period) => void;
};

export function TweaksPanel(p: Props) {
  return (
    <div className={`tweaks ${p.open ? "show" : ""}`}>
      <div className="tweaks-head">
        <span className="tweaks-title">Tweaks</span>
        <button className="icon-btn" onClick={p.onClose}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="tweaks-body">
        <Row label="Tema">
          {(["light", "dark"] as const).map((v) => (
            <button key={v} className={p.theme === v ? "on" : ""} onClick={() => p.onTheme(v)}>
              {v === "light" ? "CLARO" : "ESCURO"}
            </button>
          ))}
        </Row>
        <Row label="Densidade">
          {(["comfortable", "compact"] as const).map((v) => (
            <button key={v} className={p.density === v ? "on" : ""} onClick={() => p.onDensity(v)}>
              {v === "comfortable" ? "CONFORT." : "COMPACTA"}
            </button>
          ))}
        </Row>
        <Row label="Estilo de gráfico">
          {(["line", "area", "bar"] as const).map((v) => (
            <button key={v} className={p.chartStyle === v ? "on" : ""} onClick={() => p.onChart(v)}>
              {v.toUpperCase()}
            </button>
          ))}
        </Row>
        <Row label="Sidebar">
          {(["expanded", "collapsed"] as const).map((v) => (
            <button key={v} className={p.sidebar === v ? "on" : ""} onClick={() => p.onSidebar(v)}>
              {v === "expanded" ? "EXPANDIDA" : "COLAPSADA"}
            </button>
          ))}
        </Row>
        <Row label="Período padrão">
          {(["7d", "30d", "90d"] as const).map((v) => (
            <button key={v} className={p.period === v ? "on" : ""} onClick={() => p.onPeriod(v)}>
              {v}
            </button>
          ))}
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tw-row">
      <span className="tw-label">{label}</span>
      <div className="tw-options">{children}</div>
    </div>
  );
}
