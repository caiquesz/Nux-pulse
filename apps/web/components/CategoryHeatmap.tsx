"use client";
import type { PortfolioByCategory } from "@/lib/api";

/**
 * Heatmap nicho x categoria — pattern Tableau / Linear analytics.
 * Cells coloridas pelo score; permite ver onde cada nicho e forte/fraco.
 */
export function CategoryHeatmap({ data }: { data: PortfolioByCategory }) {
  const { categories, niches } = data;

  if (categories.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>
        Sem categorias scoreadas ainda — rode o cron de scoring primeiro.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "12px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
        fontSize: 11, color: "var(--ink-3)",
      }}>
        <strong style={{ color: "var(--ink-2)" }}>Score por categoria × nicho</strong>
        <span style={{ marginLeft: 10, color: "var(--ink-4)" }}>
          0-100 · cell colorida pelo score (verde alto · vermelho baixo)
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%", borderCollapse: "collapse",
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              <th className="mono" style={{
                padding: "10px 14px", textAlign: "left",
                fontSize: 9, color: "var(--ink-4)",
                letterSpacing: 0.6, textTransform: "uppercase",
                fontWeight: 600, borderBottom: "1px solid var(--border)",
                position: "sticky", left: 0, background: "var(--surface)",
                zIndex: 2, minWidth: 200,
              }}>
                Categoria
              </th>
              <th className="mono" style={{
                ...thStyle, textAlign: "right", minWidth: 70,
              }}>
                Peso
              </th>
              <th className="mono" style={{
                ...thStyle, textAlign: "right", minWidth: 70,
              }}>
                Geral
              </th>
              {niches.map((n) => (
                <th key={n.code} className="mono" style={{
                  ...thStyle, textAlign: "right", minWidth: 90,
                }} title={`${n.n_clients} cliente${n.n_clients > 1 ? "s" : ""}`}>
                  {shortName(n.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr
                key={cat.code}
                style={{
                  borderBottom: "1px solid var(--border)",
                  transition: "background 120ms ease-out",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <td style={{
                  padding: "12px 14px",
                  position: "sticky", left: 0, background: "inherit",
                  zIndex: 1,
                }}>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{cat.name}</div>
                  {cat.description && (
                    <div style={{
                      fontSize: 10, color: "var(--ink-4)", marginTop: 2,
                      maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }} title={cat.description}>
                      {cat.description}
                    </div>
                  )}
                </td>
                <td className="mono" style={{
                  padding: "12px 14px", textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink-3)", fontSize: 12,
                }}>
                  {(cat.weight * 100).toFixed(0)}%
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <ScoreCell value={cat.avg_overall} bold />
                </td>
                {niches.map((n) => {
                  const score = cat.by_niche[n.code];
                  return (
                    <td key={n.code} style={{ padding: "8px 6px", textAlign: "right" }}>
                      <ScoreCell value={score ?? null} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={{
        padding: "10px 18px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
        display: "flex", alignItems: "center", gap: 14,
        fontSize: 10, color: "var(--ink-4)",
      }} className="mono">
        <span style={{ letterSpacing: 0.5, textTransform: "uppercase" }}>Escala</span>
        {[0, 25, 50, 75, 100].map((v) => (
          <span key={v} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 22, height: 14, borderRadius: 3,
              background: scoreColor(v),
            }} />
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreCell({ value, bold }: { value: number | null; bold?: boolean }) {
  if (value === null) {
    return (
      <span style={{
        display: "inline-block",
        width: 56, padding: "5px 0", textAlign: "center",
        background: "var(--surface-3)",
        color: "var(--ink-4)",
        borderRadius: 4,
        fontSize: 11,
      }}>
        —
      </span>
    );
  }

  const bg = scoreColor(value);
  return (
    <span
      className="mono"
      style={{
        display: "inline-block",
        width: 56, padding: "5px 0", textAlign: "center",
        background: bg,
        color: scoreTextColor(value),
        borderRadius: 4,
        fontSize: 12,
        fontWeight: bold ? 700 : 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </span>
  );
}

/**
 * Score 0-100 -> cor OKLCH percorrendo do vermelho saturado (0)
 * passando por amarelo (50) ate verde saturado (100).
 */
function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  // hue: 25 (red) -> 90 (yellow) -> 145 (green)
  const hue = 25 + (s / 100) * 120;
  const chroma = 0.13;
  const lightness = 0.32 + (s / 100) * 0.08;
  return `oklch(${lightness} ${chroma} ${hue})`;
}

function scoreTextColor(score: number): string {
  // mantem branco em todas — fundo escuro o suficiente
  return "oklch(0.96 0.01 200)";
  void score;
}

function shortName(name: string): string {
  // "E-commerce — Alimentos & Bebidas" -> "Alim. & Bebidas"
  // "Imobiliária" -> "Imobiliária"
  return name
    .replace(/^E-commerce\s*[—-]\s*/i, "")
    .replace(/&/g, "&");
}

const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 9, color: "var(--ink-4)",
  letterSpacing: 0.6, textTransform: "uppercase",
  fontWeight: 600, borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
