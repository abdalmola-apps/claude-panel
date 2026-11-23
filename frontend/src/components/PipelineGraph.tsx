import { useMemo, useRef, useState } from "react";

type PGType = "plan" | "build" | "check" | "signoff";
type PGRole = {
  key: string;
  title: string;
  agent: string;
  enabled: boolean;
  type: PGType;
  instruction: string;
};

const Arrow = ({ back = false, dashed = false }: { back?: boolean; dashed?: boolean }) => (
  <svg viewBox="0 0 44 12" className={"pg-arrow" + (dashed ? " dashed" : "")} aria-hidden="true">
    {back ? <path d="M44 6 H8 M14 2 L8 6 L14 10" /> : <path d="M0 6 H36 M30 2 L36 6 L30 10" />}
  </svg>
);

export function PipelineGraph({
  roles,
  maxCycles,
  agentNames,
  onPick,
  onMove,
}: {
  roles: PGRole[];
  maxCycles: number;
  agentNames: string[];
  onPick: (key: string) => void;
  onMove: (dragKey: string, targetKey: string | null, targetType: PGType) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null); // "node:<key>" | "lane:<type>"
  const st = useRef<{ key: string; x: number; y: number; active: boolean } | null>(null);
  const justDragged = useRef(false);

  const on = useMemo(() => roles.filter((r) => r.enabled && r.instruction.trim()), [roles]);
  const plan = on.filter((r) => r.type === "plan");
  const build = on.filter((r) => r.type === "build");
  const check = on.filter((r) => r.type === "check");
  const signoff = on.filter((r) => r.type === "signoff");
  const hasLoop = build.length + check.length > 0;

  if (!on.length) {
    return <div className="pg-empty">Enable at least one role to see the flow.</div>;
  }

  // resolve what is under the pointer into a drop target
  const hit = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const nodeEl = el?.closest("[data-pgkey]") as HTMLElement | null;
    if (nodeEl && nodeEl.dataset.pgkey && nodeEl.dataset.pgkey !== st.current?.key) {
      return { kind: "node" as const, key: nodeEl.dataset.pgkey, type: nodeEl.dataset.pgtype as PGType };
    }
    const laneEl = el?.closest("[data-pglane]") as HTMLElement | null;
    if (laneEl && laneEl.dataset.pglane) {
      return { kind: "lane" as const, key: null, type: laneEl.dataset.pglane as PGType };
    }
    return null;
  };

  const onDown = (key: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    st.current = { key, x: e.clientX, y: e.clientY, active: false };
  };
  const onMoveP = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    if (!s.active) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
      s.active = true;
      setDrag(s.key);
    }
    const t = hit(e.clientX, e.clientY);
    setOver(t ? (t.kind === "node" ? "node:" + t.key : "lane:" + t.type) : null);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = st.current;
    st.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (s && s.active) {
      const t = hit(e.clientX, e.clientY);
      if (t) onMove(s.key, t.key, t.type);
      justDragged.current = true;
      window.setTimeout(() => { justDragged.current = false; }, 0);
    }
    setDrag(null);
    setOver(null);
  };

  const node = (r: PGRole) => {
    const unknown = !!r.agent && !agentNames.includes(r.agent);
    const cls =
      "pg-node" + (drag === r.key ? " dragging" : "") + (over === "node:" + r.key ? " drop" : "");
    return (
      <button
        key={r.key}
        type="button"
        className={cls}
        data-type={r.type}
        data-pgkey={r.key}
        data-pgtype={r.type}
        onPointerDown={onDown(r.key)}
        onPointerMove={onMoveP}
        onPointerUp={onUp}
        onClick={() => { if (!justDragged.current) onPick(r.key); }}
        title="Drag to reorder, or drop on another phase to move it · click to edit"
      >
        <span className="pg-node-grip" aria-hidden="true">⠿</span>
        <span className="pg-node-dot" />
        <span className="pg-node-title">{r.title}</span>
        <span className="pg-node-agent">
          {r.agent ? (unknown ? r.agent + " · not created" : r.agent) : "default worker"}
        </span>
      </button>
    );
  };

  const lane = (label: string, items: PGRole[], type: PGType) =>
    items.length ? (
      <div className={"pg-lane" + (over === "lane:" + type ? " over" : "")} data-pglane={type}>
        <div className="pg-lane-head">{label}</div>
        {items.map(node)}
      </div>
    ) : null;

  const conn = (label?: string) => (
    <div className="pg-conn">
      {label && <span className="pg-conn-label">{label}</span>}
      <Arrow />
    </div>
  );

  return (
    <div className="pg-wrap">
      <div className={"pg-graph" + (drag ? " dragging" : "")}>
        {lane("Plan", plan, "plan")}
        {plan.length > 0 && (hasLoop || signoff.length > 0) ? conn() : null}

        {hasLoop && (
          <div className="pg-loop">
            <div className="pg-loop-head">
              <span className="pg-loop-badge">↺ recycle ≤{maxCycles}×</span>
              <span>until every check approves</span>
            </div>
            <div className="pg-loop-body">
              {lane("Build", build, "build")}
              {build.length > 0 && check.length > 0 ? conn() : null}
              {lane("Check", check, "check")}
            </div>
            <div className="pg-loop-return">
              <Arrow back dashed />
              <span>changes requested → back to Build</span>
            </div>
          </div>
        )}

        {hasLoop && signoff.length > 0 ? conn("approved") : null}
        {!hasLoop && plan.length > 0 && signoff.length > 0 ? conn() : null}
        {lane("Sign-off", signoff, "signoff")}
      </div>
    </div>
  );
}
