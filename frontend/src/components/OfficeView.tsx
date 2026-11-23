import { useMemo } from "react";

type PGType = "plan" | "build" | "check" | "signoff";
type Role = { key: string; title: string; agent: string; enabled: boolean; type: PGType; instruction: string };

const TW = 60, TH = 30;          // iso tile width / height (2:1)
const DESK_H = 13;               // desk height
const COL = 3.4, ROW = 3.0;      // grid spacing between desks
const PHASE_ORDER: PGType[] = ["plan", "build", "check", "signoff"];
const PHASE_LABEL: Record<PGType, string> = { plan: "PLAN", build: "BUILD", check: "CHECK", signoff: "SIGN-OFF" };
const PVAR: Record<PGType, string> = {
  plan: "var(--pg-plan)", build: "var(--pg-build)", check: "var(--pg-check)", signoff: "var(--pg-signoff)",
};

const iso = (x: number, y: number, z = 0): [number, number] => [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z];
const P = (x: number, y: number, z = 0) => { const [a, b] = iso(x, y, z); return `${a.toFixed(1)},${b.toFixed(1)}`; };

// a stable, friendly first name per role so each desk feels staffed by a person
const NAMES = ["Sam", "Alex", "Noor", "Omar", "Lina", "Jordan", "Yara", "Zaid", "Maya", "Kai", "Rana", "Tariq", "Hana", "Adam", "Sara", "Riley", "Dana", "Leo"];
const nameFor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return NAMES[h % NAMES.length];
};

export function OfficeView({
  roles,
  agentNames,
  onPick,
}: {
  roles: Role[];
  agentNames: string[];
  onPick: (key: string) => void;
}) {
  const L = useMemo(() => {
    const on = roles.filter((r) => r.enabled && r.instruction.trim());
    const phases = PHASE_ORDER.filter((p) => on.some((r) => r.type === p));
    const seats = on.map((r) => {
      const ci = phases.indexOf(r.type);
      const j = on.filter((x) => x.type === r.type).indexOf(r);
      return { role: r, gx: ci * COL, gy: j * ROW };
    });
    const maxGx = Math.max(0, ...seats.map((s) => s.gx));
    const maxGy = Math.max(0, ...seats.map((s) => s.gy));
    const sup = { gx: maxGx / 2, gy: maxGy + ROW + 0.4 };
    // unique, stable name per person (linear-probe from the key's hash)
    const used = new Set<string>();
    const pick = (key: string) => {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      for (let k = 0; k < NAMES.length; k++) {
        const n = NAMES[(h + k) % NAMES.length];
        if (!used.has(n)) { used.add(n); return n; }
      }
      return NAMES[h % NAMES.length];
    };
    const supName = pick("supervisor");
    const nameByKey: Record<string, string> = {};
    on.forEach((r) => { nameByKey[r.key] = pick(r.key); });
    return { on, phases, seats, sup, maxGx, maxGy, nameByKey, supName };
  }, [roles]);

  if (!L.on.length) return <div className="pg-empty">Enable at least one role to staff the office.</div>;

  // viewBox from extreme projected points
  const pts: [number, number][] = [];
  const add = (x: number, y: number, z = 0) => pts.push(iso(x, y, z));
  L.seats.forEach((s) => {
    add(s.gx - 0.7, s.gy - 0.7, 70); add(s.gx + 1.3, s.gy + 1.3, 0);
    add(s.gx + 1.3, s.gy - 0.7, 70); add(s.gx - 0.7, s.gy + 1.3, 0);
  });
  add(L.sup.gx - 0.9, L.sup.gy - 0.9, 95); add(L.sup.gx + 1.3, L.sup.gy + 1.5, 0);
  // room walls extend the top/edges of the scene
  add(-0.9, -0.9, 96); add(L.maxGx + 1.4, -0.9, 96); add(-0.9, L.sup.gy + 1.5, 96);
  add(L.maxGx + 1.4, L.sup.gy + 1.5, 0);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = 30;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad;
  const vb = `${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;

  // room: floor rectangle + two back walls + grid + window + clock
  const fx0 = -0.9, fy0 = -0.9, fx1 = L.maxGx + 1.4, fy1 = L.sup.gy + 1.5, WALL = 96;
  const s = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const up = (p: [number, number], z: number): [number, number] => [p[0], p[1] - z];
  const cA = iso(fx0, fy0), cB = iso(fx1, fy0), cC = iso(fx1, fy1), cD = iso(fx0, fy1);
  const floorPts = [cA, cB, cC, cD].map(s).join(" ");
  const rWall = [cA, cB, up(cB, WALL), up(cA, WALL)].map(s).join(" ");
  const lWall = [cA, cD, up(cD, WALL), up(cA, WALL)].map(s).join(" ");
  const onR = (t: number, z: number): [number, number] => up([cA[0] + (cB[0] - cA[0]) * t, cA[1] + (cB[1] - cA[1]) * t], z);
  const onL = (t: number, z: number): [number, number] => up([cA[0] + (cD[0] - cA[0]) * t, cA[1] + (cD[1] - cA[1]) * t], z);
  const win = [onR(0.5, 36), onR(0.78, 36), onR(0.78, 76), onR(0.5, 76)].map(s).join(" ");
  const winV = [onR(0.64, 36), onR(0.64, 76)], winH = [onR(0.5, 56), onR(0.78, 56)];
  const clk = onL(0.42, 62);
  const gx: number[] = []; for (let x = Math.ceil(fx0); x <= Math.floor(fx1); x++) gx.push(x);
  const gy: number[] = []; for (let y = Math.ceil(fy0); y <= Math.floor(fy1); y++) gy.push(y);

  const supHead = iso(L.sup.gx + 0.5, L.sup.gy + 0.5, 56);

  const station = (s: { role: Role; gx: number; gy: number }, i: number) => {
    const { role, gx, gy } = s;
    const c = PVAR[role.type];
    const unknown = !!role.agent && !agentNames.includes(role.agent);
    const delay = { animationDelay: `${((i % 7) * 0.33).toFixed(2)}s` } as const;

    const padDia = `${P(gx - 0.55, gy - 0.55)} ${P(gx + 1.25, gy - 0.55)} ${P(gx + 1.25, gy + 1.25)} ${P(gx - 0.55, gy + 1.25)}`;

    // worker seated at back of the tile; desk in front occludes the lower body
    const [wfx, wfy] = iso(gx + 0.5, gy + 0.15, 0);

    // desk box (front half of tile)
    const dx0 = gx + 0.08, dx1 = gx + 0.92, dy0 = gy + 0.5, dy1 = gy + 1.0;
    const top = `${P(dx0, dy0, DESK_H)} ${P(dx1, dy0, DESK_H)} ${P(dx1, dy1, DESK_H)} ${P(dx0, dy1, DESK_H)}`;
    const left = `${P(dx0, dy1, DESK_H)} ${P(dx1, dy1, DESK_H)} ${P(dx1, dy1, 0)} ${P(dx0, dy1, 0)}`;
    const right = `${P(dx1, dy0, DESK_H)} ${P(dx1, dy1, DESK_H)} ${P(dx1, dy1, 0)} ${P(dx1, dy0, 0)}`;

    // laptop: keyboard deck + screen tilted up toward the viewer
    const deck = `${P(gx + 0.33, gy + 0.6, DESK_H)} ${P(gx + 0.67, gy + 0.6, DESK_H)} ${P(gx + 0.67, gy + 0.8, DESK_H)} ${P(gx + 0.33, gy + 0.8, DESK_H)}`;
    const keys = `${P(gx + 0.37, gy + 0.635, DESK_H)} ${P(gx + 0.63, gy + 0.635, DESK_H)} ${P(gx + 0.63, gy + 0.765, DESK_H)} ${P(gx + 0.37, gy + 0.765, DESK_H)}`;
    const lidBack = `${P(gx + 0.34, gy + 0.8, DESK_H)} ${P(gx + 0.66, gy + 0.8, DESK_H)} ${P(gx + 0.66, gy + 0.9, DESK_H + 18)} ${P(gx + 0.34, gy + 0.9, DESK_H + 18)}`;
    const lidScreen = `${P(gx + 0.37, gy + 0.805, DESK_H + 1.5)} ${P(gx + 0.63, gy + 0.805, DESK_H + 1.5)} ${P(gx + 0.63, gy + 0.895, DESK_H + 16.5)} ${P(gx + 0.37, gy + 0.895, DESK_H + 16.5)}`;

    // floating nameplate
    const [lx, ly] = iso(gx + 0.5, gy + 0.2, DESK_H + 46);

    return (
      <g key={role.key} className="ov-station" onClick={() => onPick(role.key)}>
        <polygon points={padDia} fill={c} opacity={0.09} stroke={c} strokeOpacity={0.3} />
        {/* chair behind the worker */}
        <ellipse cx={wfx} cy={wfy - 1} rx={12} ry={4.5} fill="#000" opacity={0.12} />
        <rect x={wfx - 11} y={wfy - 34} width={22} height={24} rx={8} fill="var(--raised)" stroke="var(--border)" strokeWidth={0.7} />
        {/* seated worker — bobs gently */}
        <g className="ov-emp" style={delay}>
          <ellipse cx={wfx} cy={wfy - 14} rx={9.5} ry={13} fill={c} />
          <circle cx={wfx} cy={wfy - 30} r={7} fill="var(--panel)" stroke="var(--border-2)" strokeWidth={1} />
        </g>
        {/* desk */}
        <polygon points={right} fill="var(--panel-2)" />
        <polygon points={right} fill="#000" opacity={0.1} />
        <polygon points={left} fill="var(--panel)" />
        <polygon points={left} fill="#000" opacity={0.2} />
        <polygon points={top} fill="var(--raised)" stroke="var(--border)" strokeWidth={0.8} />
        {/* laptop in front of the agent */}
        <polygon points={deck} fill="var(--panel-2)" stroke="var(--border-2)" strokeWidth={0.5} />
        <polygon points={keys} fill="var(--border-2)" />
        <polygon points={lidBack} fill="var(--panel-2)" stroke="var(--border-2)" strokeWidth={0.5} />
        <polygon className="ov-screen" points={lidScreen} fill={c} style={delay} />
        {/* nameplate: employee name · role, then the agent */}
        <g transform={`translate(${lx.toFixed(1)},${ly.toFixed(1)})`}>
          <rect x={-82} y={-17} width={164} height={33} rx={7} fill="var(--panel)" stroke="var(--border)" />
          <circle cx={-70} cy={-4} r={3.2} fill={c} />
          <text x={6} y={-2} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--text)">{L.nameByKey[role.key]} · {role.title}</text>
          <text x={0} y={10} textAnchor="middle" fontSize={9} fill="var(--text-2)" style={{ fontFamily: "var(--mono)" }}>
            {role.agent ? (unknown ? role.agent + " · not created" : role.agent) : "default worker"}
          </text>
        </g>
      </g>
    );
  };

  const [sfx, sfy] = iso(L.sup.gx + 0.5, L.sup.gy + 0.5, 0);
  const supPad = `${P(L.sup.gx - 0.4, L.sup.gy - 0.4)} ${P(L.sup.gx + 1.4, L.sup.gy - 0.4)} ${P(L.sup.gx + 1.4, L.sup.gy + 1.4)} ${P(L.sup.gx - 0.4, L.sup.gy + 1.4)}`;

  const ordered = [...L.seats].sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

  return (
    <div className="ov-wrap">
      <svg viewBox={vb} className="ov-svg" role="img" aria-label="Team office — each agent at a desk, supervisor at the head">
        {/* room — back walls */}
        <polygon points={lWall} fill="var(--panel-2)" />
        <polygon points={lWall} fill="#000" opacity={0.12} />
        <polygon points={rWall} fill="var(--panel)" />
        <polygon points={rWall} fill="#000" opacity={0.04} />
        {/* floor + grid */}
        <polygon points={floorPts} fill="var(--bg-2)" stroke="var(--border)" strokeWidth={0.8} />
        {gx.map((x) => {
          const a = iso(x, fy0), b = iso(x, fy1);
          return <line key={"gx" + x} x1={a[0].toFixed(1)} y1={a[1].toFixed(1)} x2={b[0].toFixed(1)} y2={b[1].toFixed(1)} stroke="var(--border)" strokeOpacity={0.33} strokeWidth={0.6} />;
        })}
        {gy.map((y) => {
          const a = iso(fx0, y), b = iso(fx1, y);
          return <line key={"gy" + y} x1={a[0].toFixed(1)} y1={a[1].toFixed(1)} x2={b[0].toFixed(1)} y2={b[1].toFixed(1)} stroke="var(--border)" strokeOpacity={0.33} strokeWidth={0.6} />;
        })}
        {/* window on the right wall */}
        <polygon points={win} fill="var(--accent)" opacity={0.1} stroke="var(--border-2)" strokeWidth={0.8} />
        <line x1={winV[0][0].toFixed(1)} y1={winV[0][1].toFixed(1)} x2={winV[1][0].toFixed(1)} y2={winV[1][1].toFixed(1)} stroke="var(--border-2)" strokeWidth={1} />
        <line x1={winH[0][0].toFixed(1)} y1={winH[0][1].toFixed(1)} x2={winH[1][0].toFixed(1)} y2={winH[1][1].toFixed(1)} stroke="var(--border-2)" strokeWidth={1} />
        {/* wall clock on the left wall */}
        <circle cx={clk[0].toFixed(1)} cy={clk[1].toFixed(1)} r={11} fill="var(--panel)" stroke="var(--border-2)" strokeWidth={1} />
        <line x1={clk[0].toFixed(1)} y1={clk[1].toFixed(1)} x2={clk[0].toFixed(1)} y2={(clk[1] - 7).toFixed(1)} stroke="var(--text-2)" strokeWidth={1.3} />
        <line x1={clk[0].toFixed(1)} y1={clk[1].toFixed(1)} x2={(clk[0] + 5).toFixed(1)} y2={(clk[1] + 1).toFixed(1)} stroke="var(--text-2)" strokeWidth={1.3} />
        {/* potted plant, back corner */}
        {(() => {
          const [px, py] = iso(fx1 - 0.3, fy0 + 0.35, 0);
          return (
            <g>
              <ellipse cx={px} cy={py} rx={13} ry={5} fill="#000" opacity={0.12} />
              <path d={`M${(px - 8).toFixed(1)},${(py - 2).toFixed(1)} L${(px + 8).toFixed(1)},${(py - 2).toFixed(1)} L${(px + 6).toFixed(1)},${(py - 16).toFixed(1)} L${(px - 6).toFixed(1)},${(py - 16).toFixed(1)} Z`} fill="var(--border-2)" />
              <circle cx={px - 4} cy={py - 24} r={9} fill="var(--allow)" opacity={0.75} />
              <circle cx={px + 6} cy={py - 22} r={8} fill="var(--allow)" opacity={0.6} />
              <circle cx={px + 1} cy={py - 32} r={8} fill="var(--allow)" opacity={0.8} />
            </g>
          );
        })()}

        {/* supervisor oversight lines (behind desks) */}
        {L.seats.map((s) => {
          const [dx, dy] = iso(s.gx + 0.5, s.gy + 0.5, DESK_H + 8);
          return (
            <line key={"o" + s.role.key} x1={supHead[0].toFixed(1)} y1={supHead[1].toFixed(1)} x2={dx.toFixed(1)} y2={dy.toFixed(1)}
              stroke="var(--accent)" strokeOpacity={0.22} strokeWidth={1} strokeDasharray="3 3" />
          );
        })}

        {/* desks back-to-front */}
        {ordered.map((s, i) => station(s, i))}

        {/* supervisor */}
        <g className="ov-sup">
          <polygon points={supPad} fill="var(--accent)" opacity={0.12} stroke="var(--accent)" strokeOpacity={0.4} />
          <ellipse cx={sfx} cy={sfy - 2} rx={16} ry={6} fill="#000" opacity={0.18} />
          <g className="ov-sup-fig">
            <rect x={sfx - 11} y={sfy - 44} width={22} height={40} rx={11} fill="var(--accent)" />
            <circle cx={sfx} cy={sfy - 50} r={9.5} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.5} />
            <circle cx={sfx} cy={sfy - 34} r={2.4} fill="var(--panel)" opacity={0.9} />
            <g transform={`translate(${sfx.toFixed(1)},${(sfy - 62).toFixed(1)})`}>
              <rect x={-20} y={-9} width={40} height={14} rx={7} fill="var(--panel)" stroke="var(--accent)" strokeOpacity={0.5} />
              <text x={0} y={1} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--accent-2)">{L.supName}</text>
            </g>
          </g>
          <g transform={`translate(${sfx.toFixed(1)},${(sfy + 16).toFixed(1)})`}>
            <rect x={-56} y={-14} width={112} height={30} rx={8} fill="var(--accent-bg)" stroke="var(--accent)" />
            <text x={0} y={-1} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--accent-2)" style={{ letterSpacing: "0.08em" }}>SUPERVISOR</text>
            <text x={0} y={10} textAnchor="middle" fontSize={8.5} fill="var(--text-2)">orchestrates the run</text>
          </g>
        </g>
      </svg>

      <div className="ov-legend">
        {L.phases.map((p) => (
          <span key={p} className="ov-chip"><i style={{ background: PVAR[p] }} />{PHASE_LABEL[p].charAt(0) + PHASE_LABEL[p].slice(1).toLowerCase()}</span>
        ))}
        <span className="ov-chip"><i style={{ background: "var(--accent)" }} />Supervisor</span>
        <span className="ov-hint">click a desk to edit · the supervisor oversees every agent in the run</span>
      </div>
    </div>
  );
}
