export function PlatChip({ plat }: { plat: "meta" | "google" }) {
  return (
    <span className={`plat plat-${plat}`}>
      <span className="plat-bars">
        <span /><span /><span /><span />
      </span>
      {plat === "meta" ? "META" : "GOOGLE"}
    </span>
  );
}
