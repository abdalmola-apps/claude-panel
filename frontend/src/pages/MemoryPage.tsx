import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { MemoryEntry, MemoryGroup } from "../lib/types";
import { Card, Modal, Pager, paginate, Row, useConfirm } from "../components/ui";

const PAGE = 12;
type FlatEntry = { group: MemoryGroup; e: MemoryEntry };

export function MemoryPage() {
  const { toast } = useStore();
  const { confirm, node: confirmNode } = useConfirm();
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"entries" | "index">("entries");
  const [edit, setEdit] = useState<{ path: string; title: string; content: string } | null>(null);

  const load = async () => { setLoading(true); const r = await api.getMemory(); setGroups(r.groups); setLoading(false); };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(0); }, [q]);

  const save = async () => {
    if (!edit) return;
    try { await api.saveMemory(edit.path, edit.content); toast("Memory saved (backed up)", "ok"); setEdit(null); await load(); }
    catch (e: any) { toast("Save failed: " + e.message, "err"); }
  };
  const del = async (path: string, name: string) => {
    if (!(await confirm(`Delete memory “${name}”? Its index line is removed too. A backup is written first, so it’s recoverable.`, true))) return;
    try { await api.deleteMemory(path); toast(`Deleted “${name}” (backed up)`, "ok"); await load(); }
    catch (e: any) { toast("Delete failed: " + e.message, "err"); }
  };

  const t = q.trim().toLowerCase();
  const flat: FlatEntry[] = useMemo(() => {
    const all = groups.flatMap((g) => g.entries.map((e) => ({ group: g, e })));
    return t
      ? all.filter(({ group, e }) =>
          e.name.toLowerCase().includes(t) || e.description.toLowerCase().includes(t) ||
          e.body.toLowerCase().includes(t) || group.project.toLowerCase().includes(t))
      : all;
  }, [groups, t]);

  const { slice, pageCount, page: p } = paginate(flat, page, PAGE);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Memory</h1>
        <p>Persistent facts under <code className="mono">~/.claude/projects/*/memory</code>. Improve (edit) or delete entries — every change is backed up.</p>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === "entries" ? "on" : ""} onClick={() => setTab("entries")}>Entries{loading ? "" : ` (${flat.length})`}</button>
        <button className={tab === "index" ? "on" : ""} onClick={() => setTab("index")}>Index{loading ? "" : ` (${groups.length})`}</button>
      </div>

      {tab === "index" && (
        <Card title="Indexes" sub={`${groups.length} project MEMORY.md file(s)`}>
          {groups.length === 0 && <div className="empty-state">No memory index files.</div>}
          {groups.map((g) => (
            <Row key={g.dir} title={<span className="mono" style={{ fontSize: 12 }}>{g.project}</span>} desc={`${g.entries.length} entr${g.entries.length === 1 ? "y" : "ies"}`}>
              <button className="btn ghost sm" onClick={() => setEdit({ path: g.indexPath, title: "MEMORY.md (index)", content: g.index })}>Edit index</button>
            </Row>
          ))}
        </Card>
      )}

      {tab === "entries" && (
      <>
      <div style={{ margin: "0 0 12px" }}>
        <input type="text" placeholder="Search memory by name, description, body, or project…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 440 }} />
      </div>

      <Card title="Entries" sub={loading ? "…" : `${flat.length}${t ? " match" : ""}`}>
        {loading && <div className="loading">Loading…</div>}
        {!loading && flat.length === 0 && <div className="empty-state">No memory{t ? " matches" : " entries found"}.</div>}
        {slice.map(({ group, e }) => (
          <div className="mem-entry" key={e.path}>
            <div className="h">
              <span className="nm">{e.name}</span>
              {e.type && <span className="badge neutral">{e.type}</span>}
              <span className="mono" style={{ color: "var(--muted)", fontSize: 10.5 }}>{group.project}</span>
              <span style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setEdit({ path: e.path, title: e.file, content: e.body })}>Improve</button>
                <button className="btn danger sm" onClick={() => del(e.path, e.name)}>Delete</button>
              </span>
            </div>
            {e.description && <div className="bd" style={{ color: "var(--muted)" }}>{e.description}</div>}
          </div>
        ))}
        <Pager page={p} pageCount={pageCount} onPage={setPage} total={flat.length} unit="entries" />
      </Card>
      </>
      )}

      {edit && (
        <Modal
          title={edit.title}
          width={640}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary" onClick={save}>Save to disk</button>
            </>
          }
        >
          <div className="warn" style={{ marginBottom: 10 }}><span className="i">ℹ</span>Editing the file body. A timestamped backup is written before saving.</div>
          <textarea rows={16} value={edit.content} spellCheck={false} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
