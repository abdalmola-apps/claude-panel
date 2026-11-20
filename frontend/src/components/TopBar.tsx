import { useStore } from "../lib/store";

export function TopBar({ section, scoped, onOpenCmd }: { section: string; scoped: boolean; onOpenCmd: () => void }) {
  const { dirty, save, revert, reload, theme, toggleTheme, rtl, toggleRtl, autoApply, toggleAutoApply, scopes, scope, setScope } = useStore();
  return (
    <header className="topbar">
      <span className="crumb">
        Claude&nbsp;/&nbsp;<b>{section}</b>
      </span>
      {scoped && scopes.length > 0 && (
        <select
          className="scope-select"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          title="Which settings file these pages read and write"
        >
          {scopes.map((s) => (
            <option key={s.id} value={s.kind === "user" ? "" : s.path}>
              {s.kind === "user" ? "● Global (user)" : "  " + s.label}
            </option>
          ))}
        </select>
      )}
      <div className="spacer" />
      {autoApply ? (
        <span className="auto-pill" title="Auto-apply is ON — edits save to disk automatically, no Save step">
          <span className="dot-on" /> Auto-apply
        </span>
      ) : dirty ? (
        <>
          <button className="btn ghost sm" onClick={revert}>Revert</button>
          <button className="btn primary sm" onClick={() => save().catch(() => {})}>Save changes</button>
        </>
      ) : null}
      <button
        className={"btn ghost sm" + (autoApply ? " auto-on" : "")}
        title={autoApply ? "Auto-apply ON — click to require manual Save" : "Auto-apply OFF — click to save edits automatically"}
        onClick={toggleAutoApply}
      >
        Auto {autoApply ? "●" : "○"}
      </button>
      <button className="btn ghost icon" title="Reload from disk" onClick={() => reload()}>⟳</button>
      <button className="btn ghost icon" title="Toggle direction (LTR/RTL)" onClick={toggleRtl}>
        {rtl ? "RTL" : "LTR"}
      </button>
      <button className="btn ghost icon" title="Toggle theme" onClick={toggleTheme}>
        {theme === "dark" ? "☾" : "☀"}
      </button>
      <button className="btn ghost sm" onClick={onOpenCmd} title="Command palette">
        <span className="kbd">⌘K</span>
      </button>
    </header>
  );
}
