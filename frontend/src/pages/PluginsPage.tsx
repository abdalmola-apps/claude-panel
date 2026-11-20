import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { CatalogEntry, CliResult } from "../lib/types";
import { Card, Pager, paginate, Row, Toggle, useConfirm } from "../components/ui";

const PAGE = 10;

export function PluginsPage() {
  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>Plugins</h1>
        <p>Enable or disable installed plugins, install from a marketplace, and manage marketplace sources.</p>
      </div>
      <PluginsCard />
      <InstallCard />
      <MarketplacesCard />
    </div>
  );
}

function PluginsCard() {
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
    if (!(await confirm(`Uninstall “${k}”? This removes the plugin from disk via the claude CLI (disable just turns it off — this deletes it).`, true))) return;
    setBusy(k);
    try {
      const r = await api.uninstallPlugin(k);
      toast(r.ok ? `Uninstalled ${k}` : `Exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`, r.ok ? "ok" : "err");
      await reload();
    } catch (e: any) { toast("Failed: " + e.message, "err"); }
    finally { setBusy(null); }
  };

  return (
    <Card
      title="Installed plugins"
      sub={`${Object.values(plugins).filter(Boolean).length}/${total} enabled`}
      right={<input type="text" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 160 }} />}
    >
      {total === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>No plugins configured.</div>}
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
                {plugins[k] ? "on" : "off"}
                <Toggle on={!!plugins[k]} onChange={(v) => patch((s) => { s.enabledPlugins = { ...(s.enabledPlugins ?? {}) }; s.enabledPlugins[k] = v; })} />
              </label>
              <button className="btn danger sm" disabled={busy === k} onClick={() => uninstall(k)}>{busy === k ? "…" : "Uninstall"}</button>
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
      toast(r.ok ? "Done" : `Exited ${r.code}`, r.ok ? "ok" : "err");
      await reload();
      await loadCatalog();
    } catch (e: any) {
      toast("Failed: " + e.message, "err");
    } finally { setBusy(null); }
  };

  return (
    <Card title="Add &amp; install" sub="add a marketplace, then install its plugins — runs the claude CLI, then reloads">
      <div className="row" style={{ paddingTop: 2 }}>
        <div className="label"><div className="t">① Add a marketplace</div><div className="d">a git repo, <code className="mono">owner/repo</code>, or a local path</div></div>
        <div className="control" style={{ gap: 6 }}>
          <input type="text" className="mono input-sm" style={{ width: 240 }} placeholder="github.com/org/repo or /path" value={mkt} onChange={(e) => setMkt(e.target.value)} />
          <button className="btn primary sm" disabled={!!busy || !mkt.trim()} onClick={() => run("mkt", () => api.addMarketplace(mkt.trim()))}>Add</button>
        </div>
      </div>

      <div style={{ padding: "10px 0 2px", color: "var(--muted)", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>② Install a plugin</div>
      {catalog.map((c) => (
        <div key={c.marketplace} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
            <span className="badge neutral">{c.sourceType}</span>
            <span className="mono" style={{ fontWeight: 600 }}>{c.marketplace}</span>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{c.location}</span>
          </div>
          {!c.readable && <div style={{ color: "var(--muted)", fontSize: 11.5, paddingInlineStart: 4 }}>Install by spec below (remote marketplace — plugin list not enumerated here).</div>}
          {c.plugins.map((p) => (
            <div className="plug" key={p.key}>
              <div className="meta">
                <div className="nm">{p.name}</div>
                <div className="src">{p.description}</div>
              </div>
              {p.enabled
                ? <span className="badge allow">installed</span>
                : <button className="btn sm" disabled={!!busy} onClick={() => run(p.key, () => api.installPlugin(p.key))}>
                    {busy === p.key ? "installing…" : "Install"}
                  </button>}
            </div>
          ))}
        </div>
      ))}

      <div className="row" style={{ borderBlockStart: "1px solid var(--border)", marginTop: 6 }}>
        <div className="label"><div className="t">…or install by spec</div><div className="d">e.g. <code className="mono">test-data-cleaner@clouderps-ops</code></div></div>
        <div className="control" style={{ gap: 6 }}>
          <input type="text" className="mono input-sm" style={{ width: 240 }} placeholder="name@marketplace" value={spec} onChange={(e) => setSpec(e.target.value)} />
          <button className="btn primary sm" disabled={!!busy || !/^[\w.-]+@[\w.-]+$/.test(spec)} onClick={() => run("spec", () => api.installPlugin(spec.trim()))}>Install</button>
        </div>
      </div>

      {result && (
        <div className="warn" style={{ marginTop: 10, background: result.ok ? "var(--allow-bg)" : "var(--deny-bg)", borderColor: result.ok ? "var(--allow)" : "var(--deny)", display: "block" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.ok ? "✓ success" : `✗ exit ${result.code}`}</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5, maxHeight: 160, overflow: "auto" }}>{(result.stdout + "\n" + result.stderr).trim() || "(no output)"}</pre>
        </div>
      )}
    </Card>
  );
}

function MarketplacesCard() {
  const { settings, reload, toast } = useStore();
  const { confirm, node } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const mkts = settings?.extraKnownMarketplaces ?? {};
  const keys = Object.keys(mkts);

  const remove = async (name: string) => {
    if (!(await confirm(`Remove marketplace “${name}”? Plugins installed from it may stop resolving. Uninstall those first if unsure.`, true))) return;
    setBusy(name);
    try {
      const r = await api.removeMarketplace(name);
      toast(r.ok ? `Removed ${name}` : `Exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 140)}`, r.ok ? "ok" : "err");
      await reload();
    } catch (e: any) { toast("Failed: " + e.message, "err"); }
    finally { setBusy(null); }
  };

  return (
    <Card title="Marketplaces" sub={`${keys.length}`}>
      {keys.length === 0 && <div style={{ color: "var(--muted)", padding: "8px 0" }}>None.</div>}
      {keys.map((k) => {
        const src = mkts[k]?.source ?? {};
        const where = src.source === "github" ? `github:${src.repo}` : src.source === "directory" ? src.path : JSON.stringify(src);
        return (
          <Row key={k} title={<span className="mono">{k}</span>} desc={<span className="mono">{where}</span>}>
            <span className="badge neutral">{src.source ?? "?"}</span>
            <button className="btn danger sm" disabled={busy === k} onClick={() => remove(k)}>{busy === k ? "…" : "Remove"}</button>
          </Row>
        );
      })}
      {node}
    </Card>
  );
}
