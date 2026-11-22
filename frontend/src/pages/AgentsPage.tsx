import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Agent, Project } from "../lib/types";
import { Chips, Modal, Pager, paginate, Select, useConfirm } from "../components/ui";

const LIST_PAGE = 12;

const blank = (): Agent => ({
  name: "", description: "", tools: ["Read", "Grep", "Glob"], model: "", effort: "", body: "", path: "", source: "user",
});

// ── person presentation (derived, never stored) ─────────────────────────────
const AV_COLORS = [
  "#5b7cfa", "#e0724a", "#3fa796", "#d9a334", "#a07cc5", "#4a9d5b",
  "#c0607c", "#2a9fb5", "#b5852a", "#6d6ff0", "#2f9e7a", "#cf6a4c",
];
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function avatarColor(name: string) { return AV_COLORS[hashStr(name || "?") % AV_COLORS.length]; }
function initials(name: string) {
  const parts = (name || "").split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return (name || "?").slice(0, 2);
}
function humanize(name: string) {
  const h = (name || "").split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return h || name;
}
function roleLine(desc: string) {
  const s = (desc || "").trim();
  if (!s) return "";
  const end = s.search(/[.!?](\s|$)/);
  const first = end > 0 ? s.slice(0, end) : s;
  return first.length > 92 ? first.slice(0, 92) + "…" : first;
}
function shortModel(m: string) { return (m || "").replace(/^claude-/, ""); }

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, background: avatarColor(name),
        color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.4), fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", userSelect: "none",
      }}
    >
      {initials(name)}
    </span>
  );
}

export function AgentsPage() {
  const { meta, toast } = useStore();
  const { confirm, node: confirmNode } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [agentDir, setAgentDir] = useState<string>(""); // "" = global ~/.claude/agents
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [q, setQ] = useState("");
  const [listPage, setListPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (pick?: string) => {
    setLoading(true);
    const r = await api.listAgents(agentDir || undefined);
    setAgents(r.agents);
    setLoading(false);
    if (pick) { const a = r.agents.find((x) => x.name === pick); if (a) { setSel(a.name); setDraft({ ...a }); } }
  };
  useEffect(() => { api.projects().then((r) => setProjects(r.projects)).catch(() => {}); }, []);
  // reload whenever the selected project changes (also covers initial mount)
  useEffect(() => { setSel(null); setDraft(null); setListPage(0); load(); /* eslint-disable-next-line */ }, [agentDir]);

  const open = (a: Agent) => { setSel(a.name); setDraft({ ...a }); };

  const current = agents.find((a) => a.name === sel) || null;
  const dirty = useMemo(() => {
    if (!draft) return false;
    if (!current) return true; // new
    return JSON.stringify({ ...current }) !== JSON.stringify(draft);
  }, [draft, current]);

  const filtered = agents.filter(
    (a) => a.name.includes(q.toLowerCase()) || a.description.toLowerCase().includes(q.toLowerCase())
  );
  const { slice: pageAgents, pageCount: listPages, page: lp } = paginate(filtered, listPage, LIST_PAGE);

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    try {
      const r = await api.saveAgent(draft.name.trim(), draft, agentDir || undefined);
      toast(`${humanize(draft.name)} saved`, "ok");
      await load(r.agent.name);
    } catch (e: any) { toast("Save failed: " + e.message, "err"); }
  };

  const del = async () => {
    if (!current) return;
    if (!(await confirm(`Remove ${humanize(current.name)} from the team? A timestamped backup is written first, so this is recoverable.`, true))) return;
    try {
      await api.deleteAgent(current.name, agentDir || undefined);
      toast(`${humanize(current.name)} removed (backed up)`, "ok");
      setSel(null); setDraft(null);
      await load();
    } catch (e: any) { toast("Delete failed: " + e.message, "err"); }
  };

  const duplicate = () => {
    if (!draft) return;
    setCreating(true);
    setNewName(draft.name + "-copy");
  };

  return (
    <div className="main-inner" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <h1>Agents</h1>
        <p>
          Your team of custom subagents — each one a specialist defined in <code className="mono">.claude/agents/*.md</code>.
          Pick a project to manage its roster; every save is backed up first.
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Project:</span>
        <select className="scope-select" style={{ marginInlineStart: 0 }} value={agentDir} onChange={(e) => setAgentDir(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.isGlobal ? "" : p.agentDir}>
              {(p.isGlobal ? "● " : "  ") + p.label + ` (${p.agentCount})`}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
          {agents.length} teammate{agents.length === 1 ? "" : "s"} in this scope{agentDir ? " · creating here makes .claude/agents/ if missing" : ""}
        </span>
      </div>

      <div className="agent-layout">
        <div className="agent-list">
          <div className="search">
            <input type="text" placeholder="Search the team…" value={q} onChange={(e) => { setQ(e.target.value); setListPage(0); }} />
          </div>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
            <button className="btn sm" style={{ width: "100%" }} onClick={() => { setCreating(true); setNewName(""); }}>+ Add teammate</button>
          </div>
          <div className="items">
            {loading && <div className="loading">Loading…</div>}
            {!loading && pageAgents.length === 0 && (
              <div className="empty-state" style={{ padding: 20, fontSize: 12.5 }}>No teammates here yet.</div>
            )}
            {pageAgents.map((a) => (
              <div
                key={a.name}
                className={"agent-item" + (sel === a.name ? " active" : "")}
                onClick={() => open(a)}
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <Avatar name={a.name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{humanize(a.name)}</span>
                    {a.model && <span className="badge neutral" style={{ fontSize: 10, flexShrink: 0 }}>{shortModel(a.model)}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {roleLine(a.description) || <span className="mono">{a.name}.md</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pager page={lp} pageCount={listPages} onPage={setListPage} />
        </div>

        <div>
          {!draft ? (
            <div className="card">
              <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>Pick a teammate to see their profile</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>or add a new one to the roster</div>
              </div>
            </div>
          ) : (
            <div className="card">
              <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={draft.name || "new"} size={42} />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 17 }}>{humanize(draft.name) || "New teammate"}</h2>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <code className="mono">{draft.name || "new-agent"}.md</code>
                    <span>· {draft.model ? shortModel(draft.model) : "inherits model"}</span>
                    {draft.effort && <span>· {draft.effort} effort</span>}
                    <span>· {draft.tools.length ? `${draft.tools.length} skill${draft.tools.length === 1 ? "" : "s"}` : "all tools"}</span>
                    {current && <span>· {current.source}</span>}
                  </div>
                </div>
                <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
                  {current && <button className="btn ghost sm" onClick={duplicate}>Duplicate</button>}
                  {current && <button className="btn danger sm" onClick={del}>Remove</button>}
                  <button className="btn primary sm" disabled={!dirty || !draft.name.trim()} onClick={save}>Save</button>
                </div>
              </header>
              <div className="body" style={{ padding: 16 }}>
                <div className="field">
                  <label>Role <span style={{ color: "var(--muted)", fontWeight: 400 }}>— what this teammate does & when to bring them in (this is what triggers them; be specific)</span></label>
                  <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Model <span style={{ color: "var(--muted)", fontWeight: 400 }}>— capability tier</span></label>
                    <Select value={draft.model} options={meta?.models ?? []} allowEmpty="(inherit)" onChange={(v) => setDraft({ ...draft, model: v })} />
                  </div>
                  <div className="field">
                    <label>Effort</label>
                    <Select value={draft.effort} options={meta?.efforts ?? []} allowEmpty="(inherit)" onChange={(v) => setDraft({ ...draft, effort: v })} />
                  </div>
                </div>
                <div className="field">
                  <label>Skills <span style={{ color: "var(--muted)", fontWeight: 400 }}>— the tools they&rsquo;re allowed to use</span></label>
                  <Chips
                    values={draft.tools}
                    suggestions={meta?.toolNames ?? []}
                    onRemove={(t) => setDraft({ ...draft, tools: draft.tools.filter((x) => x !== t) })}
                    onAdd={(t) => setDraft({ ...draft, tools: draft.tools.includes(t) ? draft.tools : [...draft.tools, t] })}
                  />
                  <div className="hint">Leave empty to inherit every tool. <code className="mono">*</code> also means all.</div>
                </div>
                <div className="field">
                  <label>Working instructions <span style={{ color: "var(--muted)", fontWeight: 400 }}>— the system prompt that shapes how they work</span></label>
                  <textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} spellCheck={false} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <Modal
          title="Add a teammate"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!/^[a-z0-9][a-z0-9_-]*$/.test(newName)}
                onClick={() => {
                  const base = draft && newName.endsWith("-copy") ? draft : blank();
                  setDraft({ ...base, name: newName, path: "", source: "user" });
                  setSel(null);
                  setCreating(false);
                }}
              >Create</button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <Avatar name={newName || "?"} size={40} />
            <div>
              <div style={{ fontWeight: 600 }}>{newName ? humanize(newName) : "New teammate"}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>their avatar colour comes from the name</div>
            </div>
          </div>
          <div className="field">
            <label>Handle</label>
            <input type="text" className="mono" autoFocus placeholder="my-agent" value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} />
            <div className="hint">Lowercase, digits, <code className="mono">-</code> / <code className="mono">_</code>. Becomes <code className="mono">{newName || "name"}.md</code>. Not saved until you hit Save.</div>
          </div>
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
