import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";

export interface NavDef { id: string; label: string; ico: string; count?: number; }

export function Sidebar({
  nav, active, onNav,
}: {
  nav: NavDef[];
  active: string;
  onNav: (id: string) => void;
}) {
  const { meta } = useStore();
  const t = useT();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">C</span>
        <div>
          {t("Claude Control", "لوحة تحكّم كلود")}
          <small>{meta?.claudeVersion || "…"}</small>
        </div>
      </div>
      {nav.map((n) => (
        <div
          key={n.id}
          className={"nav-item" + (active === n.id ? " active" : "")}
          onClick={() => onNav(n.id)}
        >
          <span className="ico">{n.ico}</span>
          <span>{n.label}</span>
          {n.count !== undefined && <span className="count">{n.count}</span>}
        </div>
      ))}
      <div className="nav-sep" />
      <div style={{ padding: "4px 10px", color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
        {t("Writes", "يكتب في")} <code className="mono">~/.claude</code> {t("directly · every change is backed up first.", "مباشرةً · تُؤخذ نسخة احتياطية قبل كل تغيير.")}
      </div>
    </aside>
  );
}
