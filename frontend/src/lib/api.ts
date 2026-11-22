import type { Agent, CatalogEntry, CliResult, MemoryGroup, Meta, Project, RunningProc, SandboxStats, SandboxStatus, Scope, Session, Settings, Skill, SystemInfo, Worker } from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const b = await res.json();
      if (b?.detail) msg = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail);
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const H = { "Content-Type": "application/json" };

export const api = {
  meta: () => fetch("/api/meta").then((r) => j<Meta>(r)),
  system: () => fetch("/api/system").then((r) => j<SystemInfo>(r)),

  scopes: () => fetch("/api/scopes").then((r) => j<{ scopes: Scope[] }>(r)),
  getSettings: (path?: string) =>
    fetch("/api/settings" + (path ? `?path=${encodeURIComponent(path)}` : "")).then(
      (r) => j<{ data: Settings; raw: string; path: string; exists?: boolean }>(r)
    ),
  saveSettings: (data: Settings, path?: string) =>
    fetch("/api/settings", { method: "PUT", headers: H, body: JSON.stringify({ data, path }) }).then(
      (r) => j<{ ok: boolean; backup: string | null; path: string }>(r)
    ),
  saveSettingsRaw: (raw: string, path?: string) =>
    fetch("/api/settings", { method: "PUT", headers: H, body: JSON.stringify({ raw, path }) }).then(
      (r) => j<{ ok: boolean; backup: string | null; path: string }>(r)
    ),

  projects: () => fetch("/api/projects").then((r) => j<{ projects: Project[] }>(r)),
  listAgents: (dir?: string) =>
    fetch("/api/agents" + (dir ? `?dir=${encodeURIComponent(dir)}` : "")).then(
      (r) => j<{ agents: Agent[]; dir: string }>(r)
    ),
  saveAgent: (name: string, data: Partial<Agent>, dir?: string) =>
    fetch(`/api/agents/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ ...data, dir }),
    }).then((r) => j<{ ok: boolean; agent: Agent }>(r)),
  deleteAgent: (name: string, dir?: string) =>
    fetch(`/api/agents/${encodeURIComponent(name)}` + (dir ? `?dir=${encodeURIComponent(dir)}` : ""), {
      method: "DELETE",
    }).then((r) => j<{ ok: boolean }>(r)),

  getMemory: () => fetch("/api/memory").then((r) => j<{ groups: MemoryGroup[] }>(r)),
  saveMemory: (path: string, content: string) =>
    fetch("/api/memory", { method: "PUT", headers: H, body: JSON.stringify({ path, content }) }).then(
      (r) => j<{ ok: boolean }>(r)
    ),
  deleteMemory: (path: string) =>
    fetch("/api/memory/delete", { method: "POST", headers: H, body: JSON.stringify({ path }) }).then(
      (r) => j<{ ok: boolean; backup: string | null }>(r)
    ),

  listSkills: () => fetch("/api/skills").then((r) => j<{ skills: Skill[]; dir: string }>(r)),
  deleteSkill: (dir: string) =>
    fetch("/api/skills/delete", { method: "POST", headers: H, body: JSON.stringify({ dir }) }).then(
      (r) => j<{ ok: boolean; backup: string }>(r)
    ),

  backups: () => fetch("/api/backups").then((r) => j<{ backups: any[] }>(r)),

  sessions: (offset = 0, limit = 20) =>
    fetch(`/api/sessions?offset=${offset}&limit=${limit}`).then(
      (r) => j<{ sessions: Session[]; running: RunningProc[]; total: number; offset: number; limit: number; workingTotal: number }>(r)
    ),

  activity: () => fetch("/api/activity").then((r) => j<{ workers: Worker[]; count: number; now: string }>(r)),
  stopSession: (pid: number | string) =>
    fetch("/api/sessions/stop", { method: "POST", headers: H, body: JSON.stringify({ pid }) }).then(
      (r) => j<{ ok: boolean; pid?: number; signal?: string; note?: string }>(r)
    ),

  listWorkflows: (claudeDir?: string) =>
    fetch("/api/workflows" + (claudeDir ? `?claudeDir=${encodeURIComponent(claudeDir)}` : "")).then(
      (r) => j<{ workflows: { name: string; path: string; description: string }[]; dir: string }>(r)
    ),
  saveWorkflow: (name: string, content: string, claudeDir?: string) =>
    fetch("/api/workflows/save", { method: "POST", headers: H, body: JSON.stringify({ name, content, claudeDir }) }).then(
      (r) => j<{ ok: boolean; path: string; backup: string | null }>(r)
    ),

  sandboxStatus: () => fetch("/api/sandbox/status").then((r) => j<SandboxStatus>(r)),
  sandboxStats: () => fetch("/api/sandbox/stats").then((r) => j<SandboxStats>(r)),
  sandboxWorkerStart: (workdir: string) =>
    fetch("/api/sandbox/worker/start", { method: "POST", headers: H, body: JSON.stringify({ workdir }) }).then(
      (r) => j<{ ok: boolean; pid?: number; workdir?: string; log?: string; note?: string; pids?: number[] }>(r)
    ),
  sandboxWorkerStop: () =>
    fetch("/api/sandbox/worker/stop", { method: "POST", headers: H, body: JSON.stringify({}) }).then(
      (r) => j<{ ok: boolean; stopped?: number[]; note?: string }>(r)
    ),

  pluginCatalog: () => fetch("/api/plugins/catalog").then((r) => j<{ catalog: CatalogEntry[] }>(r)),
  installPlugin: (spec: string) =>
    fetch("/api/plugins/install", { method: "POST", headers: H, body: JSON.stringify({ spec }) }).then(
      (r) => j<CliResult>(r)
    ),
  addMarketplace: (source: string) =>
    fetch("/api/marketplaces/add", { method: "POST", headers: H, body: JSON.stringify({ source }) }).then(
      (r) => j<CliResult>(r)
    ),
  uninstallPlugin: (spec: string) =>
    fetch("/api/plugins/uninstall", { method: "POST", headers: H, body: JSON.stringify({ spec }) }).then(
      (r) => j<CliResult>(r)
    ),
  removeMarketplace: (name: string) =>
    fetch("/api/marketplaces/remove", { method: "POST", headers: H, body: JSON.stringify({ name }) }).then(
      (r) => j<CliResult>(r)
    ),

  generateHook: (prompt: string) =>
    fetch("/api/hooks/generate", { method: "POST", headers: H, body: JSON.stringify({ prompt }) }).then(
      (r) => j<{ ok: boolean; reason: string; message: string; code: number | null; hooks: Record<string, any> | null; raw: string; stderr: string }>(r)
    ),
};
