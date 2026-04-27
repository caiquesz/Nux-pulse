"use client";

export type TabItem<T extends string = string> = {
  key: T;
  label: string;
  count?: number;
  hint?: string;
};

export function Tabs<T extends string>({
  items, value, onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        gap: 2,
        borderBottom: "1px solid var(--border)",
        paddingBottom: 0,
      }}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            title={it.hint}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ink)" : "var(--ink-3)",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? "var(--ink)" : "transparent"}`,
              cursor: "pointer",
              transition: "color 150ms ease-out, border-color 150ms ease-out",
              marginBottom: -1,
              fontFamily: "var(--font-sans)",
              display: "inline-flex", alignItems: "center", gap: 7,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--ink-2)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--ink-3)";
            }}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: active ? "var(--ink-3)" : "var(--ink-4)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 500,
                  background: "var(--surface-2)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  letterSpacing: 0.3,
                }}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
