import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { MemoryEntry, MemoryGroup } from "../lib/types";
import { Card, Modal, Pager, paginate, Row, useConfirm } from "../components/ui";
import { useT } from "../lib/i18n";

const PAGE = 12;
type FlatEntry = { group: MemoryGroup; e: MemoryEntry };

export function MemoryPage() {
  const { toast } = useStore();
  const t = useT();
  const { confirm, node: confirmNode } = useConfirm();
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"entries" | "index">("entries");
  const [edit, setEdit] = useState<{ path: string; title: string; content: string } | null>(null);

  const load = async () => { setLoading(true); const r = await api.getMemory(); setGroups(r.groups); setLoading(false); };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(0); }, [q]);

  const save = async () => {
    if (!edit) return;
    try { await api.saveMemory(edit.path, edit.content); toast(t("Memory saved (backed up)", "تم حفظ الذاكرة (مع نسخة احتياطية)"), "ok"); setEdit(null); await load(); }
    catch (e: any) { toast(t("Save failed: ", "فشل الحفظ: ") + e.message, "err"); }
  };
  const del = async (path: string, name: string) => {
    if (!(await confirm(t(`Delete memory “${name}”? Its index line is removed too. A backup is written first, so it’s recoverable.`, `حذف الذاكرة “${name}”؟ سيُحذف سطرها في الفهرس أيضًا. تُكتب نسخة احتياطية أولًا، لذا يمكن استرجاعها.`), true))) return;
    try { await api.deleteMemory(path); toast(t(`Deleted “${name}” (backed up)`, `تم حذف “${name}” (مع نسخة احتياطية)`), "ok"); await load(); }
    catch (e: any) { toast(t("Delete failed: ", "فشل الحذف: ") + e.message, "err"); }
  };

  const ql = q.trim().toLowerCase();
  const flat: FlatEntry[] = useMemo(() => {
    const all = groups.flatMap((g) => g.entries.map((e) => ({ group: g, e })));
    return ql
      ? all.filter(({ group, e }) =>
          e.name.toLowerCase().includes(ql) || e.description.toLowerCase().includes(ql) ||
          e.body.toLowerCase().includes(ql) || group.project.toLowerCase().includes(ql))
      : all;
  }, [groups, ql]);

  const { slice, pageCount, page: p } = paginate(flat, page, PAGE);

  return (
    <div className="main-inner">
      <div className="page-head">
        <h1>{t("Memory", "الذاكرة")}</h1>
        <p>{t("Persistent facts under ", "حقائق دائمة ضمن ")}<code className="mono">~/.claude/projects/*/memory</code>{t(". Improve (edit) or delete entries — every change is backed up.", ". حسّن (حرّر) المدخلات أو احذفها — كل تغيير يُحفظ بنسخة احتياطية.")}</p>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === "entries" ? "on" : ""} onClick={() => setTab("entries")}>{t("Entries", "المدخلات")}{loading ? "" : ` (${flat.length})`}</button>
        <button className={tab === "index" ? "on" : ""} onClick={() => setTab("index")}>{t("Index", "الفهرس")}{loading ? "" : ` (${groups.length})`}</button>
      </div>

      {tab === "index" && (
        <Card title={t("Indexes", "الفهارس")} sub={t(`${groups.length} project MEMORY.md file(s)`, `${groups.length} من ملفات MEMORY.md للمشاريع`)}>
          {groups.length === 0 && <div className="empty-state">{t("No memory index files.", "لا توجد ملفات فهرس للذاكرة.")}</div>}
          {groups.map((g) => (
            <Row key={g.dir} title={<span className="mono" style={{ fontSize: 12 }}>{g.project}</span>} desc={t(`${g.entries.length} entr${g.entries.length === 1 ? "y" : "ies"}`, `${g.entries.length} مدخل`)}>
              <button className="btn ghost sm" onClick={() => setEdit({ path: g.indexPath, title: t("MEMORY.md (index)", "MEMORY.md (الفهرس)"), content: g.index })}>{t("Edit index", "تحرير الفهرس")}</button>
            </Row>
          ))}
        </Card>
      )}

      {tab === "entries" && (
      <>
      <div style={{ margin: "0 0 12px" }}>
        <input type="text" placeholder={t("Search memory by name, description, body, or project…", "ابحث في الذاكرة بالاسم أو الوصف أو المحتوى أو المشروع…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 440 }} />
      </div>

      <Card title={t("Entries", "المدخلات")} sub={loading ? "…" : `${flat.length}${ql ? t(" match", " مطابقة") : ""}`}>
        {loading && <div className="loading">{t("Loading…", "جارٍ التحميل…")}</div>}
        {!loading && flat.length === 0 && <div className="empty-state">{ql ? t("No memory matches.", "لا توجد ذاكرة مطابقة.") : t("No memory entries found.", "لم يُعثر على مدخلات ذاكرة.")}</div>}
        {slice.map(({ group, e }) => (
          <div className="mem-entry" key={e.path}>
            <div className="h">
              <span className="nm">{e.name}</span>
              {e.type && <span className="badge neutral">{e.type}</span>}
              <span className="mono" style={{ color: "var(--muted)", fontSize: 10.5 }}>{group.project}</span>
              <span style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setEdit({ path: e.path, title: e.file, content: e.body })}>{t("Improve", "تحسين")}</button>
                <button className="btn danger sm" onClick={() => del(e.path, e.name)}>{t("Delete", "حذف")}</button>
              </span>
            </div>
            {e.description && <div className="bd" style={{ color: "var(--muted)" }}>{e.description}</div>}
          </div>
        ))}
        <Pager page={p} pageCount={pageCount} onPage={setPage} total={flat.length} unit={t("entries", "مدخلات")} />
      </Card>
      </>
      )}

      {edit && (
        <Modal
          title={edit.title}
          width={640}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEdit(null)}>{t("Cancel", "إلغاء")}</button>
              <button className="btn primary" onClick={save}>{t("Save to disk", "حفظ إلى القرص")}</button>
            </>
          }
        >
          <div className="warn" style={{ marginBottom: 10 }}><span className="i">ℹ</span>{t("Editing the file body. A timestamped backup is written before saving.", "تحرير محتوى الملف. تُكتب نسخة احتياطية مؤرَّخة قبل الحفظ.")}</div>
          <textarea rows={16} value={edit.content} spellCheck={false} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
