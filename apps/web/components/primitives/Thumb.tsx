type Shape = "portrait" | "square" | "landscape";
const RATIOS: Record<Shape, number> = { portrait: 9 / 16, square: 1, landscape: 16 / 9 };

const VARIANTS = [
  { a: "#EAE7DF", b: "#D4D1C9" },
  { a: "#D4D1C9", b: "#C4C1BB" },
  { a: "#E6E3DC", b: "#BEBBB5" },
];

export function Thumb({ shape = "square", idx = 0 }: { shape?: Shape; idx?: number }) {
  const v = VARIANTS[idx % VARIANTS.length];
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: RATIOS[shape],
        background: `repeating-linear-gradient(135deg, ${v.a} 0 6px, ${v.b} 6px 12px)`,
        border: "1px solid var(--border)",
        borderRadius: 4,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#575451", opacity: 0.7 }}>
        CREATIVE
      </span>
    </div>
  );
}
