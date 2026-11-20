import { useState } from "react";
import { useStore } from "../lib/store";
import type { PermList } from "../lib/types";

const META: Record<PermList, { label: string; badge: string; desc: string }> = {
  allow: { label: "Allow", badge: "allow", desc: "runs without a prompt" },
  ask:   { label: "Ask",   badge: "ask",   desc: "prompts every time" },
  deny:  { label: "Deny",  badge: "deny",  desc: "hard-blocked in all modes" },
};
const ORDER: PermList[] = ["allow", "ask", "deny"];

export function PermissionsPage() {
  const { settings, patch } = useStore();
  const [q, setQ] = useState("");
  if (!settings) return null;
  const perms = settings.permissions ?? {};
  const filter = (rules: string[]) => {
    const t = q.trim().toLowerCase();
    return t ? rules.filter((r) => r.toLowerCase().includes(t)) : rules;
  };

  const setList = (list: PermList, next: string[]) =>
    patch((s) => { s.permissions = { ...(s.permissions ?? {}) }; (s.permissions as any)[list] = next; });

  const add = (list: PermList, rule: string) => {
    const cur = perms[list] ?? [];
    if (cur.includes(rule)) return;
    setList(list, [...cur, rule]);
  };
  const remove = (list: PermList, rule: string) =>
    setList(list, (perms[list] ?? []).filter((r) => r !== rule));
  const move = (from: PermList, to: PermList, rule: string) => {
    patch((s) => {
      const p = { ...(s.permissions ?? {}) } as any;
      p[from] = (p[from] ?? []).filter((r: string) => r !== rule);
      if (!(p[to] ?? []).includes(rule)) p[to] = [...(p[to] ?? []), rule];
      s.permissions = p;
    });
  };

  return (
    <div className="main-inner" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <h1>Permissions</h1>
        <p>Rule syntax e.g. <code className="mono">Bash(git *)</code>, <code className="mono">Read</code>, <code className="mono">Edit(src/**)</code>. Deny always wins; it is your safety net.</p>
      </div>

      <div className="warn">
        <span className="i">⚠</span>
        <span><b>Deny</b> and <b>Ask</b> are protective. Removing a deny rule (e.g. <code className="mono">Bash(shutdown:*)</code>) lets that command run even in bypass mode. Changes are staged — review before Save.</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input type="text" placeholder="Search rules across allow / ask / deny…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 440 }} />
      </div>

      <div className="perm-cols">
        {ORDER.map((list) => (
          <PermColumn
            key={list}
            list={list}
            rules={filter(perms[list] ?? [])}
            total={(perms[list] ?? []).length}
            onAdd={(r) => add(list, r)}
            onRemove={(r) => remove(list, r)}
            onMove={(to, r) => move(list, to, r)}
          />
        ))}
      </div>
    </div>
  );
}

function PermColumn({
  list, rules, total, onAdd, onRemove, onMove,
}: {
  list: PermList;
  rules: string[];
  total: number;
  onAdd: (r: string) => void;
  onRemove: (r: string) => void;
  onMove: (to: PermList, r: string) => void;
}) {
  const [text, setText] = useState("");
  const m = META[list];
  const others = ORDER.filter((l) => l !== list);
  return (
    <div className="perm-col">
      <header>
        <span className={"badge " + m.badge}>{m.label}</span>
        <span className="sub" style={{ color: "var(--muted)", fontSize: 11 }}>{m.desc}</span>
        <span className="n">{rules.length === total ? total : `${rules.length}/${total}`}</span>
      </header>
      <div className="list">
        {rules.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>No rules.</div>}
        {rules.map((r) => (
          <div className="rule" key={r}>
            <span className="txt">{r}</span>
            <span className="acts">
              {others.map((o) => (
                <button key={o} title={`move to ${META[o].label}`} onClick={() => onMove(o, r)}>
                  →{META[o].label[0]}
                </button>
              ))}
              <button title="remove" onClick={() => onRemove(r)}>×</button>
            </span>
          </div>
        ))}
      </div>
      <div className="add-rule">
        <input
          type="text" className="mono" placeholder={list === "allow" ? "Bash(npm run test:*)" : "Rule(pattern)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }}
        />
        <button className="btn sm" disabled={!text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }}>+</button>
      </div>
    </div>
  );
}
