import { useMemo } from "react";

type PGRole = {
  key: string;
  title: string;
  agent: string;
  enabled: boolean;
  type: "plan" | "build" | "check" | "signoff";
  instruction: string;
};

const Arrow = ({ back = false, dashed = false }: { back?: boolean; dashed?: boolean }) => (
  <svg viewBox="0 0 44 12" className={"pg-arrow" + (dashed ? " dashed" : "")} aria-hidden="true">
    {back ? (
      <path d="M44 6 H8 M14 2 L8 6 L14 10" />
    ) : (
      <path d="M0 6 H36 M30 2 L36 6 L30 10" />
    )}
  </svg>
);

export function PipelineGraph({
  roles,
  maxCycles,
  agentNames,
  onPick,
}: {
  roles: PGRole[];
  maxCycles: number;
  agentNames: string[];
  onPick: (key: string) => void;
}) {
  const on = useMemo(() => roles.filter((r) => r.enabled && r.instruction.trim()), [roles]);
  const plan = on.filter((r) => r.type === "plan");
  const build = on.filter((r) => r.type === "build");
  const check = on.filter((r) => r.type === "check");
  const signoff = on.filter((r) => r.type === "signoff");
  const hasLoop = build.length + check.length > 0;

  if (!on.length) {
    return <div className="pg-empty">Enable at least one role to see the flow.</div>;
  }

  const node = (r: PGRole) => {
    const unknown = !!r.agent && !agentNames.includes(r.agent);
    return (
      <button
        key={r.key}
        type="button"
        className="pg-node"
        data-type={r.type}
        onClick={() => onPick(r.key)}
        title="Jump to this role in the editor below"
      >
        <span className="pg-node-dot" />
        <span className="pg-node-title">{r.title}</span>
        <span className="pg-node-agent">
          {r.agent ? (unknown ? r.agent + " · not created" : r.agent) : "default worker"}
        </span>
      </button>
    );
  };

  const lane = (label: string, items: PGRole[]) =>
    items.length ? (
      <div className="pg-lane">
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
      <div className="pg-graph">
        {lane("Plan", plan)}
        {plan.length > 0 && (hasLoop || signoff.length > 0) ? conn() : null}

        {hasLoop && (
          <div className="pg-loop">
            <div className="pg-loop-head">
              <span className="pg-loop-badge">↺ recycle ≤{maxCycles}×</span>
              <span>until every check approves</span>
            </div>
            <div className="pg-loop-body">
              {lane("Build", build)}
              {build.length > 0 && check.length > 0 ? conn() : null}
              {lane("Check", check)}
            </div>
            <div className="pg-loop-return">
              <Arrow back dashed />
              <span>changes requested → back to Build</span>
            </div>
          </div>
        )}

        {hasLoop && signoff.length > 0 ? conn("approved") : null}
        {!hasLoop && plan.length > 0 && signoff.length > 0 ? conn() : null}
        {lane("Sign-off", signoff)}
      </div>
    </div>
  );
}
