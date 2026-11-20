import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Skill } from "../lib/types";
import { Card, Pager, paginate, useConfirm } from "../components/ui";
import { useT } from "../lib/i18n";

const PAGE = 12;

export function SkillsPage() {
  const { toast } = useStore();
  const tr = useT();
  const { confirm, node: confirmNode } = useConfirm();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "user" | "synced">("all");
  const [page, setPage] = useState(0);

  const load = async () => { setLoading(true); try { const r = await api.listSkills(); setSkills(r.skills); } catch { /**/ } setLoading(false); };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(0); }, [q, filter]);

  const del = async (s: Skill) => {
    if (!(await confirm(tr(`Delete skill “${s.name}”? The whole folder is backed up first, so it’s recoverable.`, `حذف المهارة “${s.name}”؟ يُنشأ نسخ احتياطي للمجلد بالكامل أولًا، لذا يمكن استرجاعها.`), true))) return;
    try { await api.deleteSkill(s.dir); toast(tr(`Deleted “${s.name}” (backed up)`, `تم حذف “${s.name}” (مع نسخة احتياطية)`), "ok"); await load(); }
    catch (e: any) { toast(tr("Delete failed: ", "فشل الحذف: ") + e.message, "err"); }
  };

  const t = q.trim().toLowerCase();
  const shown = useMemo(() => skills.filter((s) =>
    (filter === "all" || s.source === filter) &&
    (!t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t))
  ), [skills, filter, t]);

  const counts = { user: skills.filter((s) => s.source === "user").length, synced: skills.filter((s) => s.source === "synced").length };
  const { slice, pageCount, page: p } = paginate(shown, page, PAGE);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>{tr("Skills", "المهارات")}</h1>
        <p>{tr("Skills under ", "المهارات ضمن ")}<code className="mono">~/.claude/skills</code>. {counts.user}{tr(" user · ", " مستخدم · ")}{counts.synced}{tr(" synced. Synced skills are managed by sync settings; user skills can be removed here.", " متزامن. المهارات المتزامنة تُدار عبر إعدادات المزامنة، ومهارات المستخدم يمكن إزالتها من هنا.")}</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder={tr("Search skills by name or description…", "ابحث في المهارات بالاسم أو الوصف…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <div className="seg">
          {(["all", "user", "synced"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{tr(f, { all: "الكل", user: "المستخدم", synced: "متزامن" }[f])}</button>
          ))}
        </div>
      </div>

      <Card title={tr("Skills", "المهارات")} sub={loading ? "…" : `${shown.length} ${tr("shown", "معروضة")}`}>
        {loading && <div className="loading">{tr("Loading…", "جارٍ التحميل…")}</div>}
        {!loading && shown.length === 0 && <div className="empty-state">{tr("No skills", "لا توجد مهارات")}{t ? tr(" match", " مطابِقة") : ""}.</div>}
        {slice.map((s) => (
          <div className="plug" key={s.path}>
            <div className="meta">
              <div className="nm">{s.name} <span className={"badge " + (s.source === "user" ? "ask" : "neutral")} style={{ marginInlineStart: 6 }}>{tr(s.source, s.source === "user" ? "مستخدم" : "متزامن")}</span></div>
              <div className="src" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 560 }}>{s.description || <span style={{ opacity: 0.6 }}>{tr("no description", "لا يوجد وصف")}</span>}</div>
            </div>
            {s.source === "user"
              ? <button className="btn danger sm" onClick={() => del(s)}>{tr("Delete", "حذف")}</button>
              : <span className="badge neutral">{tr("managed", "مُدار")}</span>}
          </div>
        ))}
        <Pager page={p} pageCount={pageCount} onPage={setPage} />
      </Card>
      {confirmNode}
    </div>
  );
}
