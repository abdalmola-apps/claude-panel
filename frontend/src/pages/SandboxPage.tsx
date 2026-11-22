import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { Card } from "../components/ui";
import type { SandboxStats, SandboxStatus } from "../lib/types";

function Cmd({ children }: { children: string }) {
  return (
    <pre className="mono" style={{ margin: "6px 0 2px", padding: "7px 10px", background: "var(--panel-2, rgba(127,127,127,.1))", borderRadius: 6, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}>{children}</pre>
  );
}

function Step({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 18, flexShrink: 0, color: ok ? "#30c070" : "var(--muted)", fontWeight: 700, fontSize: 14, lineHeight: "20px" }}>{ok ? "✓" : "○"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

export function SandboxPage() {
  const { toast } = useStore();
  const [st, setSt] = useState<SandboxStatus | null>(null);
  const [stats, setStats] = useState<SandboxStats | null>(null);
  const [workdir, setWorkdir] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setSt(await api.sandboxStatus()); } catch { /* keep last */ }
  }, []);
  const refreshStats = useCallback(async () => {
    try { setStats(await api.sandboxStats()); }
    catch (e: any) { setStats({ configured: true, ok: false, error: e.message || String(e) }); }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => { if (st && !workdir) setWorkdir(st.defaultWorkdir); }, [st, workdir]);

  if (!st) return <div className="main-inner"><div className="loading">Loading…</div></div>;

  const ready = st.antInstalled && st.apiKey && !!st.envId && st.envKey;

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.sandboxWorkerStart(workdir || st.defaultWorkdir);
      toast(r.note || `Worker started (pid ${r.pid})`, "ok");
      setTimeout(() => { refresh(); refreshStats(); }, 1000);
    } catch (e: any) { toast("Start failed: " + (e.message || e), "err"); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.sandboxWorkerStop(); toast("Worker stop sent", "ok"); setTimeout(refresh, 900); }
    catch (e: any) { toast("Stop failed: " + (e.message || e), "err"); }
    finally { setBusy(false); }
  };

  const wp = stats?.ok ? (stats.workersPolling ?? 0) : null;

  return (
    <div className="main-inner" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <h1>Self-hosted Sandboxes {ready && <span className="badge allow" style={{ verticalAlign: "middle" }}>ready</span>}</h1>
        <p>
          Run a <a href={st.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Managed Agents</a> worker
          on this machine: Anthropic runs the model loop, your worker executes each tool call locally. This page is the local
          control plane — it detects what&rsquo;s set up, starts/stops the worker, and reads its health. Beta
          (<code className="mono">managed-agents-2026-04-01</code>). Nothing is sent anywhere until you&rsquo;re configured.
        </p>
      </div>

      <Card title="Setup" sub={ready ? "all set" : "finish these to activate"}>
        <Step ok={st.antInstalled} title="Anthropic `ant` CLI (the worker binary)">
          {st.antInstalled ? (
            <>Installed — <code className="mono">{st.antVersion}</code>.</>
          ) : (
            <>
              Not found on this machine. Install it:
              <Cmd>{st.installCmd}</Cmd>
              {st.installNote}{" "}
              <b>Note:</b> this is <i>not</i> Apache Ant (the Java build tool) — that&rsquo;s a different <code className="mono">ant</code>.{" "}
              <a href={st.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Docs ↗</a>
            </>
          )}
        </Step>

        <Step ok={st.apiKey} title="Control API key — ANTHROPIC_API_KEY">
          {st.apiKey ? (
            <>Present in the panel&rsquo;s environment (used to create environments &amp; read health).</>
          ) : (
            <>
              Not set where the panel runs. Export it and restart the panel:
              <Cmd>export ANTHROPIC_API_KEY=sk-ant-…{"\n"}systemctl --user restart claude-control</Cmd>
              <b>Keep this off the worker host</b> — a tool call could read it there.
            </>
          )}
        </Step>

        <Step ok={!!st.envId} title="Environment — ANTHROPIC_ENVIRONMENT_ID">
          {st.envId ? (
            <>Targeting <code className="mono">{st.envId}</code>.</>
          ) : (
            <>
              Create a <code className="mono">self_hosted</code> environment, then export its id:
              <Cmd>{`curl -X POST https://api.anthropic.com/v1/environments \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2026-10-21" \\
  -H "anthropic-beta: managed-agents-2026-04-01" \\
  -d '{"name":"self-hosted","config":{"type":"self_hosted"}}'

export ANTHROPIC_ENVIRONMENT_ID=env_…   # from the response`}</Cmd>
            </>
          )}
        </Step>

        <Step ok={st.envKey} title="Worker key — ANTHROPIC_ENVIRONMENT_KEY">
          {st.envKey ? (
            <>Present — the worker authenticates to its queue with it.</>
          ) : (
            <>
              Generate an environment key in the Console (it can&rsquo;t be made via the API), then export it where the panel runs:
              <Cmd>export ANTHROPIC_ENVIRONMENT_KEY=sk-ant-oat01-…</Cmd>
            </>
          )}
        </Step>
      </Card>

      <Card
        title="Worker"
        sub={st.workerRunning ? `running · pid ${st.workerPids.join(", ")}` : "stopped"}
        right={<span style={{ width: 9, height: 9, borderRadius: "50%", background: st.workerRunning ? "#30c070" : "var(--muted)", display: "inline-block" }} />}
      >
        {!st.antInstalled ? (
          <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "6px 0" }}>Install the <code className="mono">ant</code> CLI above to run a worker.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--muted)" }}>Workdir</label>
              <input className="input-sm mono" style={{ width: 240 }} value={workdir} onChange={(e) => setWorkdir(e.target.value)} />
              {st.workerRunning ? (
                <button className="btn sm" style={{ color: "var(--deny, #e05555)" }} disabled={busy} onClick={stop}>Stop worker</button>
              ) : (
                <button className="btn primary sm" disabled={busy || !st.envKey} onClick={start}>Start worker</button>
              )}
            </div>
            {!st.envKey && !st.workerRunning && (
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>Set the worker key above before starting.</div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
              On Linux the workdir is usually <code className="mono">/workspace</code> and must exist &amp; be writable:
              <Cmd>sudo mkdir -p /workspace &amp;&amp; sudo chown "$USER" /workspace</Cmd>
              Worker output logs to <code className="mono">{st.logPath}</code>.
            </div>
          </>
        )}
      </Card>

      <Card
        title="Health"
        sub="work queue"
        right={<button className="btn ghost sm" onClick={refreshStats}>Refresh</button>}
      >
        {!stats || !stats.configured ? (
          <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "6px 0" }}>
            {stats?.reason || "Set the environment id + API key above to read queue health."}
          </div>
        ) : stats.ok ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: (wp ?? 0) > 0 ? "#30c070" : "#d9a334" }}>{wp}</span>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>worker{wp === 1 ? "" : "s"} polling this environment{(wp ?? 0) === 0 ? " — start one above" : ""}</span>
          </div>
        ) : (
          <div className="warn"><span className="i">⚠</span>{stats.error}</div>
        )}
      </Card>
    </div>
  );
}
