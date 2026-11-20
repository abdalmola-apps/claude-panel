import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/api";
import { Card, Modal, Row } from "../components/ui";

type Fragment = Record<string, any[]>;

/** Deep-merge a hooks fragment into the current hooks object, appending to
 *  matcher arrays and skipping groups that are already present verbatim. */
function mergeHooks(current: Record<string, any> | undefined, frag: Fragment): { next: Fragment; added: number } {
  const next: Fragment = structuredClone(current ?? {});
  let added = 0;
  for (const [event, groups] of Object.entries(frag)) {
    const arr = Array.isArray(next[event]) ? next[event] : [];
    for (const g of groups) {
      const key = JSON.stringify(g);
      if (!arr.some((x) => JSON.stringify(x) === key)) { arr.push(g); added++; }
    }
    next[event] = arr;
  }
  return { next, added };
}

export function HooksPage() {
  const { settings, patch, toast, meta } = useStore();
  const tr = useT();
  const hooks = settings?.hooks ?? {};
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiCmd, setAiCmd] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ hooks: Fragment | null; raw: string } | null>(null);

  // The `claude --version` probe fails (→ "unknown"/empty) when the CLI is absent.
  const cliMissing = !meta?.claudeVersion || meta.claudeVersion === "unknown";

  // Turn a backend failure reason into a clear, localised message (+ fix command).
  const reasonText = (reason: string, fallback: string): { msg: string; cmd?: string } => {
    switch (reason) {
      case "not_authenticated":
        return { msg: tr("The claude CLI isn’t signed in on this device. Sign in, then try again.", "لم يُسجَّل الدخول إلى claude على هذا الجهاز. سجّل الدخول ثم أعِد المحاولة."), cmd: "claude auth login" };
      case "not_installed":
        return { msg: tr("The claude CLI isn’t installed on this machine. Use the examples above, or install Claude Code.", "claude غير مُثبَّت على هذا الجهاز. استخدم الأمثلة في الأعلى أو ثبّت Claude Code.") };
      case "usage_limit":
        return { msg: tr("Claude is unavailable right now (usage or rate limit). Try again later.", "كلود غير متاح الآن (تجاوز حدّ الاستخدام أو معدّل الطلبات). أعِد المحاولة لاحقًا.") };
      case "timeout":
        return { msg: tr("The request timed out. Try again, or simplify it.", "انتهت مهلة الطلب. أعِد المحاولة أو بسّطه.") };
      case "parse_failed":
        return { msg: tr("claude ran but didn’t return a usable hook — see the raw output below, or rephrase.", "اشتغل claude لكنه لم يُعِد مُشغّلًا صالحًا — راجِع المخرجات الخام أدناه أو أعِد الصياغة.") };
      default:
        return { msg: fallback || tr("The claude CLI returned an error.", "أعاد claude خطأً.") };
    }
  };

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

  const insert = (frag: Fragment, name: string) => {
    const { next, added } = mergeHooks(settings?.hooks, frag);
    if (added === 0) { toast(tr(`“${name}” is already in your hooks`, `«${name}» موجود بالفعل في مُشغّلاتك`), "info"); return; }
    patch((s) => { s.hooks = next; });
    toast(tr(`Added “${name}” to the draft — Save to write`, `أُضيف «${name}» إلى المسودة — احفظ للكتابة`), "info");
  };

  const examples: { id: string; title: string; desc: string; events: string[]; fragment: Fragment }[] = [
    {
      id: "format-on-write",
      title: tr("Auto-format after writes", "تنسيق تلقائي بعد الكتابة"),
      desc: tr("Runs Prettier on every file Claude writes or edits.", "يشغّل Prettier على كل ملف يكتبه كلود أو يعدّله."),
      events: ["PostToolUse"],
      fragment: {
        PostToolUse: [{
          matcher: "Write|Edit",
          hooks: [{ type: "command", command: `jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; [ -n "$f" ] && prettier --write "$f"; } 2>/dev/null || true` }],
        }],
      },
    },
    {
      id: "log-bash",
      title: tr("Log every bash command", "تسجيل كل أمر bash"),
      desc: tr("Appends each shell command to ~/.claude/bash-history.log.", "يضيف كل أمر صدفة إلى ~/.claude/bash-history.log."),
      events: ["PreToolUse"],
      fragment: {
        PreToolUse: [{
          matcher: "Bash",
          hooks: [{ type: "command", command: `jq -r '.tool_input.command' >> ~/.claude/bash-history.log` }],
        }],
      },
    },
    {
      id: "notify-stop",
      title: tr("Desktop notification when done", "إشعار على سطح المكتب عند الانتهاء"),
      desc: tr("Pops a notification when Claude finishes a turn.", "يُظهر إشعارًا عندما ينهي كلود دوره."),
      events: ["Stop"],
      fragment: {
        Stop: [{
          hooks: [{ type: "command", command: `notify-send "Claude Code" "Session finished" 2>/dev/null || true` }],
        }],
      },
    },
    {
      id: "test-on-edit",
      title: tr("Run tests after code edits", "تشغيل الاختبارات بعد تعديل الشيفرة"),
      desc: tr("Runs npm test when a .ts/.tsx/.js/.py file changes.", "يشغّل npm test عند تغيّر ملف ‎.ts/.tsx/.js/.py."),
      events: ["PostToolUse"],
      fragment: {
        PostToolUse: [{
          matcher: "Write|Edit",
          hooks: [{ type: "command", command: `jq -r '.tool_input.file_path // .tool_response.filePath' | grep -qE '\\.(ts|tsx|js|py)$' && npm test --silent 2>/dev/null || true` }],
        }],
      },
    },
    {
      id: "guard-secrets",
      title: tr("Block edits to secret files", "منع تعديل الملفات السرّية"),
      desc: tr("Denies Write/Edit on .env, keys and credential files.", "يمنع الكتابة/التعديل على ‎.env والمفاتيح وملفات الاعتماد."),
      events: ["PreToolUse"],
      fragment: {
        PreToolUse: [{
          matcher: "Write|Edit",
          hooks: [{ type: "command", command: `jq -r '.tool_input.file_path // ""' | grep -qE '(\\.env|credentials|secrets|\\.pem|\\.key)$' && printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Editing a secret file is blocked by a hook."}}' || true` }],
        }],
      },
    },
    {
      id: "session-branch",
      title: tr("Inject git branch at session start", "إدراج فرع git عند بدء الجلسة"),
      desc: tr("Tells Claude the current git branch when a session begins.", "يُعلم كلود بالفرع الحالي في git عند بدء الجلسة."),
      events: ["SessionStart"],
      fragment: {
        SessionStart: [{
          hooks: [{ type: "command", command: `printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Git branch: %s"}}' "$(git branch --show-current 2>/dev/null || echo none)"` }],
        }],
      },
    },
  ];

  const generate = async () => {
    const p = aiPrompt.trim();
    if (!p) return;
    setAiBusy(true); setAiErr(null); setAiCmd(null); setAiResult(null);
    try {
      const r = await api.generateHook(p);
      if (r.ok && r.hooks) {
        setAiResult({ hooks: r.hooks, raw: r.raw });
      } else {
        const info = reasonText(r.reason, r.message);
        setAiErr(info.msg);
        setAiCmd(info.cmd ?? null);
        setAiResult(r.raw ? { hooks: null, raw: r.raw } : null);
      }
    } catch (e: any) {
      setAiErr(e.message || String(e));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>{tr("Hooks", "المُشغّلات (Hooks)")}</h1>
        <p>{tr("Commands Claude Code runs on lifecycle events (", "أوامر ينفّذها Claude Code عند أحداث دورة الحياة (")}{(meta?.hookEvents ?? []).slice(0, 4).join(", ")}{tr("…). Insert an example below or generate one, then Save.", "…). أدرِج مثالًا من الأسفل أو ولِّد واحدًا، ثم احفظ.")}</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <input type="text" placeholder={tr("Search hooks by event or matcher…", "بحث في المُشغّلات حسب الحدث أو المُطابِق…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 380 }} />
        <button className="btn sm" style={{ marginInlineStart: "auto" }} onClick={() => { setDraft(JSON.stringify(hooks, null, 2)); setErr(null); setOpen(true); }}>{tr("Edit raw JSON", "تحرير JSON الخام")}</button>
      </div>

      <Card title={tr("Configured hooks", "المُشغّلات المُعدّة")} sub={summary.length ? `${summary.length} ${tr("matcher group(s)", "مجموعة مُطابِقة")}` : tr("none", "لا شيء")}>
        {summary.length === 0 && (
          <div className="empty-state" style={{ padding: 30 }}>
            {tr("No hooks configured yet. Insert one of the examples below.", "لا توجد مُشغّلات مُعدّة بعد. أدرِج أحد الأمثلة في الأسفل.")}
          </div>
        )}
        {filtered.map((h, i) => (
          <Row key={i} title={<span><b>{h.event}</b> &nbsp;<span className="mono" style={{ color: "var(--muted)" }}>{h.matcher}</span></span>} desc={`${h.cmds} ${tr("hook(s)", "مُشغِّل")}${h.types ? " · " + h.types : ""}`}>
            <span className="badge neutral">{h.event}</span>
          </Row>
        ))}
      </Card>

      <Card title={tr("Examples", "أمثلة")} sub={tr("one click adds it to your draft", "نقرة واحدة تضيفه إلى مسودتك")}>
        {examples.map((ex) => (
          <div key={ex.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{ex.title}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{ex.desc}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {ex.events.map((e) => <span key={e} className="badge neutral mono" style={{ fontSize: 10 }}>{e}</span>)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn ghost sm" onClick={() => setShown(shown === ex.id ? null : ex.id)}>{shown === ex.id ? tr("Hide", "إخفاء") : tr("JSON", "JSON")}</button>
                <button className="btn primary sm" onClick={() => insert(ex.fragment, ex.title)}>{tr("Insert", "إدراج")}</button>
              </div>
            </div>
            {shown === ex.id && (
              <pre className="mono" style={{ marginTop: 8, padding: 10, background: "var(--panel-2, rgba(127,127,127,.08))", borderRadius: 6, fontSize: 11, overflowX: "auto", direction: "ltr", textAlign: "left" }}>
                {JSON.stringify(ex.fragment, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </Card>

      <Card title={tr("Generate with AI", "التوليد بالذكاء الاصطناعي")} sub={tr("describe what you want in plain words", "صِف ما تريد بكلمات واضحة")}>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
          {tr("Runs the local ", "يشغّل ")}<code className="mono">claude</code>{tr(" CLI (must be installed and signed in) to draft a hook. It is only staged for your review — nothing runs until you Insert and Save.", " محليًّا (يجب أن يكون مُثبَّتًا ومُسجَّلًا دخولُه) لصياغة مُشغّل. يُسجَّل للمراجعة فقط — لا يُنفَّذ شيء حتى تُدرِجه وتحفظ.")}
        </div>
        {cliMissing && (
          <div className="warn" style={{ marginBottom: 8 }}><span className="i">⚠</span>{tr("The claude CLI isn’t detected on this machine. This generator needs it — use the ready-made examples above instead.", "لم يُعثر على claude على هذا الجهاز. يحتاجه هذا المولّد — استخدم الأمثلة الجاهزة في الأعلى بدلًا من ذلك.")}</div>
        )}
        <textarea
          rows={3}
          value={aiPrompt}
          disabled={cliMissing || aiBusy}
          placeholder={tr("e.g. run eslint --fix on every edited JS file", "مثال: شغّل eslint --fix على كل ملف JS مُعدَّل")}
          onChange={(e) => { setAiPrompt(e.target.value); setAiErr(null); setAiCmd(null); }}
          spellCheck={false}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <button className="btn primary sm" disabled={cliMissing || aiBusy || !aiPrompt.trim()} onClick={generate}>
            {aiBusy ? tr("Generating…", "جارٍ التوليد…") : tr("Generate", "توليد")}
          </button>
          {aiBusy && <span style={{ color: "var(--muted)", fontSize: 12 }}>{tr("asking claude — this can take ~10–30s", "يسأل كلود — قد يستغرق نحو ١٠–٣٠ ثانية")}</span>}
        </div>

        {aiErr && <div className="warn" style={{ marginTop: 10 }}><span className="i">⚠</span>{aiErr}</div>}
        {aiCmd && (
          <pre className="mono" style={{ marginTop: 8, padding: "8px 10px", background: "var(--panel-2, rgba(127,127,127,.08))", borderRadius: 6, fontSize: 12, direction: "ltr", textAlign: "left" }}>{aiCmd}</pre>
        )}

        {aiResult?.hooks && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{tr("Generated hook", "المُشغّل المُولَّد")}</span>
              <button className="btn primary sm" style={{ marginInlineStart: "auto" }} onClick={() => insert(aiResult.hooks as Fragment, tr("generated hook", "مُشغّل مُولَّد"))}>{tr("Insert", "إدراج")}</button>
            </div>
            <pre className="mono" style={{ padding: 10, background: "var(--panel-2, rgba(127,127,127,.08))", borderRadius: 6, fontSize: 11, overflowX: "auto", direction: "ltr", textAlign: "left" }}>
              {JSON.stringify(aiResult.hooks, null, 2)}
            </pre>
          </div>
        )}
        {aiResult && !aiResult.hooks && aiResult.raw && (
          <pre className="mono" style={{ marginTop: 10, padding: 10, background: "var(--panel-2, rgba(127,127,127,.08))", borderRadius: 6, fontSize: 11, overflowX: "auto", direction: "ltr", textAlign: "left", maxHeight: 220 }}>
            {aiResult.raw}
          </pre>
        )}
      </Card>

      {open && (
        <Modal
          title={tr("Edit hooks (raw JSON)", "تحرير المُشغّلات (JSON خام)")}
          width={640}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setOpen(false)}>{tr("Cancel", "إلغاء")}</button>
              <button className="btn primary" onClick={() => {
                try {
                  const parsed = JSON.parse(draft);
                  patch((s) => { s.hooks = parsed; });
                  toast(tr("Hooks applied to draft — Save to write", "طُبِّقت المُشغّلات على المسودة — احفظ للكتابة"), "info");
                  setOpen(false);
                } catch (e: any) { setErr(tr("Invalid JSON: ", "JSON غير صالح: ") + e.message); }
              }}>{tr("Apply to draft", "تطبيق على المسودة")}</button>
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
