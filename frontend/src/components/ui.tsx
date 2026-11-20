import React, { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";

const CONFIRM_SECONDS = 30;

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      type="button"
    />
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label ?? o.value}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value, options, onChange, allowEmpty,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowEmpty?: string;
}) {
  return (
    <select className="input-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export function Row({
  title, desc, children,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="label">
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
      <div className="control">{children}</div>
    </div>
  );
}

export function Card({
  title, sub, right, children,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      {(title || right) && (
        <header>
          {title && <h2>{title}</h2>}
          {sub && <span className="sub">{sub}</span>}
          {right && <div style={{ marginInlineStart: "auto" }}>{right}</div>}
        </header>
      )}
      <div className="body">{children}</div>
    </section>
  );
}

export function Chips({
  values, onRemove, suggestions, onAdd,
}: {
  values: string[];
  onRemove: (v: string) => void;
  suggestions?: string[];
  onAdd?: (v: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const avail = (suggestions ?? []).filter((s) => !values.includes(s));
  return (
    <div className="chips">
      {values.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" aria-label={`remove ${v}`} onClick={() => onRemove(v)}>×</button>
        </span>
      ))}
      {onAdd && !adding && (
        <span className="chip add" onClick={() => setAdding(true)}>+ {t("add", "إضافة")}</span>
      )}
      {onAdd && adding && (
        <span style={{ display: "inline-flex", gap: 4 }}>
          {avail.length > 0 ? (
            <select
              autoFocus
              className="input-sm"
              value=""
              onChange={(e) => { if (e.target.value) { onAdd(e.target.value); setAdding(false); } }}
              style={{ width: 160 }}
            >
              <option value="">{t("choose…", "اختر…")}</option>
              {avail.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">{t("custom…", "مخصّص…")}</option>
            </select>
          ) : (
            <input
              autoFocus
              type="text"
              style={{ width: 160 }}
              value={text}
              placeholder={t("value + Enter", "القيمة + Enter")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); setAdding(false); }
                if (e.key === "Escape") setAdding(false);
              }}
              onBlur={() => setAdding(false)}
            />
          )}
        </span>
      )}
    </div>
  );
}

export function Modal({
  title, children, onClose, footer, width = 440,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div
        className="cmdk"
        style={{ width, marginTop: "4vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
          {title}
        </header>
        <div style={{ padding: 16 }}>{children}</div>
        {footer && (
          <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, size: number): { slice: T[]; pageCount: number; page: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pageCount - 1);
  return { slice: items.slice(p * size, p * size + size), pageCount, page: p };
}

export function Pager({
  page, pageCount, onPage, total, unit,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total?: number;
  unit?: string;
}) {
  const t = useT();
  if (pageCount <= 1 && !total) return null;
  return (
    <div className="pager">
      <button className="btn ghost sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹ {t("Prev", "السابق")}</button>
      <span className="pginfo">
        {t("Page", "صفحة")} {page + 1} / {pageCount}{total !== undefined ? ` · ${total} ${unit ?? ""}` : ""}
      </span>
      <button className="btn ghost sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>{t("Next", "التالي")} ›</button>
    </div>
  );
}

function ConfirmDialog({
  msg, danger, onDone,
}: {
  msg: string;
  danger?: boolean;
  onDone: (v: boolean) => void;
}) {
  const t = useT();
  const [left, setLeft] = useState(CONFIRM_SECONDS);
  const done = useRef(false);
  const finish = (v: boolean) => { if (!done.current) { done.current = true; onDone(v); } };
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { window.clearInterval(id); finish(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal
      title={t("Confirm", "تأكيد")}
      onClose={() => finish(false)}
      footer={
        <>
          <button className="btn ghost" onClick={() => finish(false)}>{t("Cancel", "إلغاء")}</button>
          <button className={danger ? "btn danger" : "btn primary"} onClick={() => finish(true)}>
            {t("Confirm", "تأكيد")} ({left}{t("s", "ث")})
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{msg}</div>
      <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 11.5 }}>
        {t("Auto-confirms in", "يُؤكَّد تلقائيًا خلال")} {left}{t("s", "ث")} {t("if you don’t choose.", "إن لم تختر.")}
      </div>
    </Modal>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ msg: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = (msg: string, danger = false) =>
    new Promise<boolean>((resolve) => setState({ msg, danger, resolve }));
  const node = state ? (
    <ConfirmDialog
      msg={state.msg}
      danger={state.danger}
      onDone={(v) => { state.resolve(v); setState(null); }}
    />
  ) : null;
  return { confirm, node };
}
