import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";

export function TopBar({ section, scoped, onOpenCmd }: { section: string; scoped: boolean; onOpenCmd: () => void }) {
  const { dirty, save, revert, reload, theme, toggleTheme, autoApply, toggleAutoApply, scopes, scope, setScope } = useStore();
  const t = useT();
  return (
    <header className="topbar">
      <span className="crumb">
        {t("Claude", "كلود")}&nbsp;/&nbsp;<b>{section}</b>
      </span>
      {scoped && scopes.length > 0 && (
        <select
          className="scope-select"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          title={t("Which settings file these pages read and write", "ملف الإعدادات الذي تقرأ منه هذه الصفحات وتكتب إليه")}
        >
          {scopes.map((s) => (
            <option key={s.id} value={s.kind === "user" ? "" : s.path}>
              {s.kind === "user" ? "● " + t("Global (user)", "عام (المستخدم)") : "  " + s.label}
            </option>
          ))}
        </select>
      )}
      <div className="spacer" />
      {autoApply ? (
        <span className="auto-pill" title={t("Auto-apply is ON — edits save to disk automatically, no Save step", "التطبيق التلقائي مُفعّل — تُحفظ التعديلات تلقائيًا دون خطوة حفظ")}>
          <span className="dot-on" /> {t("Auto-apply", "تطبيق تلقائي")}
        </span>
      ) : dirty ? (
        <>
          <button className="btn ghost sm" onClick={revert}>{t("Revert", "تراجع")}</button>
          <button className="btn primary sm" onClick={() => save().catch(() => {})}>{t("Save changes", "حفظ التغييرات")}</button>
        </>
      ) : null}
      <button
        className={"btn ghost sm" + (autoApply ? " auto-on" : "")}
        title={autoApply ? t("Auto-apply ON — click to require manual Save", "التطبيق التلقائي مُفعّل — اضغط لطلب الحفظ اليدوي") : t("Auto-apply OFF — click to save edits automatically", "التطبيق التلقائي مُعطّل — اضغط لحفظ التعديلات تلقائيًا")}
        onClick={toggleAutoApply}
      >
        {t("Auto", "تلقائي")} {autoApply ? "●" : "○"}
      </button>
      <button className="btn ghost icon" title={t("Reload from disk", "إعادة التحميل من القرص")} onClick={() => reload()}>⟳</button>
      <button className="btn ghost icon" title={t("Toggle theme", "تبديل السمة")} onClick={toggleTheme}>
        {theme === "dark" ? "☾" : "☀"}
      </button>
      <button className="btn ghost sm" onClick={onOpenCmd} title={t("Command palette", "لوحة الأوامر")}>
        <span className="kbd">⌘K</span>
      </button>
    </header>
  );
}
