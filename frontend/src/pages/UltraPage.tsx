import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import type { SystemInfo } from "../lib/types";
import { Card, Row, Segmented, Select, Toggle } from "../components/ui";

/**
 * Ultra & Workflow — surfaces the real Claude Code knobs for ultracode mode,
 * dynamic multi-agent workflows, and the subagents they spawn. Every key here
 * is a confirmed-real settings.json key or env var (see docs: workflows.md,
 * sub-agents.md, env-vars.md, settings-reference.md). Nothing invented.
 *
 * Settings keys are written at the top level of the active scope's file.
 * Env-var knobs are written into that file's `env` block (same block the
 * Settings page edits), so they persist exactly as Claude Code reads them.
 */

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const WF_KEY = "CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS";
const SUB_KEY = "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS";

export function UltraPage() {
  const { settings, patch, meta, autoApply, scope, scopes, toast } = useStore();
  const [sys, setSys] = useState<SystemInfo | null>(null);
  useEffect(() => { api.system().then(setSys).catch(() => {}); }, []);
  if (!settings || !meta) return null;

  const active = scopes.find((s) => (s.kind === "user" ? scope === "" : s.path === scope));
  const scopePath = active?.path || scope || "~/.claude/settings.json";
  const isProject = !!scope;
  const env = settings.env ?? {};

  // --- top-level settings-key helpers ------------------------------------- //
  const setBool = (key: keyof typeof settings, v: boolean) =>
    patch((s) => { (s as any)[key] = v; });
  const clearableStr = (key: keyof typeof settings, v: string) =>
    patch((s) => { if (v) (s as any)[key] = v; else delete (s as any)[key]; });

  // --- env-block helpers -------------------------------------------------- //
  const setEnv = (key: string, v: string) =>
    patch((s) => { s.env = { ...(s.env ?? {}) }; if (v) s.env[key] = v; else delete s.env[key]; });
  const envVal = (key: string) => env[key] ?? "";

  const workflowsOn = settings.disableWorkflows !== true;
  const size = settings.workflowSizeGuideline ?? "";
  const ttl = settings.subagentPromptCacheTtl ?? "";

  const applyRecommended = () => {
    if (!sys) return;
    patch((s) => {
      s.env = { ...(s.env ?? {}) };
      Object.entries(sys.recommended).forEach(([k, v]) => { s.env![k] = String(v); });
    });
    toast(`Tuned for ${sys.cpu.logical} threads / ${sys.mem.totalGB} GB — ${sys.recommended[WF_KEY]} workflow agents, ${sys.recommended[SUB_KEY]} subagents`, "ok");
  };
  const matches = (key: string) => sys && String(sys.recommended[key]) === envVal(key);
  const bothMatch = !!sys && matches(WF_KEY) && matches(SUB_KEY);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>
          Ultra &amp; Workflow {isProject && <span className="badge ask" style={{ verticalAlign: "middle" }}>{active?.project} · {active?.kind}</span>}
        </h1>
        <p>
          Dynamic multi-agent orchestration — ultracode mode, workflow fan-out, and the
          subagents they spawn. Writing to <code className="mono">{tildePath(scopePath, meta.paths?.home)}</code>.{" "}
          {autoApply ? "Auto-apply is on — edits save to disk automatically (backed up first)." : "Changes stage as a draft until you Save."}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {sys && (
        <Card
          title="This machine"
          sub={`auto-tuned concurrency`}
          right={
            <button
              className={bothMatch ? "btn ghost sm" : "btn primary sm"}
              disabled={bothMatch}
              onClick={applyRecommended}
            >
              {bothMatch ? "✓ Tuned to this machine" : "Apply recommended"}
            </button>
          }
        >
          <div className="mach-grid">
            <div className="mach-cell"><span className="k">CPU</span><span className="v">{sys.cpu.physical} cores / {sys.cpu.logical} threads</span></div>
            <div className="mach-cell"><span className="k">RAM</span><span className="v">{sys.mem.totalGB} GB <span style={{ color: "var(--muted)" }}>({sys.mem.availGB} free)</span></span></div>
            <div className="mach-cell"><span className="k">Load (1m)</span><span className="v">{sys.load1}</span></div>
            <div className="mach-cell" style={{ gridColumn: "1 / -1" }}><span className="k">Model</span><span className="v mono" style={{ fontSize: 11.5 }}>{sys.cpu.model}</span></div>
          </div>

          <Row title="Workflow max concurrent agents" desc={sys.rationale.workflow}>
            <Reco reco={sys.recommended[WF_KEY]} current={envVal(WF_KEY)} onUse={() => setEnv(WF_KEY, String(sys.recommended[WF_KEY]))} match={!!matches(WF_KEY)} />
          </Row>
          <Row title="Max concurrent subagents" desc={sys.rationale.subagents}>
            <Reco reco={sys.recommended[SUB_KEY]} current={envVal(SUB_KEY)} onUse={() => setEnv(SUB_KEY, String(sys.recommended[SUB_KEY]))} match={!!matches(SUB_KEY)} />
          </Row>
          <div style={{ fontSize: 11.5, color: "var(--muted)", paddingTop: 6, lineHeight: 1.6 }}>
            These gate <b>local</b> orchestration (the coordinator + any tools agents run). The model itself runs in Anthropic's cloud, so specs don't change <i>which</i> model — only how many agents run at once. Takes effect in newly started sessions.
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      <Card title="Ultra mode" sub="maximize thoroughness over cost">
        <Row
          title="Ultracode (persistent)"
          desc="When on, Claude authors & runs a Workflow on every substantive task and reasons at xhigh. Equivalent to settings key ultracode:true. A session can also force it with /effort ultracode."
        >
          <Toggle on={settings.ultracode === true} onChange={(v) => setBool("ultracode", v)} />
        </Row>
        <Row
          title="“ultracode” keyword trigger"
          desc="Lets the literal word “ultracode” in a prompt you type start a workflow for that one prompt. Key: workflowKeywordTriggerEnabled (default on)."
        >
          <Toggle
            on={settings.workflowKeywordTriggerEnabled !== false}
            onChange={(v) => patch((s) => { if (v) delete (s as any).workflowKeywordTriggerEnabled; else (s as any).workflowKeywordTriggerEnabled = false; })}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title="Dynamic workflows" sub="the Workflow tool">
        <Row
          title="Dynamic workflows enabled"
          desc="Master switch for the Workflow tool. Off writes disableWorkflows:true. (Env CLAUDE_CODE_DISABLE_WORKFLOWS=1 also disables.)"
        >
          <Toggle
            on={workflowsOn}
            onChange={(v) => patch((s) => { if (v) delete (s as any).disableWorkflows; else (s as any).disableWorkflows = true; })}
          />
        </Row>
        <Row
          title="Size guideline"
          desc="Advisory ceiling on how many agents a workflow fans out to — not a hard cap. small <5 · medium <10 · large <50 · unrestricted = as many as the task warrants. Default is small on Pro, medium otherwise."
        >
          <Segmented
            value={size}
            options={[
              { value: "", label: "(default)" },
              { value: "small", label: "small" },
              { value: "medium", label: "medium" },
              { value: "large", label: "large" },
              { value: "unrestricted", label: "unrestricted" },
            ]}
            onChange={(v) => clearableStr("workflowSizeGuideline", v)}
          />
        </Row>
        <Row
          title="Skip the usage warning"
          desc="Don't prompt before a workflow spawns many subagents (skips the token-cost confirmation). Key: skipWorkflowUsageWarning."
        >
          <Toggle on={settings.skipWorkflowUsageWarning === true} onChange={(v) => setBool("skipWorkflowUsageWarning", v)} />
        </Row>
        <Row
          title="Max concurrent agents"
          desc="Env CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS (1–256). Blank = Claude Code's default (up to 16, fewer on limited CPUs). Needs v2.1.269+."
        >
          <input
            type="number" min={1} max={256} className="input-sm" style={{ width: 110 }}
            placeholder="auto (≤16)"
            value={envVal("CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS")}
            onChange={(e) => setEnv("CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS", e.target.value)}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title="Subagents" sub="Agent tool & workflow agents">
        <Row
          title="Default subagent model"
          desc="Env CLAUDE_CODE_SUBAGENT_MODEL — the model subagents use when their own definition doesn't pin one. (inherit) = use the main model."
        >
          <Select
            value={envVal("CLAUDE_CODE_SUBAGENT_MODEL")}
            options={meta.models}
            allowEmpty="(inherit)"
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_MODEL", v)}
          />
        </Row>
        <Row
          title="Force that model on all subagents"
          desc="Env CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 — overrides each subagent's and workflow agent's own model choice. Needs v2.1.257+."
        >
          <Toggle
            on={envVal("CLAUDE_CODE_SUBAGENT_MODEL_FORCE") === "1"}
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_MODEL_FORCE", v ? "1" : "")}
          />
        </Row>
        <Row
          title="Default subagent effort"
          desc="Env CLAUDE_CODE_SUBAGENT_EFFORT — reasoning effort for subagents & workflow agents that don't set their own."
        >
          <Select
            value={envVal("CLAUDE_CODE_SUBAGENT_EFFORT")}
            options={EFFORTS}
            allowEmpty="(unset)"
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_EFFORT", v)}
          />
        </Row>
        <Row
          title="Max concurrent subagents"
          desc="Env CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS — session-wide cap for the Agent tool (default 20). Not enforced while ultracode is on. Needs v2.1.217+."
        >
          <input
            type="number" min={1} className="input-sm" style={{ width: 110 }}
            placeholder="20"
            value={envVal("CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS")}
            onChange={(e) => setEnv("CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS", e.target.value)}
          />
        </Row>
        <Row
          title="Max spawn depth"
          desc="Env CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH — how deep subagents may nest (default 3). Caps nesting, not concurrency."
        >
          <input
            type="number" min={1} className="input-sm" style={{ width: 110 }}
            placeholder="3"
            value={envVal("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH")}
            onChange={(e) => setEnv("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH", e.target.value)}
          />
        </Row>
        <Row
          title="Subagent prompt-cache TTL"
          desc="Settings key subagentPromptCacheTtl — how long subagent prompt caches live."
        >
          <Segmented
            value={ttl}
            options={[
              { value: "", label: "(default)" },
              { value: "5m", label: "5m" },
              { value: "1h", label: "1h" },
            ]}
            onChange={(v) => clearableStr("subagentPromptCacheTtl", v)}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title="Ultrareview — /code-review ultra" sub="cloud multi-agent review · no persistent settings">
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--muted)" }}>
          <p style={{ margin: "0 0 8px" }}>
            A deep multi-agent code review run on Anthropic's cloud. Launch it yourself with
            {" "}<code className="mono">/code-review ultra</code> (or <code className="mono">/code-review ultra &lt;PR#&gt;</code> for a GitHub PR);
            {" "}<code className="mono">/ultrareview</code> is an alias. It can't be started from this panel or by Claude —
            it's user-triggered and billed.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "var(--text)" }}>Needs:</b> a git repo · claude.ai sign-in (API-key-only auth won't do) ·
            a <code className="mono">github.com</code> remote for PR mode. Not available on Bedrock/Vertex/Foundry or ZDR/HIPAA/CMEK
            (those fall back to a local review). First 3 runs per account are free, then usage credits (~$5–$25 each).
          </p>
          <p style={{ margin: 0 }}>
            <b style={{ color: "var(--text)" }}>Per-run flags</b> (not settings):
            {" "}<code className="mono">--timeout &lt;min&gt;</code> (default 45) ·
            {" "}<code className="mono">--post</code> / <code className="mono">--no-post</code> (default no-post; posts a plain comment from your GitHub account) ·
            {" "}<code className="mono">--trust-workspace</code> · <code className="mono">--json</code>.
            Diff limits (500 files / 8,000 lines) aren't configurable.
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <div className="warn" style={{ marginTop: 4 }}>
        <span className="i">ℹ</span>
        Env-block knobs (CLAUDE_CODE_*) take effect in newly started sessions; project-scoped env values only apply in a trusted project. The Settings → Environment card lists the full env block.
      </div>
    </div>
  );
}

function Reco({ reco, current, onUse, match }: { reco: number; current: string; onUse: () => void; match: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5 }}>
        <b>{reco}</b>
        <span style={{ color: "var(--muted)" }}> · now {current || "auto"}</span>
      </span>
      {match ? (
        <span className="badge allow" title="Current value matches the recommendation">✓ set</span>
      ) : (
        <button className="btn ghost sm" onClick={onUse}>Use {reco}</button>
      )}
    </div>
  );
}
