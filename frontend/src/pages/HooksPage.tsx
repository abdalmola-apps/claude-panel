import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { Card, Modal, Row } from "../components/ui";

export function HooksPage() {
  const { settings, patch, toast, meta } = useStore();
  const hooks = settings?.hooks ?? {};
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const summary = useMemo(() => {
    const out: { event: string; matcher: string; cmds: number; types: string }[] = [];
    for (const ev of Object.keys(hooks)) {
      const arr = Array.isArray(hooks[ev]) ? hooks[ev] : [];
      for (const g of arr) {
        const hs = g.hooks ?? [];
        out.push({ event: ev, matcher: g.matcher ?? "*", cmds: hs.length, types: hs.map((h: any) => h.type).join(", ") });
      }
    }
    return out;
  }, [hooks]);

  const t = q.trim().toLowerCase();
  const filtered = t ? summary.filter((h) => h.event.toLowerCase().includes(t) || h.matcher.toLowerCase().includes(t)) : summary;

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Hooks</h1>
        <p>Commands Claude Code runs on lifecycle events ({(meta?.hookEvents ?? []).slice(0, 4).join(", ")}…). Edited as raw JSON, applied to the settings draft.</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <input type="text" placeholder="Search hooks by event or matcher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 380 }} />
        <button className="btn sm" style={{ marginInlineStart: "auto" }} onClick={() => { setDraft(JSON.stringify(hooks, null, 2)); setErr(null); setOpen(true); }}>Edit raw JSON</button>
      </div>

      <Card title="Configured hooks" sub={summary.length ? `${summary.length} matcher group(s)` : "none"}>
        {summary.length === 0 && (
          <div className="empty-state" style={{ padding: 30 }}>
            No hooks configured. Hooks run commands on events like <code className="mono">PreToolUse</code>, <code className="mono">PreCompact</code>, <code className="mono">Stop</code>. Use “Edit raw JSON”.
          </div>
        )}
        {filtered.map((h, i) => (
          <Row key={i} title={<span><b>{h.event}</b> &nbsp;<span className="mono" style={{ color: "var(--muted)" }}>{h.matcher}</span></span>} desc={`${h.cmds} hook(s)${h.types ? " · " + h.types : ""}`}>
            <span className="badge neutral">{h.event}</span>
          </Row>
        ))}
      </Card>

      {open && (
        <Modal
          title="Edit hooks (raw JSON)"
          width={640}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={() => {
                try {
                  const parsed = JSON.parse(draft);
                  patch((s) => { s.hooks = parsed; });
                  toast("Hooks applied to draft — Save to write", "info");
                  setOpen(false);
                } catch (e: any) { setErr("Invalid JSON: " + e.message); }
              }}>Apply to draft</button>
            </>
          }
        >
          <textarea rows={18} value={draft} spellCheck={false} onChange={(e) => { setDraft(e.target.value); setErr(null); }} />
          {err && <div className="warn" style={{ marginTop: 8 }}><span className="i">⚠</span>{err}</div>}
        </Modal>
      )}
    </div>
  );
}
