import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Skill } from "../lib/types";
import { Card, Pager, paginate, useConfirm } from "../components/ui";

const PAGE = 12;

export function SkillsPage() {
  const { toast } = useStore();
  const { confirm, node: confirmNode } = useConfirm();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "user" | "synced">("all");
  const [page, setPage] = useState(0);

  const load = async () => { setLoading(true); try { const r = await api.listSkills(); setSkills(r.skills); } catch { /**/ } setLoading(false); };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(0); }, [q, filter]);

  const del = async (s: Skill) => {
    if (!(await confirm(`Delete skill “${s.name}”? The whole folder is backed up first, so it’s recoverable.`, true))) return;
    try { await api.deleteSkill(s.dir); toast(`Deleted “${s.name}” (backed up)`, "ok"); await load(); }
    catch (e: any) { toast("Delete failed: " + e.message, "err"); }
  };

  const t = q.trim().toLowerCase();
  const shown = useMemo(() => skills.filter((s) =>
    (filter === "all" || s.source === filter) &&
    (!t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t))
  ), [skills, filter, t]);

  const counts = { user: skills.filter((s) => s.source === "user").length, synced: skills.filter((s) => s.source === "synced").length };
  const { slice, pageCount, page: p } = paginate(shown, page, PAGE);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Skills</h1>
        <p>Skills under <code className="mono">~/.claude/skills</code>. {counts.user} user · {counts.synced} synced. Synced skills are managed by sync settings; user skills can be removed here.</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Search skills by name or description…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <div className="seg">
          {(["all", "user", "synced"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      <Card title="Skills" sub={loading ? "…" : `${shown.length} shown`}>
        {loading && <div className="loading">Loading…</div>}
        {!loading && shown.length === 0 && <div className="empty-state">No skills{t ? " match" : ""}.</div>}
        {slice.map((s) => (
          <div className="plug" key={s.path}>
            <div className="meta">
              <div className="nm">{s.name} <span className={"badge " + (s.source === "user" ? "ask" : "neutral")} style={{ marginInlineStart: 6 }}>{s.source}</span></div>
              <div className="src" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 560 }}>{s.description || <span style={{ opacity: 0.6 }}>no description</span>}</div>
            </div>
            {s.source === "user"
              ? <button className="btn danger sm" onClick={() => del(s)}>Delete</button>
              : <span className="badge neutral">managed</span>}
          </div>
        ))}
        <Pager page={p} pageCount={pageCount} onPage={setPage} />
      </Card>
      {confirmNode}
    </div>
  );
}
