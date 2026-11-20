import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { CatalogEntry, CliResult } from "../lib/types";
import { Card, Pager, paginate, Row, Toggle, useConfirm } from "../components/ui";
import { useT } from "../lib/i18n";

const PAGE = 10;

export function PluginsPage() {
  const t = useT();
  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>{t("Plugins", "الإضافات")}</h1>
        <p>{t("Enable or disable installed plugins, install from a marketplace, and manage marketplace sources.", "فعّل أو عطّل الإضافات المثبّتة، وثبّت إضافات من متجر، وأدِر مصادر المتاجر.")}</p>
      </div>
      <PluginsCard />
      <InstallCard />
      <MarketplacesCard />
    </div>
  );
}

function PluginsCard() {
  const t = useT();
  const { settings, patch, reload, toast } = useStore();
  const { confirm, node } = useConfirm();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const plugins = settings?.enabledPlugins ?? {};
  const keys = Object.keys(plugins).filter((k) => k.toLowerCase().includes(q.trim().toLowerCase()));
  const total = Object.keys(plugins).length;
  const { slice, pageCount, page: p } = paginate(keys, page, PAGE);

  const uninstall = async (k: string) => {
    if (!(await confirm(t(`Uninstall “${k}”? This removes the plugin from disk via the claude CLI (disable just turns it off — this deletes it).`, `إلغاء تثبيت “${k}”؟ هذا يزيل الإضافة من القرص عبر claude CLI (التعطيل يوقفها فقط — أمّا هذا فيحذفها).`), true))) return;
    setBusy(k);
    try {
      const r = await api.uninstallPlugin(k);
      toast(r.ok ? t(`Uninstalled ${k}`, `تم إلغاء تثبيت ${k}`) : t(`Exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`, `خروج ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`), r.ok ? "ok" : "err");
      await reload();
    } catch (e: any) { toast(t("Failed: ", "فشل: ") + e.message, "err"); }
    finally { setBusy(null); }
  };

  return (
    <Card
      title={t("Installed plugins", "الإضافات المثبّتة")}
      sub={t(`${Object.values(plugins).filter(Boolean).length}/${total} enabled`, `${Object.values(plugins).filter(Boolean).length}/${total} مُفعّلة`)}
      right={<input type="text" placeholder={t("Search…", "بحث…")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 160 }} />}
    >
      {total === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>{t("No plugins configured.", "لا توجد إضافات مُهيّأة.")}</div>}
      {slice.map((k) => {
        const [name, mkt] = k.split("@");
        return (
          <div className="plug" key={k}>
            <div className="meta">
              <div className="nm">{name}</div>
              <div className="src">{mkt ? `@${mkt}` : ""}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 11 }}>
                {plugins[k] ? t("on", "مُفعّل") : t("off", "مُعطّل")}
                <Toggle on={!!plugins[k]} onChange={(v) => patch((s) => { s.enabledPlugins = { ...(s.enabledPlugins ?? {}) }; s.enabledPlugins[k] = v; })} />
              </label>
              <button className="btn danger sm" disabled={busy === k} onClick={() => uninstall(k)}>{busy === k ? "…" : t("Uninstall", "إلغاء التثبيت")}</button>
            </div>
          </div>
        );
      })}
      <Pager page={p} pageCount={pageCount} onPage={setPage} />
      {node}
    </Card>
  );
}

function InstallCard() {
  const t = useT();
  const { reload, toast } = useStore();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [spec, setSpec] = useState("");
  const [mkt, setMkt] = useState("");
  const [result, setResult] = useState<CliResult | null>(null);

  const loadCatalog = () => api.pluginCatalog().then((r) => setCatalog(r.catalog)).catch(() => {});
  useEffect(() => { loadCatalog(); }, []);

  const run = async (label: string, fn: () => Promise<CliResult>) => {
    setBusy(label); setResult(null);
    try {
      const r = await fn();
      setResult(r);
      toast(r.ok ? t("Done", "تم") : t(`Exited ${r.code}`, `خروج ${r.code}`), r.ok ? "ok" : "err");
      await reload();
      await loadCatalog();
    } catch (e: any) {
      toast(t("Failed: ", "فشل: ") + e.message, "err");
    } finally { setBusy(null); }
  };

  return (
    <Card title={t("Add & install", "الإضافة والتثبيت")} sub={t("add a marketplace, then install its plugins — runs the claude CLI, then reloads", "أضِف متجرًا، ثم ثبّت إضافاته — يشغّل claude CLI ثم يعيد التحميل")}>
      <div className="row" style={{ paddingTop: 2 }}>
        <div className="label"><div className="t">{t("① Add a marketplace", "① أضِف متجرًا")}</div><div className="d">{t("a git repo, ", "مستودع git، ")}<code className="mono">owner/repo</code>{t(", or a local path", "، أو مسار محلي")}</div></div>
        <div className="control" style={{ gap: 6 }}>
          <input type="text" className="mono input-sm" style={{ width: 240 }} placeholder="github.com/org/repo or /path" value={mkt} onChange={(e) => setMkt(e.target.value)} />
          <button className="btn primary sm" disabled={!!busy || !mkt.trim()} onClick={() => run("mkt", () => api.addMarketplace(mkt.trim()))}>{t("Add", "إضافة")}</button>
        </div>
      </div>

      <div style={{ padding: "10px 0 2px", color: "var(--muted)", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>{t("② Install a plugin", "② ثبّت إضافة")}</div>
      {catalog.map((c) => (
        <div key={c.marketplace} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
            <span className="badge neutral">{c.sourceType}</span>
            <span className="mono" style={{ fontWeight: 600 }}>{c.marketplace}</span>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{c.location}</span>
          </div>
          {!c.readable && <div style={{ color: "var(--muted)", fontSize: 11.5, paddingInlineStart: 4 }}>{t("Install by spec below (remote marketplace — plugin list not enumerated here).", "ثبّت عبر المواصفة أدناه (متجر بعيد — قائمة الإضافات غير مُعدّدة هنا).")}</div>}
          {c.plugins.map((p) => (
            <div className="plug" key={p.key}>
              <div className="meta">
                <div className="nm">{p.name}</div>
                <div className="src">{p.description}</div>
              </div>
              {p.enabled
                ? <span className="badge allow">{t("installed", "مثبّتة")}</span>
                : <button className="btn sm" disabled={!!busy} onClick={() => run(p.key, () => api.installPlugin(p.key))}>
                    {busy === p.key ? t("installing…", "جارٍ التثبيت…") : t("Install", "تثبيت")}
                  </button>}
            </div>
          ))}
        </div>
      ))}

      <div className="row" style={{ borderBlockStart: "1px solid var(--border)", marginTop: 6 }}>
        <div className="label"><div className="t">{t("…or install by spec", "…أو ثبّت عبر المواصفة")}</div><div className="d">{t("e.g. ", "مثال: ")}<code className="mono">test-data-cleaner@clouderps-ops</code></div></div>
        <div className="control" style={{ gap: 6 }}>
          <input type="text" className="mono input-sm" style={{ width: 240 }} placeholder="name@marketplace" value={spec} onChange={(e) => setSpec(e.target.value)} />
          <button className="btn primary sm" disabled={!!busy || !/^[\w.-]+@[\w.-]+$/.test(spec)} onClick={() => run("spec", () => api.installPlugin(spec.trim()))}>{t("Install", "تثبيت")}</button>
        </div>
      </div>

      {result && (
        <div className="warn" style={{ marginTop: 10, background: result.ok ? "var(--allow-bg)" : "var(--deny-bg)", borderColor: result.ok ? "var(--allow)" : "var(--deny)", display: "block" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.ok ? t("✓ success", "✓ نجاح") : t(`✗ exit ${result.code}`, `✗ خروج ${result.code}`)}</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5, maxHeight: 160, overflow: "auto" }}>{(result.stdout + "\n" + result.stderr).trim() || t("(no output)", "(لا مُخرجات)")}</pre>
        </div>
      )}
    </Card>
  );
}

function MarketplacesCard() {
  const t = useT();
  const { settings, reload, toast } = useStore();
  const { confirm, node } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const mkts = settings?.extraKnownMarketplaces ?? {};
  const keys = Object.keys(mkts);

  const remove = async (name: string) => {
    if (!(await confirm(t(`Remove marketplace “${name}”? Plugins installed from it may stop resolving. Uninstall those first if unsure.`, `إزالة المتجر “${name}”؟ قد تتوقّف الإضافات المثبّتة منه عن العمل. ألغِ تثبيتها أولًا إن لم تكن متأكدًا.`), true))) return;
    setBusy(name);
    try {
      const r = await api.removeMarketplace(name);
      toast(r.ok ? t(`Removed ${name}`, `تمت إزالة ${name}`) : t(`Exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`, `خروج ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`), r.ok ? "ok" : "err");
      await reload();
    } catch (e: any) { toast(t("Failed: ", "فشل: ") + e.message, "err"); }
    finally { setBusy(null); }
  };

  return (
    <Card title={t("Marketplaces", "متاجر الإضافات")} sub={`${keys.length}`}>
      {keys.length === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>{t("None.", "لا شيء.")}</div>}
      {keys.map((k) => {
        const src = mkts[k]?.source ?? {};
        const where = src.source === "github" ? `github:${src.repo}` : src.source === "directory" ? src.path : JSON.stringify(src);
        return (
          <Row key={k} title={<span className="mono">{k}</span>} desc={<span className="mono">{where}</span>}>
            <span className="badge neutral">{src.source ?? "?"}</span>
            <button className="btn danger sm" disabled={busy === k} onClick={() => remove(k)}>{busy === k ? "…" : t("Remove", "إزالة")}</button>
          </Row>
        );
      })}
      {node}
    </Card>
  );
}
