import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { RunningProc, Session } from "../lib/types";
import { Card, Pager } from "../components/ui";

const PAGE = 20;

function ago(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
function uptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [running, setRunning] = useState<RunningProc[]>([]);
  const [total, setTotal] = useState(0);
  const [workingTotal, setWorkingTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);

  const load = async (p = page) => {
    try {
      const r = await api.sessions(p * PAGE, PAGE);
      setSessions(r.sessions);
      setRunning(r.running);
      setTotal(r.total);
      setWorkingTotal(r.workingTotal);
    } catch { /* transient */ }
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(page); /* eslint-disable-next-line */ }, [page]);
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (auto) timer.current = window.setInterval(() => load(page), 7000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line
  }, [auto, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const t = q.trim().toLowerCase();
  // search filters the current page; clear paging intent is server-side otherwise
  const filtered = t
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(t) ||
        s.project.toLowerCase().includes(t) ||
        s.projectDir.toLowerCase().includes(t) ||
        s.id.toLowerCase().includes(t))
    : sessions;

  return (
    <div className="main-inner" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <h1>Sessions</h1>
        <p>Claude Code sessions from <code className="mono">~/.claude/projects</code>. {total} total · {workingTotal} active now · {running.length} process(es) running.</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <input type="text" placeholder="Search this page by prompt, project, or id…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 400 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12, userSelect: "none", cursor: "pointer" }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: "auto" }} /> auto-refresh
        </label>
        <button className="btn ghost sm" onClick={() => load(page)}>⟳ Refresh</button>
      </div>

      {running.length > 0 && (
        <Card title="Running now" sub="processes matching “claude”">
          {running.map((p) => (
            <div className="plug" key={String(p.pid)}>
              <div className="meta">
                <div className="nm">pid {p.pid} · up {uptime(p.uptimeSec)}</div>
                <div className="src mono">{p.cwd || "(cwd unknown)"}</div>
              </div>
              <span className="badge allow">● live</span>
            </div>
          ))}
        </Card>
      )}

      <div className="card">
        <header><h2>Recent sessions</h2><span className="sub">newest first{t ? ` · ${filtered.length} match on this page` : ""}</span></header>
        <div className="body" style={{ padding: 0 }}>
          {loading && <div className="loading">Loading…</div>}
          {!loading && filtered.length === 0 && <div className="empty-state">No sessions{t ? " match your search on this page" : ""}.</div>}
          {filtered.map((s) => (
            <div key={s.path} className="row" style={{ padding: "11px 16px", gap: 12 }}>
              <div style={{ width: 70, flexShrink: 0 }}>
                {s.working ? <span className="badge allow">● working</span>
                  : s.live ? <span className="badge ask">live</span>
                  : <span className="badge neutral">idle</span>}
              </div>
              <div className="label" style={{ minWidth: 0 }}>
                <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                <div className="d mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.project} · <span style={{ opacity: 0.7 }}>{s.id.slice(0, 8)}</span>
                </div>
              </div>
              <div className="control" style={{ gap: 14, color: "var(--muted)", fontSize: 11.5, flexShrink: 0 }}>
                <span title="events">{s.events >= 0 ? `${s.events} ev` : kb(s.size)}</span>
                <span style={{ width: 66, textAlign: "end" }}>{ago(s.ageSec)}</span>
              </div>
            </div>
          ))}
        </div>
        <Pager page={page} pageCount={pageCount} onPage={setPage} total={total} unit="sessions" />
      </div>
    </div>
  );
}
