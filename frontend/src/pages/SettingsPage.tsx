import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import { Card, Row, Segmented, Select, Toggle } from "../components/ui";

const MODE_LABEL: Record<string, string> = {
  default: "default",
  plan: "plan",
  acceptEdits: "acceptEdits",
  bypassPermissions: "bypass",
  dontAsk: "dontAsk",
};

export function SettingsPage() {
  const { settings, patch, meta, autoApply, scope, scopes } = useStore();
  if (!settings || !meta) return null;
  const active = scopes.find((s) => (s.kind === "user" ? scope === "" : s.path === scope));
  const scopePath = active?.path || scope || "~/.claude/settings.json";
  const isProject = !!scope;

  const perms = settings.permissions ?? {};
  const env = settings.env ?? {};
  const pct = env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ?? "";

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Settings {isProject && <span className="badge ask" style={{ verticalAlign: "middle" }}>{active?.project} · {active?.kind}</span>}</h1>
        <p>
          Editing <code className="mono">{tildePath(scopePath, meta.paths?.home)}</code>.
          {isProject ? " Project settings override your global ones for that project. " : " "}
          {autoApply
            ? "Auto-apply is on — edits save to disk automatically (backed up first)."
            : "Changes stage as a draft — nothing hits disk until you Save."}
        </p>
      </div>

      <Card title="Core">
        <Row title="Permission mode" desc="How tool calls are gated. bypass = no prompts (your CLAUDE.md stop-and-confirm still applies).">
          <Segmented
            value={perms.defaultMode ?? "default"}
            options={meta.modes.map((m) => ({ value: m, label: MODE_LABEL[m] ?? m }))}
            onChange={(v) => patch((s) => { s.permissions = { ...(s.permissions ?? {}), defaultMode: v }; })}
          />
        </Row>
        <Row title="Model" desc="Default model for the session.">
          <Select
            value={settings.model ?? ""}
            options={meta.models}
            allowEmpty="(unset)"
            onChange={(v) => patch((s) => { if (v) s.model = v; else delete s.model; })}
          />
        </Row>
        <Row title="Effort level" desc="Reasoning effort.">
          <Select
            value={settings.effortLevel ?? ""}
            options={meta.efforts}
            allowEmpty="(unset)"
            onChange={(v) => patch((s) => { if (v) s.effortLevel = v; else delete s.effortLevel; })}
          />
        </Row>
      </Card>

      <Card title="Auto-compact" sub="when the context window fills">
        <Row title="Enable auto-compact" desc="Default is on. Off also disables idle compaction; /compact still works.">
          <Toggle
            on={settings.autoCompactEnabled !== false}
            onChange={(v) => patch((s) => { s.autoCompactEnabled = v; })}
          />
        </Row>
        <Row title="Trigger threshold" desc="Percentage of the window at which it fires. Can only lower the model default.">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" min={1} max={100} className="input-sm" style={{ width: 90 }}
              value={pct}
              placeholder="model default"
              onChange={(e) => patch((s) => {
                const val = e.target.value;
                s.env = { ...(s.env ?? {}) };
                if (val) s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = val;
                else delete s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
              })}
            />
            <span style={{ color: "var(--muted)" }}>%</span>
          </div>
        </Row>
        <Row title="Auto-compact window" desc="Token budget the % applies to (caps at the model's real context window).">
          <input
            type="number" step={10000} className="input-sm" style={{ width: 150 }}
            value={settings.autoCompactWindow ?? ""}
            placeholder="per-model default"
            onChange={(e) => patch((s) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) s.autoCompactWindow = n;
              else delete s.autoCompactWindow;
            })}
          />
        </Row>
      </Card>

      <EnvCard env={env} />

      <RawCard />
    </div>
  );
}

function EnvCard({ env }: { env: Record<string, string> }) {
  const { patch } = useStore();
  const [nk, setNk] = useState("");
  const [nv, setNv] = useState("");
  const keys = Object.keys(env);
  return (
    <Card title="Environment variables" sub={`${keys.length} set`}>
      {keys.length === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>None set.</div>}
      {keys.map((k) => (
        <div className="row" key={k}>
          <div className="label"><div className="t mono">{k}</div></div>
          <div className="control" style={{ gap: 6 }}>
            <input
              type="text" className="input-sm mono" style={{ width: 200 }}
              value={env[k]}
              onChange={(e) => patch((s) => { s.env = { ...(s.env ?? {}) }; s.env[k] = e.target.value; })}
            />
            <button className="btn ghost sm" onClick={() => patch((s) => { s.env = { ...(s.env ?? {}) }; delete s.env![k]; })}>×</button>
          </div>
        </div>
      ))}
      <div className="row">
        <div className="control" style={{ gap: 6, width: "100%", justifyContent: "flex-start" }}>
          <input type="text" className="input-sm mono" style={{ width: 220 }} placeholder="KEY" value={nk} onChange={(e) => setNk(e.target.value)} />
          <input type="text" className="input-sm mono" style={{ width: 180 }} placeholder="value" value={nv} onChange={(e) => setNv(e.target.value)} />
          <button
            className="btn sm"
            disabled={!nk.trim()}
            onClick={() => { patch((s) => { s.env = { ...(s.env ?? {}) }; s.env[nk.trim()] = nv; }); setNk(""); setNv(""); }}
          >+ add</button>
        </div>
      </div>
    </Card>
  );
}

function RawCard() {
  const { settings, patch, toast } = useStore();
  const [open, setOpen] = useState(false);
  const text = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const [draft, setDraft] = useState(text);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card
      title="Raw settings.json"
      right={<button className="btn ghost sm" onClick={() => { setDraft(JSON.stringify(settings, null, 2)); setOpen((o) => !o); }}>{open ? "Hide" : "Edit raw"}</button>}
    >
      {!open ? (
        <div style={{ color: "var(--muted)", padding: "4px 0" }}>Full-object escape hatch for keys this UI doesn’t surface. Validated before it’s applied to the draft.</div>
      ) : (
        <div>
          <textarea
            rows={16}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setErr(null); }}
            spellCheck={false}
          />
          {err && <div className="warn" style={{ marginTop: 8 }}><span className="i">⚠</span>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="btn primary sm"
              onClick={() => {
                try {
                  const parsed = JSON.parse(draft);
                  patch((s) => { Object.keys(s).forEach((k) => delete (s as any)[k]); Object.assign(s, parsed); });
                  toast("Applied to draft — review and Save", "info");
                  setOpen(false);
                } catch (e: any) { setErr("Invalid JSON: " + e.message); }
              }}
            >Apply to draft</button>
            <span style={{ color: "var(--muted)", alignSelf: "center", fontSize: 11 }}>Then Save in the top bar to write it.</span>
          </div>
        </div>
      )}
    </Card>
  );
}
