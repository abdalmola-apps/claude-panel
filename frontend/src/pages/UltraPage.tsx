import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import type { SystemInfo } from "../lib/types";
import { Card, Row, Segmented, Select, Toggle } from "../components/ui";
import { useT } from "../lib/i18n";

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
  const t = useT();
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
    toast(t(`Tuned for ${sys.cpu.logical} threads / ${sys.mem.totalGB} GB — ${sys.recommended[WF_KEY]} workflow agents, ${sys.recommended[SUB_KEY]} subagents`, `تم الضبط لعدد ${sys.cpu.logical} خيط / ${sys.mem.totalGB} غيغابايت — ${sys.recommended[WF_KEY]} وكيل سير عمل و${sys.recommended[SUB_KEY]} وكيل فرعي`), "ok");
  };
  const matches = (key: string) => sys && String(sys.recommended[key]) === envVal(key);
  const bothMatch = !!sys && matches(WF_KEY) && matches(SUB_KEY);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>
          {t("Ultra & Workflow", "الوضع الفائق وسير العمل")} {isProject && <span className="badge ask" style={{ verticalAlign: "middle" }}>{active?.project} · {active?.kind}</span>}
        </h1>
        <p>
          {t("Dynamic multi-agent orchestration — ultracode mode, workflow fan-out, and the subagents they spawn. Writing to ", "تنسيق ديناميكي متعدد الوكلاء — وضع ultracode، وتوزيع سير العمل، والوكلاء الفرعيون الذين يُنشئهم. تُكتب الإعدادات إلى ")}<code className="mono">{tildePath(scopePath, meta.paths?.home)}</code>.{" "}
          {autoApply ? t("Auto-apply is on — edits save to disk automatically (backed up first).", "التطبيق التلقائي مُفعّل — تُحفظ التعديلات إلى القرص تلقائيًا (مع إنشاء نسخة احتياطية أولًا).") : t("Changes stage as a draft until you Save.", "تبقى التغييرات مسوّدة حتى تضغط حفظ.")}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {sys && (
        <Card
          title={t("This machine", "هذا الجهاز")}
          sub={t("auto-tuned concurrency", "تزامن مضبوط تلقائيًا")}
          right={
            <button
              className={bothMatch ? "btn ghost sm" : "btn primary sm"}
              disabled={bothMatch}
              onClick={applyRecommended}
            >
              {bothMatch ? t("✓ Tuned to this machine", "✓ مضبوط لهذا الجهاز") : t("Apply recommended", "تطبيق المُوصى به")}
            </button>
          }
        >
          <div className="mach-grid">
            <div className="mach-cell"><span className="k">{t("CPU", "المعالج")}</span><span className="v">{sys.cpu.physical} {t("cores", "نوى")} / {sys.cpu.logical} {t("threads", "خيوط")}</span></div>
            <div className="mach-cell"><span className="k">{t("RAM", "الذاكرة العشوائية")}</span><span className="v">{sys.mem.totalGB} GB <span style={{ color: "var(--muted)" }}>({sys.mem.availGB} {t("free", "متاح")})</span></span></div>
            <div className="mach-cell"><span className="k">{t("Load (1m)", "الحِمل (دقيقة واحدة)")}</span><span className="v">{sys.load1}</span></div>
            <div className="mach-cell" style={{ gridColumn: "1 / -1" }}><span className="k">{t("Model", "النموذج")}</span><span className="v mono" style={{ fontSize: 11.5 }}>{sys.cpu.model}</span></div>
          </div>

          <Row
            title={t("Workflow max concurrent agents", "الحد الأقصى لوكلاء سير العمل المتزامنين")}
            desc={t(
              `${sys.detail.logical} logical cores − 2 for headroom (=${sys.detail.wfCpu}), vs ${sys.detail.totalGB} GB ÷ 2 (=${sys.detail.wfRam}); take the min, cap 16.`,
              `${sys.detail.logical} نواة منطقية − 2 لتوفير هامش (=${sys.detail.wfCpu})، مقابل ${sys.detail.totalGB} غيغابايت ÷ 2 (=${sys.detail.wfRam})؛ يُؤخذ الأصغر بحدٍّ أقصى 16.`
            )}
          >
            <Reco reco={sys.recommended[WF_KEY]} current={envVal(WF_KEY)} onUse={() => setEnv(WF_KEY, String(sys.recommended[WF_KEY]))} match={!!matches(WF_KEY)} />
          </Row>
          <Row
            title={t("Max concurrent subagents", "الحد الأقصى للوكلاء الفرعيين المتزامنين")}
            desc={t(
              `2× logical cores (=${sys.detail.subCpu}) vs ${sys.detail.totalGB} GB ÷ 1.5 (=${sys.detail.subRam}); take the min, cap at the default 20.`,
              `ضعف النوى المنطقية (=${sys.detail.subCpu}) مقابل ${sys.detail.totalGB} غيغابايت ÷ 1.5 (=${sys.detail.subRam})؛ يُؤخذ الأصغر بحدٍّ أقصى 20 الافتراضي.`
            )}
          >
            <Reco reco={sys.recommended[SUB_KEY]} current={envVal(SUB_KEY)} onUse={() => setEnv(SUB_KEY, String(sys.recommended[SUB_KEY]))} match={!!matches(SUB_KEY)} />
          </Row>
          <div style={{ fontSize: 11.5, color: "var(--muted)", paddingTop: 6, lineHeight: 1.6 }}>
            {t("These gate ", "تتحكم هذه الإعدادات في التنسيق ")}<b>{t("local", "المحلي")}</b>{t(" orchestration (the coordinator + any tools agents run). The model itself runs in Anthropic's cloud, so specs don't change ", " (المنسّق + أي أدوات يُشغّلها الوكلاء). النموذج نفسه يعمل في سحابة Anthropic، لذا لا تغيّر المواصفات ")}<i>{t("which", "أيّ")}</i>{t(" model — only how many agents run at once. Takes effect in newly started sessions.", " نموذج — بل فقط عدد الوكلاء الذين يعملون في آنٍ واحد. يسري المفعول في الجلسات المُنشأة حديثًا.")}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      <Card title={t("Ultra mode", "الوضع الفائق")} sub={t("maximize thoroughness over cost", "أقصى دقة وشمول على حساب التكلفة")}>
        <Row
          title={t("Ultracode (persistent)", "Ultracode (دائم)")}
          desc={t("When on, Claude authors & runs a Workflow on every substantive task and reasons at xhigh. Equivalent to settings key ultracode:true. A session can also force it with /effort ultracode.", "عند التفعيل، يؤلّف Claude ويُشغّل سير عمل في كل مهمة جوهرية ويفكّر بمستوى xhigh. يكافئ مفتاح الإعدادات ultracode:true. ويمكن للجلسة أيضًا فرضه عبر /effort ultracode.")}
        >
          <Toggle on={settings.ultracode === true} onChange={(v) => setBool("ultracode", v)} />
        </Row>
        <Row
          title={t("“ultracode” keyword trigger", "مُحفِّز الكلمة المفتاحية «ultracode»")}
          desc={t("Lets the literal word “ultracode” in a prompt you type start a workflow for that one prompt. Key: workflowKeywordTriggerEnabled (default on).", "يتيح للكلمة الحرفية «ultracode» في موجّه تكتبه بدءَ سير عمل لذلك الموجّه وحده. المفتاح: workflowKeywordTriggerEnabled (مُفعّل افتراضيًا).")}
        >
          <Toggle
            on={settings.workflowKeywordTriggerEnabled !== false}
            onChange={(v) => patch((s) => { if (v) delete (s as any).workflowKeywordTriggerEnabled; else (s as any).workflowKeywordTriggerEnabled = false; })}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title={t("Dynamic workflows", "سير العمل الديناميكي")} sub={t("the Workflow tool", "أداة سير العمل")}>
        <Row
          title={t("Dynamic workflows enabled", "تفعيل سير العمل الديناميكي")}
          desc={t("Master switch for the Workflow tool. Off writes disableWorkflows:true. (Env CLAUDE_CODE_DISABLE_WORKFLOWS=1 also disables.)", "المفتاح الرئيسي لأداة سير العمل. الإيقاف يكتب disableWorkflows:true. (المتغيّر CLAUDE_CODE_DISABLE_WORKFLOWS=1 يعطّلها أيضًا.)")}
        >
          <Toggle
            on={workflowsOn}
            onChange={(v) => patch((s) => { if (v) delete (s as any).disableWorkflows; else (s as any).disableWorkflows = true; })}
          />
        </Row>
        <Row
          title={t("Size guideline", "دليل الحجم")}
          desc={t("Advisory ceiling on how many agents a workflow fans out to — not a hard cap. small <5 · medium <10 · large <50 · unrestricted = as many as the task warrants. Default is small on Pro, medium otherwise.", "سقف استرشادي لعدد الوكلاء الذين يوزّعهم سير العمل — لا حدّ صارم. small <5 · medium <10 · large <50 · unrestricted = بقدر ما تتطلّبه المهمة. الافتراضي small على خطة Pro، وmedium فيما عدا ذلك.")}
        >
          <Segmented
            value={size}
            options={[
              { value: "", label: t("(default)", "(افتراضي)") },
              { value: "small", label: "small" },
              { value: "medium", label: "medium" },
              { value: "large", label: "large" },
              { value: "unrestricted", label: "unrestricted" },
            ]}
            onChange={(v) => clearableStr("workflowSizeGuideline", v)}
          />
        </Row>
        <Row
          title={t("Skip the usage warning", "تخطّي تحذير الاستهلاك")}
          desc={t("Don't prompt before a workflow spawns many subagents (skips the token-cost confirmation). Key: skipWorkflowUsageWarning.", "لا تطلب تأكيدًا قبل أن يُنشئ سير العمل وكلاء فرعيين كثيرين (يتخطّى تأكيد تكلفة الرموز). المفتاح: skipWorkflowUsageWarning.")}
        >
          <Toggle on={settings.skipWorkflowUsageWarning === true} onChange={(v) => setBool("skipWorkflowUsageWarning", v)} />
        </Row>
        <Row
          title={t("Max concurrent agents", "الحد الأقصى للوكلاء المتزامنين")}
          desc={t("Env CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS (1–256). Blank = Claude Code's default (up to 16, fewer on limited CPUs). Needs v2.1.269+.", "المتغيّر CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS (1–256). فارغ = الإعداد الافتراضي لـ Claude Code (حتى 16، وأقل على المعالجات المحدودة). يتطلّب v2.1.269+.")}
        >
          <input
            type="number" min={1} max={256} className="input-sm" style={{ width: 110 }}
            placeholder={t("auto (≤16)", "تلقائي (≤16)")}
            value={envVal("CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS")}
            onChange={(e) => setEnv("CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS", e.target.value)}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title={t("Subagents", "الوكلاء الفرعيون")} sub={t("Agent tool & workflow agents", "أداة Agent ووكلاء سير العمل")}>
        <Row
          title={t("Default subagent model", "نموذج الوكيل الفرعي الافتراضي")}
          desc={t("Env CLAUDE_CODE_SUBAGENT_MODEL — the model subagents use when their own definition doesn't pin one. (inherit) = use the main model.", "المتغيّر CLAUDE_CODE_SUBAGENT_MODEL — النموذج الذي يستخدمه الوكلاء الفرعيون حين لا يُثبّت تعريفهم نموذجًا. (موروث) = استخدام النموذج الرئيسي.")}
        >
          <Select
            value={envVal("CLAUDE_CODE_SUBAGENT_MODEL")}
            options={meta.models}
            allowEmpty={t("(inherit)", "(موروث)")}
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_MODEL", v)}
          />
        </Row>
        <Row
          title={t("Force that model on all subagents", "فرض ذلك النموذج على كل الوكلاء الفرعيين")}
          desc={t("Env CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 — overrides each subagent's and workflow agent's own model choice. Needs v2.1.257+.", "المتغيّر CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 — يتجاوز اختيار النموذج الخاص بكل وكيل فرعي ووكيل سير عمل. يتطلّب v2.1.257+.")}
        >
          <Toggle
            on={envVal("CLAUDE_CODE_SUBAGENT_MODEL_FORCE") === "1"}
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_MODEL_FORCE", v ? "1" : "")}
          />
        </Row>
        <Row
          title={t("Default subagent effort", "مستوى الجهد الافتراضي للوكيل الفرعي")}
          desc={t("Env CLAUDE_CODE_SUBAGENT_EFFORT — reasoning effort for subagents & workflow agents that don't set their own.", "المتغيّر CLAUDE_CODE_SUBAGENT_EFFORT — مستوى جهد التفكير للوكلاء الفرعيين ووكلاء سير العمل الذين لا يحدّدون مستواهم.")}
        >
          <Select
            value={envVal("CLAUDE_CODE_SUBAGENT_EFFORT")}
            options={EFFORTS}
            allowEmpty={t("(unset)", "(غير محدد)")}
            onChange={(v) => setEnv("CLAUDE_CODE_SUBAGENT_EFFORT", v)}
          />
        </Row>
        <Row
          title={t("Max concurrent subagents", "الحد الأقصى للوكلاء الفرعيين المتزامنين")}
          desc={t("Env CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS — session-wide cap for the Agent tool (default 20). Not enforced while ultracode is on. Needs v2.1.217+.", "المتغيّر CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS — حدّ على مستوى الجلسة لأداة Agent (الافتراضي 20). لا يُطبَّق أثناء تفعيل ultracode. يتطلّب v2.1.217+.")}
        >
          <input
            type="number" min={1} className="input-sm" style={{ width: 110 }}
            placeholder="20"
            value={envVal("CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS")}
            onChange={(e) => setEnv("CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS", e.target.value)}
          />
        </Row>
        <Row
          title={t("Max spawn depth", "أقصى عمق للتوليد")}
          desc={t("Env CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH — how deep subagents may nest (default 3). Caps nesting, not concurrency.", "المتغيّر CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH — إلى أي عمق يمكن أن يتداخل الوكلاء الفرعيون (الافتراضي 3). يحدّ من التداخل لا من التزامن.")}
        >
          <input
            type="number" min={1} className="input-sm" style={{ width: 110 }}
            placeholder="3"
            value={envVal("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH")}
            onChange={(e) => setEnv("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH", e.target.value)}
          />
        </Row>
        <Row
          title={t("Subagent prompt-cache TTL", "مدة بقاء التخزين المؤقت لموجّه الوكيل الفرعي")}
          desc={t("Settings key subagentPromptCacheTtl — how long subagent prompt caches live.", "مفتاح الإعدادات subagentPromptCacheTtl — كم تبقى ذاكرة موجّهات الوكيل الفرعي.")}
        >
          <Segmented
            value={ttl}
            options={[
              { value: "", label: t("(default)", "(افتراضي)") },
              { value: "5m", label: "5m" },
              { value: "1h", label: "1h" },
            ]}
            onChange={(v) => clearableStr("subagentPromptCacheTtl", v)}
          />
        </Row>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title={t("Ultrareview — /code-review ultra", "المراجعة الفائقة — /code-review ultra")} sub={t("cloud multi-agent review · no persistent settings", "مراجعة سحابية متعددة الوكلاء · بلا إعدادات دائمة")}>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--muted)" }}>
          <p style={{ margin: "0 0 8px" }}>
            {t("A deep multi-agent code review run on Anthropic's cloud. Launch it yourself with", "مراجعة عميقة متعددة الوكلاء للشيفرة تعمل على سحابة Anthropic. شغّلها بنفسك عبر")}
            {" "}<code className="mono">/code-review ultra</code>{t(" (or ", " (أو ")}<code className="mono">/code-review ultra &lt;PR#&gt;</code>{t(" for a GitHub PR);", " لطلب سحب على GitHub)؛")}
            {" "}<code className="mono">/ultrareview</code>{t(" is an alias. It can't be started from this panel or by Claude — it's user-triggered and billed.", " اسمٌ بديل له. لا يمكن بدؤها من هذه اللوحة ولا بواسطة Claude — فهي تبدأ بأمر المستخدم وتُحتسب على حسابه.")}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "var(--text)" }}>{t("Needs:", "يتطلّب:")}</b>{t(" a git repo · claude.ai sign-in (API-key-only auth won't do) · a ", " مستودع git · تسجيل دخول claude.ai (لا تكفي المصادقة بمفتاح API وحده) · عنوان ")}<code className="mono">github.com</code>{t(" remote for PR mode. Not available on Bedrock/Vertex/Foundry or ZDR/HIPAA/CMEK (those fall back to a local review). First 3 runs per account are free, then usage credits (~$5–$25 each).", " بعيد لوضع طلب السحب. غير متاح على Bedrock/Vertex/Foundry أو ZDR/HIPAA/CMEK (تتراجع تلك إلى مراجعة محلية). أول 3 عمليات لكل حساب مجانية، ثم رصيد استخدام (~$5–$25 لكل عملية).")}
          </p>
          <p style={{ margin: 0 }}>
            <b style={{ color: "var(--text)" }}>{t("Per-run flags", "رايات لكل تشغيل")}</b>{t(" (not settings):", " (ليست إعدادات):")}
            {" "}<code className="mono">--timeout &lt;min&gt;</code>{t(" (default 45) ·", " (الافتراضي 45) ·")}
            {" "}<code className="mono">--post</code> / <code className="mono">--no-post</code>{t(" (default no-post; posts a plain comment from your GitHub account) ·", " (الافتراضي no-post؛ ينشر تعليقًا عاديًا من حساب GitHub الخاص بك) ·")}
            {" "}<code className="mono">--trust-workspace</code> · <code className="mono">--json</code>{t(". Diff limits (500 files / 8,000 lines) aren't configurable.", ". حدود الفرق (500 ملف / 8,000 سطر) غير قابلة للتعديل.")}
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <div className="warn" style={{ marginTop: 4 }}>
        <span className="i">ℹ</span>
        {t("Env-block knobs (CLAUDE_CODE_*) take effect in newly started sessions; project-scoped env values only apply in a trusted project. The Settings → Environment card lists the full env block.", "مفاتيح كتلة البيئة (CLAUDE_CODE_*) تسري في الجلسات المُنشأة حديثًا؛ وقيم البيئة على مستوى المشروع لا تُطبَّق إلا في مشروع موثوق. تَعرض بطاقة الإعدادات ← البيئة كتلة البيئة الكاملة.")}
      </div>
    </div>
  );
}

function Reco({ reco, current, onUse, match }: { reco: number; current: string; onUse: () => void; match: boolean }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5 }}>
        <b>{reco}</b>
        <span style={{ color: "var(--muted)" }}>{t(" · now ", " · الآن ")}{current || t("auto", "تلقائي")}</span>
      </span>
      {match ? (
        <span className="badge allow" title={t("Current value matches the recommendation", "القيمة الحالية تطابق التوصية")}>{t("✓ set", "✓ مضبوط")}</span>
      ) : (
        <button className="btn ghost sm" onClick={onUse}>{t("Use", "استخدم")} {reco}</button>
      )}
    </div>
  );
}
