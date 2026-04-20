import { Icon } from "../icons/Icon";

export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const positive = value > 0;
  const flat = value === 0;
  const cls = flat ? "flat" : positive ? "pos" : "neg";
  const sign = positive ? "+" : "";
  return (
    <span className={`delta-chip ${cls}`}>
      {!flat && <Icon name={positive ? "arrowup" : "arrowdown"} size={9} />}
      {sign}{value.toFixed(1)}{suffix}
    </span>
  );
}
