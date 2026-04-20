import { Icon, type IconName } from "@/components/icons/Icon";

type Props = {
  sectionNum: string;
  title: string;
  subtitle: string;
  icon: IconName;
  description: string;
  plannedFor: string;
};

export function Placeholder({ sectionNum, title, subtitle, icon, description, plannedFor }: Props) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="meta">{sectionNum}</div>
          <h1>{title}</h1>
          <div className="sub">{subtitle}</div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 48,
          textAlign: "center",
          maxWidth: 640,
          margin: "48px auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 12,
            background: "var(--surface-2)", color: "var(--ink-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name={icon} size={28} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Em construção</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 440 }}>{description}</div>
        </div>
        <span className="tag info mono">{plannedFor}</span>
      </div>
    </>
  );
}
