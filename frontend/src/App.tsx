import { useEffect, useMemo, useState } from "react";
import { useStore } from "./lib/store";
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
const TITLES: Record<Section, string> = {
  settings: "Settings",
  permissions: "Permissions",
  agents: "Agents",
  ultra: "Ultra & Workflow",
  sessions: "Sessions",
  plugins: "Plugins",
  skills: "Skills",
  hooks: "Hooks",
  memory: "Memory",
};

export default function App() {
  const { settings, loading, error, toasts, dirty, save, revert, reload, toggleTheme, toggleRtl, autoApply } = useStore();
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
    { id: "settings", label: "Settings", ico: "⚙" },
    { id: "permissions", label: "Permissions", ico: "⛉", count: permCount },
    { id: "agents", label: "Agents", ico: "◆", count: agents.length },
    { id: "ultra", label: "Ultra & Workflow", ico: "⚡" },
    { id: "sessions", label: "Sessions", ico: "⧗" },
    { id: "plugins", label: "Plugins", ico: "⧉" },
    { id: "skills", label: "Skills", ico: "✦" },
    { id: "hooks", label: "Hooks", ico: "⚑" },
    { id: "memory", label: "Memory", ico: "❖" },
  ];

  const commands: Command[] = useMemo(() => {
    const go = (s: Section): Command[] => [{ id: "go-" + s, label: "Go to " + TITLES[s], ico: "→", run: () => setSection(s) }];
    const base: Command[] = [
      ...go("settings"), ...go("permissions"), ...go("agents"), ...go("ultra"), ...go("sessions"),
      ...go("plugins"), ...go("skills"), ...go("hooks"), ...go("memory"),
      { id: "save", label: "Save changes", hint: "⌘S", ico: "✓", run: () => dirty && save().catch(() => {}) },
      { id: "revert", label: "Revert unsaved changes", ico: "↺", run: revert },
      { id: "reload", label: "Reload from disk", ico: "⟳", run: () => reload() },
      { id: "theme", label: "Toggle theme", ico: "◐", run: toggleTheme },
      { id: "rtl", label: "Toggle direction (LTR / RTL)", ico: "⇄", run: toggleRtl },
    ];
    const agentCmds: Command[] = agents.map((a) => ({
      id: "agent-" + a.name, label: "Agent: " + a.name, hint: a.model || "", ico: "◆",
      run: () => setSection("agents"),
    }));
    return [...base, ...agentCmds];
  }, [agents, dirty, save, revert, reload, toggleTheme, toggleRtl]);

  if (loading) return <div className="loading" style={{ marginTop: "40vh" }}>Loading ~/.claude …</div>;
  if (error)
    return (
      <div className="main-inner" style={{ marginTop: "20vh" }}>
        <div className="warn"><span className="i">⚠</span>Could not reach the backend: {error}. Is <code className="mono">run.sh</code> running on :8787?</div>
        <button className="btn" onClick={() => reload()}>Retry</button>
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
          <span style={{ fontSize: 12.5 }}>Unsaved changes to settings.json</span>
          <button className="btn ghost sm" onClick={revert}>Revert</button>
          <button className="btn primary sm" onClick={() => save().catch(() => {})}>Save</button>
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
