import { useEffect, useMemo, useState } from "react";
import { useStore } from "./lib/store";
import { useT } from "./lib/i18n";
import { api } from "./lib/api";
import type { Agent } from "./lib/types";
import { Sidebar, type NavDef } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { SettingsPage } from "./pages/SettingsPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { UltraPage } from "./pages/UltraPage";
import { PluginsPage } from "./pages/PluginsPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { HooksPage } from "./pages/HooksPage";
import { MemoryPage } from "./pages/MemoryPage";

type Section = "settings" | "permissions" | "agents" | "ultra" | "sessions" | "plugins" | "skills" | "hooks" | "memory";

export default function App() {
  const { settings, loading, error, toasts, dirty, save, revert, reload, toggleTheme, toggleLang, autoApply } = useStore();
  const t = useT();
  const TITLES: Record<Section, string> = {
    settings: t("Settings", "الإعدادات"),
    permissions: t("Permissions", "الصلاحيات"),
    agents: t("Agents", "الوكلاء"),
    ultra: t("Ultra & Workflow", "الوضع الفائق وسير العمل"),
    sessions: t("Sessions", "الجلسات"),
    plugins: t("Plugins", "الإضافات"),
    skills: t("Skills", "المهارات"),
    hooks: t("Hooks", "المُشغّلات"),
    memory: t("Memory", "الذاكرة"),
  };
  const [section, setSection] = useState<Section>("settings");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => { api.listAgents().then((r) => setAgents(r.agents)).catch(() => {}); }, [section]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty) save().catch(() => {}); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dirty, save]);

  const perms = settings?.permissions ?? {};
  const permCount = (perms.allow?.length ?? 0) + (perms.deny?.length ?? 0) + (perms.ask?.length ?? 0);

  const nav: NavDef[] = [
    { id: "settings", label: TITLES.settings, ico: "⚙" },
    { id: "permissions", label: TITLES.permissions, ico: "⛉", count: permCount },
    { id: "agents", label: TITLES.agents, ico: "◆", count: agents.length },
    { id: "ultra", label: TITLES.ultra, ico: "⚡" },
    { id: "sessions", label: TITLES.sessions, ico: "⧗" },
    { id: "plugins", label: TITLES.plugins, ico: "⧉" },
    { id: "skills", label: TITLES.skills, ico: "✦" },
    { id: "hooks", label: TITLES.hooks, ico: "⚑" },
    { id: "memory", label: TITLES.memory, ico: "❖" },
  ];

  const commands: Command[] = useMemo(() => {
    const go = (s: Section): Command[] => [{ id: "go-" + s, label: t("Go to", "الانتقال إلى") + " " + TITLES[s], ico: "→", run: () => setSection(s) }];
    const base: Command[] = [
      ...go("settings"), ...go("permissions"), ...go("agents"), ...go("ultra"), ...go("sessions"),
      ...go("plugins"), ...go("skills"), ...go("hooks"), ...go("memory"),
      { id: "save", label: t("Save changes", "حفظ التغييرات"), hint: "⌘S", ico: "✓", run: () => dirty && save().catch(() => {}) },
      { id: "revert", label: t("Revert unsaved changes", "التراجع عن التغييرات غير المحفوظة"), ico: "↺", run: revert },
      { id: "reload", label: t("Reload from disk", "إعادة التحميل من القرص"), ico: "⟳", run: () => reload() },
      { id: "theme", label: t("Toggle theme", "تبديل السمة"), ico: "◐", run: toggleTheme },
      { id: "lang", label: t("Switch language · تبديل اللغة", "تبديل اللغة · Switch language"), ico: "⇄", run: toggleLang },
    ];
    const agentCmds: Command[] = agents.map((a) => ({
      id: "agent-" + a.name, label: t("Agent", "وكيل") + ": " + a.name, hint: a.model || "", ico: "◆",
      run: () => setSection("agents"),
    }));
    return [...base, ...agentCmds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, dirty, save, revert, reload, toggleTheme, toggleLang, t]);

  if (loading) return <div className="loading" style={{ marginTop: "40vh" }}>{t("Loading ~/.claude …", "جارٍ تحميل ‎~/.claude …")}</div>;
  if (error)
    return (
      <div className="main-inner" style={{ marginTop: "20vh" }}>
        <div className="warn"><span className="i">⚠</span>{t("Could not reach the backend:", "تعذّر الوصول إلى الخادم:")} {error}. {t("Is", "هل")} <code className="mono">run.sh</code> {t("running on :8787?", "يعمل على المنفذ ‎:8787؟")}</div>
        <button className="btn" onClick={() => reload()}>{t("Retry", "إعادة المحاولة")}</button>
      </div>
    );

  return (
    <div className="app">
      <Sidebar nav={nav} active={section} onNav={(id) => setSection(id as Section)} />
      <TopBar
        section={TITLES[section]}
        scoped={["settings", "permissions", "ultra", "plugins", "hooks"].includes(section)}
        onOpenCmd={() => setCmdOpen(true)}
      />
      <main className="main">
        {section === "settings" && <SettingsPage />}
        {section === "permissions" && <PermissionsPage />}
        {section === "agents" && <AgentsPage />}
        {section === "ultra" && <UltraPage />}
        {section === "sessions" && <SessionsPage />}
        {section === "plugins" && <PluginsPage />}
        {section === "skills" && <SkillsPage />}
        {section === "hooks" && <HooksPage />}
        {section === "memory" && <MemoryPage />}
      </main>

      {cmdOpen && <CommandPalette commands={commands} onClose={() => setCmdOpen(false)} />}

      {dirty && !autoApply && (
        <div className="save-bar">
          <span className="dot" />
          <span style={{ fontSize: 12.5 }}>{t("Unsaved changes to settings.json", "تغييرات غير محفوظة في settings.json")}</span>
          <button className="btn ghost sm" onClick={revert}>{t("Revert", "تراجع")}</button>
          <button className="btn primary sm" onClick={() => save().catch(() => {})}>{t("Save", "حفظ")}</button>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + t.kind}>
            <span>{t.kind === "ok" ? "✓" : t.kind === "err" ? "⚠" : "ℹ"}</span>
            <span style={{ fontSize: 12.5 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
