import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import { Card, Modal } from "../components/ui";
import type { Worker } from "../lib/types";

const PHASE: Record<string, { color: string; ico: string }> = {
  "Implementing": { color: "var(--accent)", ico: "✎" },
  "Running / testing": { color: "#d9a334", ico: "▶" },
  "Exploring": { color: "#3fa796", ico: "⌕" },
  "Researching": { color: "#7c9e5e", ico: "◎" },
  "Delegating": { color: "#a07cc5", ico: "⇅" },
  "Thinking": { color: "var(--muted)", ico: "…" },
  "Idle": { color: "var(--muted)", ico: "⏸" },
};

const STATUS: Record<string, { color: string; label: string }> = {
  working: { color: "#30c070", label: "working" },
  idle: { color: "#d9a334", label: "idle" },
  stale: { color: "var(--muted)", label: "stale" },
};

function dur(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function tok(n: number) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + "k";
  return (n / 1e6).toFixed(2) + "M";
}
function base(path: string) {
  const p = path.replace(/\/+$/, "").split("/");
  return p[p.length - 1] || path;
}

export function ActivityPage() {
  const { toast, meta } = useStore();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stopping, setStopping] = useState<Worker | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { const r = await api.activity(); setWorkers(r.workers); } catch { /* keep last */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const head = workers.find((w) => w.status === "working");

  const doStop = async () => {
    if (!stopping) return;
    setBusy(true);
    try {
      const r = await api.stopSession(stopping.pid);
      toast(`Stop sent to ${base(stopping.project)} (pid ${stopping.pid})${r.note ? " — " + r.note : ""}`, "ok");
      setStopping(null);
      setTimeout(refresh, 900);
    } catch (e: any) {
      toast("Stop failed: " + (e.message || e), "err");
    } finally { setBusy(false); }
  };

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Who&rsquo;s Working <span className="badge neutral" style={{ verticalAlign: "middle" }}>{workers.length}</span></h1>
        <p>
          Every running Claude Code session on this machine, live — each one is a “worker” with its current
          task, derived phase, and recent steps. Refreshes every 4&nbsp;seconds. You can <b>stop</b> a session;
          redirecting a running one from here isn&rsquo;t possible — stop it, or type in its own terminal.
        </p>
      </div>

      {head && (
        <div
          style={{
            display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
            padding: "10px 14px", marginBottom: 14, borderRadius: "var(--radius, 8px)",
            background: "var(--accent-bg, rgba(90,120,255,.08))", border: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "#30c070", fontWeight: 700 }}>▶ Working now</span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span style={{ color: PHASE[head.phase]?.color }}>{head.phase}</span>
          <span style={{ color: "var(--muted)" }}>in</span>
          <code className="mono">{base(head.project)}</code>
          <span style={{ color: "var(--muted)", flexBasis: "100%", height: 0 }} />
          <span style={{ fontSize: 13 }}>{head.currentTask || head.firstTask || "(no task captured)"}</span>
        </div>
      )}

      {loaded && workers.length === 0 && (
        <Card title="No active sessions">
          <div className="empty-state" style={{ padding: 28 }}>
            No Claude Code session is running right now. Start one in any project and it will appear here.
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {workers.map((w) => {
          const pm = PHASE[w.phase] ?? PHASE["Thinking"];
          const sm = STATUS[w.status] ?? STATUS.stale;
          return (
            <div
              key={w.sessionId}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius, 8px)",
                background: "var(--panel)", padding: 14, display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: sm.color, flexShrink: 0, boxShadow: w.status === "working" ? `0 0 0 3px ${sm.color}22` : "none" }} />
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.project}>{base(w.project)}</span>
                <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: pm.color, fontWeight: 600 }}>
                  <span>{pm.ico}</span>{w.phase}
                </span>
              </div>

              <div style={{ fontSize: 13, lineHeight: 1.45, maxHeight: 58, overflow: "hidden" }} title={w.currentTask}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>TASK</span><br />
                {w.currentTask || <span style={{ color: "var(--muted)" }}>{w.firstTask || "(no task captured)"}</span>}
              </div>

              {(w.lastTool || w.lastText) && (
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, maxHeight: 50, overflow: "hidden" }}>
                  <span style={{ fontSize: 11 }}>STEP</span>{" "}
                  {w.lastTool && <code className="mono" style={{ fontSize: 11 }}>{w.lastTool}</code>}{" "}
                  {w.lastText}
                </div>
              )}

              {w.recentTools.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {w.recentTools.slice(-6).map((t, i) => (
                    <span key={i} className="mono" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--panel-2, rgba(127,127,127,.1))", color: "var(--muted)" }}>{t}</span>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--muted)", flexWrap: "wrap", marginTop: "auto", paddingTop: 4 }}>
                {w.model && <span title="model">◆ {w.model.replace(/^claude-/, "")}</span>}
                <span title="context size · output produced">{tok(w.tokensIn)} ctx · {tok(w.tokensOut)} out</span>
                <span title="uptime">◷ {dur(w.uptimeSec)}</span>
                <span title="last activity">· {dur(w.ageSec)} ago</span>
                <span title="pid" className="mono">#{w.pid}</span>
                <button
                  className="btn ghost sm"
                  style={{ marginInlineStart: "auto", color: "var(--deny, #e05555)" }}
                  onClick={() => setStopping(w)}
                >Stop</button>
              </div>
            </div>
          );
        })}
      </div>

      {stopping && (
        <Modal
          title="Stop this session?"
          width={460}
          onClose={() => !busy && setStopping(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setStopping(null)} disabled={busy}>Cancel</button>
              <button className="btn primary" style={{ background: "var(--deny, #e05555)", borderColor: "var(--deny, #e05555)" }} onClick={doStop} disabled={busy}>
                {busy ? "Stopping…" : "Stop (SIGTERM)"}
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Sends <code className="mono">SIGTERM</code> to <b>pid {stopping.pid}</b> — the Claude session in{" "}
            <code className="mono">{tildePath(stopping.project, meta?.paths?.home)}</code>.
            <div className="warn" style={{ marginTop: 10 }}>
              <span className="i">⚠</span> This ends the session. Anything it was mid-way through (unsaved work, a running build) is interrupted. It cannot be undone from here.
            </div>
            {stopping.currentTask && (
              <div style={{ marginTop: 10, color: "var(--muted)" }}>
                It&rsquo;s currently on: <span style={{ color: "var(--text)" }}>{stopping.currentTask}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
