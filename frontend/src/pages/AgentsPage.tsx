import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Agent, Project } from "../lib/types";
import { Chips, Modal, Pager, paginate, Select, useConfirm } from "../components/ui";

const LIST_PAGE = 12;

const blank = (): Agent => ({
  name: "", description: "", tools: ["Read", "Grep", "Glob"], model: "", effort: "", body: "", path: "", source: "user",
});

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
      toast(`Agent "${draft.name}" saved`, "ok");
      await load(r.agent.name);
    } catch (e: any) { toast("Save failed: " + e.message, "err"); }
  };

  const del = async () => {
    if (!current) return;
    if (!(await confirm(`Delete agent "${current.name}"? A timestamped backup is written first, so this is recoverable.`, true))) return;
    try {
      await api.deleteAgent(current.name, agentDir || undefined);
      toast(`Agent "${current.name}" deleted (backed up)`, "ok");
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
        <p>Custom subagents in <code className="mono">.claude/agents/*.md</code>. Pick a project to manage its agents; each save is backed up.</p>
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
        <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{agents.length} agent(s) in this scope{agentDir ? " · creating here makes .claude/agents/ if missing" : ""}</span>
      </div>

      <div className="agent-layout">
        <div className="agent-list">
          <div className="search">
            <input type="text" placeholder="Filter agents…" value={q} onChange={(e) => { setQ(e.target.value); setListPage(0); }} />
          </div>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
            <button className="btn sm" style={{ width: "100%" }} onClick={() => { setCreating(true); setNewName(""); }}>+ New agent</button>
          </div>
          <div className="items">
            {loading && <div className="loading">Loading…</div>}
            {pageAgents.map((a) => (
              <div key={a.name} className={"agent-item" + (sel === a.name ? " active" : "")} onClick={() => open(a)}>
                <div className="nm">{a.name} {a.model && <span className="badge neutral">{a.model}</span>}</div>
                <div className="ds">{a.description}</div>
              </div>
            ))}
          </div>
          <Pager page={lp} pageCount={listPages} onPage={setListPage} />
        </div>

        <div>
          {!draft ? (
            <div className="card"><div className="empty-state">Select an agent to edit, or create a new one.</div></div>
          ) : (
            <div className="card">
              <header>
                <h2 className="mono">{draft.name || "new-agent"}.md</h2>
                <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
                  {current && <button className="btn ghost sm" onClick={duplicate}>Duplicate</button>}
                  {current && <button className="btn danger sm" onClick={del}>Delete</button>}
                  <button className="btn primary sm" disabled={!dirty || !draft.name.trim()} onClick={save}>Save</button>
                </div>
              </header>
              <div className="body" style={{ padding: 16 }}>
                <div className="field">
                  <label>Description <span style={{ color: "var(--muted)", fontWeight: 400 }}>— this is what triggers the agent; be specific</span></label>
                  <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Model</label>
                    <Select value={draft.model} options={meta?.models ?? []} allowEmpty="(inherit)" onChange={(v) => setDraft({ ...draft, model: v })} />
                  </div>
                  <div className="field">
                    <label>Effort</label>
                    <Select value={draft.effort} options={meta?.efforts ?? []} allowEmpty="(inherit)" onChange={(v) => setDraft({ ...draft, effort: v })} />
                  </div>
                </div>
                <div className="field">
                  <label>Tools</label>
                  <Chips
                    values={draft.tools}
                    suggestions={meta?.toolNames ?? []}
                    onRemove={(t) => setDraft({ ...draft, tools: draft.tools.filter((x) => x !== t) })}
                    onAdd={(t) => setDraft({ ...draft, tools: draft.tools.includes(t) ? draft.tools : [...draft.tools, t] })}
                  />
                  <div className="hint">Leave empty to inherit all tools. <code className="mono">*</code> also means all.</div>
                </div>
                <div className="field">
                  <label>System prompt (body)</label>
                  <textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} spellCheck={false} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <Modal
          title="New agent"
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
          <div className="field">
            <label>Name</label>
            <input type="text" className="mono" autoFocus placeholder="my-agent" value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} />
            <div className="hint">Lowercase, digits, <code className="mono">-</code> / <code className="mono">_</code>. Becomes <code className="mono">{newName || "name"}.md</code>. Not saved until you hit Save.</div>
          </div>
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
