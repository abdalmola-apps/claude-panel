import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { tildePath } from "../lib/util";
import { Card, Row, Segmented, Select, Toggle } from "../components/ui";
import { useT } from "../lib/i18n";

const MODE_LABEL: Record<string, string> = {
  default: "default",
  plan: "plan",
  acceptEdits: "acceptEdits",
  bypassPermissions: "bypass",
  dontAsk: "dontAsk",
};

export function SettingsPage() {
  const { settings, patch, meta, autoApply, scope, scopes } = useStore();
  const t = useT();
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
        <h1>{t("Settings", "الإعدادات")} {isProject && <span className="badge ask" style={{ verticalAlign: "middle" }}>{active?.project} · {active?.kind}</span>}</h1>
        <p>
          {t("Editing", "تحرير")} <code className="mono">{tildePath(scopePath, meta.paths?.home)}</code>.
          {isProject ? t(" Project settings override your global ones for that project. ", " تتجاوز إعدادات المشروع إعداداتك العامة لهذا المشروع. ") : " "}
          {autoApply
            ? t("Auto-apply is on — edits save to disk automatically (backed up first).", "التطبيق التلقائي مُفعَّل — تُحفظ التعديلات على القرص تلقائيًا (بعد أخذ نسخة احتياطية أولًا).")
            : t("Changes stage as a draft — nothing hits disk until you Save.", "تُسجَّل التغييرات كمسودة — لا يُكتب شيء على القرص حتى تحفظ.")}
        </p>
      </div>

      <Card title={t("Core", "الأساسية")}>
        <Row title={t("Permission mode", "وضع الصلاحيات")} desc={t("How tool calls are gated. bypass = no prompts (your CLAUDE.md stop-and-confirm still applies).", "كيفية ضبط استدعاءات الأدوات. bypass = بلا مطالبات (تبقى قاعدة التوقّف والتأكيد في CLAUDE.md سارية).")}>
          <Segmented
            value={perms.defaultMode ?? "default"}
            options={meta.modes.map((m) => ({ value: m, label: MODE_LABEL[m] ?? m }))}
            onChange={(v) => patch((s) => { s.permissions = { ...(s.permissions ?? {}), defaultMode: v }; })}
          />
        </Row>
        <Row title={t("Model", "النموذج")} desc={t("Default model for the session.", "النموذج الافتراضي للجلسة.")}>
          <Select
            value={settings.model ?? ""}
            options={meta.models}
            allowEmpty={t("(unset)", "(غير محدد)")}
            onChange={(v) => patch((s) => { if (v) s.model = v; else delete s.model; })}
          />
        </Row>
        <Row title={t("Effort level", "مستوى الجهد")} desc={t("Reasoning effort.", "جهد الاستدلال.")}>
          <Select
            value={settings.effortLevel ?? ""}
            options={meta.efforts}
            allowEmpty={t("(unset)", "(غير محدد)")}
            onChange={(v) => patch((s) => { if (v) s.effortLevel = v; else delete s.effortLevel; })}
          />
        </Row>
      </Card>

      <Card title={t("Auto-compact", "الضغط التلقائي")} sub={t("when the context window fills", "عند امتلاء نافذة السياق")}>
        <Row title={t("Enable auto-compact", "تفعيل الضغط التلقائي")} desc={t("Default is on. Off also disables idle compaction; /compact still works.", "التفعيل افتراضي. الإيقاف يُعطِّل أيضًا الضغط عند الخمول؛ لا يزال /compact يعمل.")}>
          <Toggle
            on={settings.autoCompactEnabled !== false}
            onChange={(v) => patch((s) => { s.autoCompactEnabled = v; })}
          />
        </Row>
        <Row title={t("Trigger threshold", "عتبة التشغيل")} desc={t("Percentage of the window at which it fires. Can only lower the model default.", "النسبة المئوية من النافذة التي يبدأ عندها. يمكن فقط خفض القيمة الافتراضية للنموذج.")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" min={1} max={100} className="input-sm" style={{ width: 90 }}
              value={pct}
              placeholder={t("model default", "القيمة الافتراضية للنموذج")}
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
        <Row title={t("Auto-compact window", "نافذة الضغط التلقائي")} desc={t("Token budget the % applies to (caps at the model's real context window).", "ميزانية الرموز التي تنطبق عليها النسبة (محدودة بنافذة السياق الفعلية للنموذج).")}>
          <input
            type="number" step={10000} className="input-sm" style={{ width: 150 }}
            value={settings.autoCompactWindow ?? ""}
            placeholder={t("per-model default", "الافتراضي لكل نموذج")}
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
  const t = useT();
  const [nk, setNk] = useState("");
  const [nv, setNv] = useState("");
  const keys = Object.keys(env);
  return (
    <Card title={t("Environment variables", "متغيرات البيئة")} sub={t(`${keys.length} set`, `${keys.length} مُحدَّد`)}>
      {keys.length === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>{t("None set.", "لا شيء مُحدَّد.")}</div>}
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
          <input type="text" className="input-sm mono" style={{ width: 220 }} placeholder={t("KEY", "المفتاح")} value={nk} onChange={(e) => setNk(e.target.value)} />
          <input type="text" className="input-sm mono" style={{ width: 180 }} placeholder={t("value", "القيمة")} value={nv} onChange={(e) => setNv(e.target.value)} />
          <button
            className="btn sm"
            disabled={!nk.trim()}
            onClick={() => { patch((s) => { s.env = { ...(s.env ?? {}) }; s.env[nk.trim()] = nv; }); setNk(""); setNv(""); }}
          >{t("+ add", "+ إضافة")}</button>
        </div>
      </div>
    </Card>
  );
}

function RawCard() {
  const { settings, patch, toast } = useStore();
  const t = useT();
  const [open, setOpen] = useState(false);
  const text = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const [draft, setDraft] = useState(text);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card
      title={t("Raw settings.json", "settings.json الخام")}
      right={<button className="btn ghost sm" onClick={() => { setDraft(JSON.stringify(settings, null, 2)); setOpen((o) => !o); }}>{open ? t("Hide", "إخفاء") : t("Edit raw", "تحرير الخام")}</button>}
    >
      {!open ? (
        <div style={{ color: "var(--muted)", padding: "4px 0" }}>{t("Full-object escape hatch for keys this UI doesn’t surface. Validated before it’s applied to the draft.", "مَخرج للكائن الكامل للمفاتيح التي لا تُظهرها هذه الواجهة. يُتحقَّق منها قبل تطبيقها على المسودة.")}</div>
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
                  toast(t("Applied to draft — review and Save", "طُبِّق على المسودة — راجِع ثم احفظ"), "info");
                  setOpen(false);
                } catch (e: any) { setErr(t("Invalid JSON: ", "JSON غير صالح: ") + e.message); }
              }}
            >{t("Apply to draft", "تطبيق على المسودة")}</button>
            <span style={{ color: "var(--muted)", alignSelf: "center", fontSize: 11 }}>{t("Then Save in the top bar to write it.", "ثم احفظ من الشريط العلوي لكتابته.")}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
