import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  ico?: string;
  run: () => void;
}

export function CommandPalette({
  commands, onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(t) || c.hint?.toLowerCase().includes(t)
    );
  }, [q, commands]);

  useEffect(() => { setSel(0); }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[sel]?.run(); onClose(); }
    else if (e.key === "Escape") { onClose(); }
  };

  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          placeholder={t("Jump to a section, agent, or action…", "انتقل إلى قسم أو وكيل أو إجراء…")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="results">
          {filtered.length === 0 && <div className="empty">{t("No matches", "لا نتائج")}</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={"res" + (i === sel ? " sel" : "")}
              onMouseEnter={() => setSel(i)}
              onClick={() => { c.run(); onClose(); }}
            >
              <span className="ico">{c.ico ?? "›"}</span>
              <span>{c.label}</span>
              {c.hint && <small>{c.hint}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
