import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import { Card, Modal } from "../components/ui";
import type { SessionAgent, Worker } from "../lib/types";
import type { GridSeat } from "../components/OfficeView";

const OfficeView = lazy(() => import("../components/OfficeView").then((m) => ({ default: m.OfficeView })));

const AGENT_STATUS: Record<string, { c: number; hex: string; icon: string; label: string }> = {
  working: { c: 0x30c070, hex: "#30c070", icon: "▶", label: "working now" },
  waiting: { c: 0xd9a334, hex: "#d9a334", icon: "⏳", label: "waiting" },
  hold: { c: 0x8a93a0, hex: "#8a93a0", icon: "⏸", label: "on hold" },
};

const COLOR_NAME: Record<string, string> = {
  blue: "#6e79d6", green: "#3fb950", orange: "#d29922", yellow: "#d29922", teal: "#2bb3a3",
  cyan: "#2bb3a3", purple: "#a07cc5", magenta: "#c678cc", red: "#f05c5c", pink: "#e06ba8",
};
const PALETTE = ["#6e79d6", "#3fb950", "#d29922", "#2bb3a3", "#a07cc5", "#e06ba8", "#4aa3df", "#e0894a"];
function agentColor(c: string, type: string) {
  if (c && COLOR_NAME[c]) return COLOR_NAME[c];
  let h = 0; for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(t: string) {
  const parts = t.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase() || "A";
}

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [agents, setAgents] = useState<SessionAgent[] | null>(null);
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

  // load the session's agent roster while the detail modal is open
  useEffect(() => {
    if (!detailId) { setAgents(null); return; }
    let alive = true;
    const load = () => api.sessionAgents(detailId).then((r) => { if (alive) setAgents(r.agents); }).catch(() => {});
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [detailId]);

  const head = workers.find((w) => w.status === "working");
  const detail = detailId ? workers.find((w) => w.sessionId === detailId) : null;

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

  const seats: GridSeat[] = (agents || []).map((a) => {
    const s = AGENT_STATUS[a.status] || AGENT_STATUS.hold;
    return { key: a.type, line1: `${s.icon} ${a.type}`, line2: `${a.count} task${a.count > 1 ? "s" : ""} · ${s.label}`, colorHex: s.c };
  });

  return (
    <div className="main-inner">
      {!detail && (<>
      <div className="page-head">
        <h1>Who&rsquo;s Working <span className="badge neutral" style={{ verticalAlign: "middle" }}>{workers.length}</span></h1>
        <p>
          Every running Claude Code session on this machine, live — each one is a “worker” with its current
          task, derived phase, and recent steps. <b>Click a session</b> for full details — which sub-agent is
          working now and the step-by-step activity. Refreshes every 4&nbsp;seconds. You can <b>stop</b> a session;
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
              onClick={() => setDetailId(w.sessionId)}
              title="Click for session details"
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius, 8px)",
                background: "var(--panel)", padding: 14, display: "flex", flexDirection: "column", gap: 10,
                cursor: "pointer",
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

              {w.subagent && (
                <div style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                  <span style={{ color: "#a07cc5", fontWeight: 700 }}>→ {w.subagent.type || "subagent"}</span>
                  {w.subagent.task && <span style={{ color: "var(--muted)" }}> · {w.subagent.task}</span>}
                </div>
              )}

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
                  onClick={(e) => { e.stopPropagation(); setStopping(w); }}
                >Stop</button>
              </div>
            </div>
          );
        })}
      </div>
      </>)}

      {detail && (
        <>
          <div className="page-head" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => setDetailId(null)}>← Back</button>
            <h1 style={{ margin: 0 }}>{base(detail.project)}</h1>
            <span style={{ color: (PHASE[detail.phase] ?? PHASE.Thinking).color, fontWeight: 700, fontSize: 13 }}>{(PHASE[detail.phase] ?? PHASE.Thinking).ico} {detail.phase}</span>
            {detail.model && <span style={{ color: "var(--muted)", fontSize: 12 }}>◆ {detail.model.replace(/^claude-/, "")}</span>}
            <span style={{ color: "var(--muted)", fontSize: 12 }}>◷ {dur(detail.uptimeSec)} · {dur(detail.ageSec)} ago · <span className="mono">#{detail.pid}</span></span>
            <button className="btn danger sm" style={{ marginInlineStart: "auto" }} onClick={() => setStopping(detail)}>Stop session</button>
          </div>

          <Card title="The office" sub="every agent this session has worked with — at a desk, color-coded by status">
            {agents === null ? (
              <div className="pg-empty" style={{ padding: 30 }}>Reading the session…</div>
            ) : agents.length === 0 ? (
              <div className="pg-empty" style={{ padding: 30 }}>This session hasn’t spawned any sub-agents yet — it’s working on its own.</div>
            ) : (
              <Suspense fallback={<div className="pg-empty" style={{ padding: 30 }}>Loading the 3D office…</div>}>
                <OfficeView
                  grid={seats}
                  title={base(detail.project)}
                  onPick={() => {}}
                  legend={<>
                    <span className="ov-chip"><i style={{ background: AGENT_STATUS.working.hex }} />Working now</span>
                    <span className="ov-chip"><i style={{ background: AGENT_STATUS.waiting.hex }} />Waiting</span>
                    <span className="ov-chip"><i style={{ background: AGENT_STATUS.hold.hex }} />On hold</span>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>· {agents.reduce((s, a) => s + a.count, 0)} tasks across {agents.length} agents</span>
                  </>}
                />
              </Suspense>
            )}
          </Card>

          <Card title="What it’s doing now" sub={detail.currentTask || detail.firstTask || "(no task captured)"}>
            {detail.subagent && (
              <div style={{ padding: "9px 12px", borderRadius: 8, background: "#a07cc518", border: "1px solid #a07cc555", marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>WORKING NOW VIA SUB-AGENT</div>
                <div style={{ fontWeight: 700, color: "#a07cc5" }}>→ {detail.subagent.type || "subagent"}</div>
                {detail.subagent.task && <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45 }}>{detail.subagent.task}</div>}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>ACTIVITY <span style={{ fontWeight: 400 }}>— most recent first</span></div>
            <div style={{ maxHeight: 300, overflow: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {detail.steps && detail.steps.length > 0 ? [...detail.steps].reverse().map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, padding: "4px 8px", borderRadius: 6, background: i === 0 ? "var(--accent-bg)" : "transparent" }}>
                  <code className="mono" style={{ fontSize: 10.5, color: i === 0 ? "var(--accent)" : "var(--muted)", minWidth: 70, flexShrink: 0 }}>{i === 0 ? "▶ " : ""}{s.tool}</code>
                  <span style={{ color: "var(--text-2)", wordBreak: "break-all", fontFamily: "var(--mono)", fontSize: 11 }}>{s.detail}</span>
                </div>
              )) : <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>No tool activity captured yet.</div>}
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>context {tok(detail.tokensIn)}</span>
              <span>output {tok(detail.tokensOut)}</span>
              <span className="mono" title={detail.cwd}>{tildePath(detail.cwd, meta?.paths?.home)}</span>
            </div>
          </Card>
        </>
      )}

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
