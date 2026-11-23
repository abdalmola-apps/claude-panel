import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type PGType = "plan" | "build" | "check" | "signoff";
type Role = { key: string; title: string; agent: string; enabled: boolean; type: PGType; instruction: string };

const NAMES = ["Sam", "Alex", "Noor", "Omar", "Lina", "Jordan", "Yara", "Zaid", "Maya", "Kai", "Rana", "Tariq", "Hana", "Adam", "Sara", "Riley", "Dana", "Leo"];
const HAIR = [0x2b2118, 0x3a2a1a, 0x1c1c1f, 0x5b3a1e, 0x4a3524, 0x241f1b];
const SKIN = [0xe8b78e, 0xd9a271, 0xc88a56, 0xf0c39a, 0xbb7b4e];
const PHASE_HEX: Record<PGType, number> = { plan: 0x6e79d6, build: 0x3fb950, check: 0xd29922, signoff: 0x2bb3a3 };
const PHASE_ORDER: PGType[] = ["plan", "build", "check", "signoff"];
const PHASE_LABEL: Record<PGType, string> = { plan: "Plan", build: "Build", check: "Check", signoff: "Sign-off" };
const SUP_HEX = 0x8891e6;

const hash = (k: string) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h; };
const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";

function disposeGroup(g: THREE.Object3D) {
  const kids = [...g.children];
  for (const c of kids) {
    g.remove(c);
    c.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm: any) => { mm.map?.dispose?.(); mm.dispose?.(); });
    });
  }
}

function labelSprite(line1: string, line2: string, dot: number) {
  const d = isDark();
  const W = 560, H = 150;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const bg = d ? "#171b21" : "#ffffff", bd = d ? "#2d343f" : "#d4dae2";
  const tx = d ? "#e6e9ef" : "#1b1f26", sub = d ? "#aab2c0" : "#4a5361";
  const r = 22, pad = 8;
  ctx.beginPath();
  ctx.moveTo(pad + r, pad); ctx.arcTo(W - pad, pad, W - pad, H - pad, r);
  ctx.arcTo(W - pad, H - pad, pad, H - pad, r); ctx.arcTo(pad, H - pad, pad, pad, r);
  ctx.arcTo(pad, pad, W - pad, pad, r); ctx.closePath();
  ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = bd; ctx.stroke();
  ctx.fillStyle = "#" + dot.toString(16).padStart(6, "0");
  ctx.beginPath(); ctx.arc(44, 62, 10, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = tx; ctx.font = "600 38px system-ui, sans-serif";
  ctx.fillText(line1, W / 2 + 14, 58);
  ctx.fillStyle = sub; ctx.font = "28px ui-monospace, monospace";
  ctx.fillText(line2, W / 2, 104);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sp = new THREE.Sprite(mat); sp.scale.set(2.6, 0.7, 1); sp.renderOrder = 10;
  return sp;
}

function makePerson(shirt: number, seed: number, standing: boolean) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[seed % SKIN.length], roughness: 0.8 });
  const hairM = new THREE.MeshStandardMaterial({ color: HAIR[seed % HAIR.length], roughness: 0.9 });
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
  const hipY = standing ? 0.52 : 0.56;
  const torsoH = standing ? 0.6 : 0.46;
  const torsoY = hipY + torsoH / 2;
  if (standing) {
    const legM = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.85 });
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.52, 10), legM);
      leg.position.set(sx, 0.26, 0); leg.castShadow = true; g.add(leg);
    }
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, torsoH, 12), shirtM);
  torso.position.y = torsoY; torso.castShadow = true; g.add(torso);
  const headY = torsoY + torsoH / 2 + 0.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
  head.position.y = headY; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM);
  hair.position.y = headY + 0.02; g.add(hair);
  // arms reaching forward
  for (const sx of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), shirtM);
    arm.position.set(sx, torsoY + 0.06, 0.18); arm.rotation.x = Math.PI / 2.4; arm.castShadow = true; g.add(arm);
  }
  return g;
}

function makeChair() {
  const g = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.1 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x363d49, roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.5), cushion);
  seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.09), cushion);
  back.position.set(0, 0.8, -0.24); back.castShadow = true; g.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 10), plastic);
  pole.position.y = 0.28; g.add(pole);
  const baseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), plastic);
  baseHub.position.y = 0.09; g.add(baseHub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.05), plastic);
    spoke.position.set(Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14); spoke.rotation.y = -a; g.add(spoke);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), plastic);
    wheel.position.set(Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28); g.add(wheel);
  }
  return g;
}

function makeDesk(deskHex: number) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: deskHex, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1ad, roughness: 0.4, metalness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.8), wood);
  top.position.y = 0.74; top.castShadow = true; top.receiveShadow = true; g.add(top);
  for (const sx of [-0.68, 0.68]) for (const sz of [-0.32, 0.32]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), metal);
    leg.position.set(sx, 0.37, sz); leg.castShadow = true; g.add(leg);
  }
  return g;
}

function makeLaptop(screen: number) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.5, metalness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.34), body);
  base.position.y = 0.012; base.castShadow = true; g.add(base);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.006, 0.24), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7 }));
  keys.position.set(0, 0.03, 0.03); g.add(keys);
  const screenMat = new THREE.MeshStandardMaterial({ color: screen, emissive: screen, emissiveIntensity: 0.6, roughness: 0.4 });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), body);
  lid.position.set(0, 0.16, -0.16); lid.rotation.x = -0.35; g.add(lid);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.25), screenMat);
  scr.position.set(0, 0.16, -0.149); scr.rotation.x = -0.35; g.add(scr);
  g.position.y = 0.775;
  return { group: g, screenMat };
}

export type GridSeat = { key: string; line1: string; line2: string; colorHex: number };

export function OfficeView({
  roles = [],
  agentNames = [],
  onPick,
  onAdd,
  onMove,
  title,
  onRename,
  grid,
  legend,
}: {
  roles?: Role[];
  agentNames?: string[];
  onPick: (key: string) => void;
  onAdd?: () => void;
  onMove?: (dragKey: string, targetKey: string | null, targetType: PGType) => void;
  title?: string;
  onRename?: (v: string) => void;
  grid?: GridSeat[];
  legend?: ReactNode;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const api = useRef<any>({ roles, agentNames, onPick, onMove, grid, animated: [], supPivot: null });

  useEffect(() => { api.current.roles = roles; api.current.agentNames = agentNames; api.current.onPick = onPick; api.current.onMove = onMove; api.current.grid = grid; api.current.rebuild?.(); }, [roles, agentNames, onPick, onMove, grid]);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = Math.max(320, mount.clientWidth), h = mount.clientHeight || 480;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(8, 7.5, 11);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.18; controls.maxPolarAngle = 1.45;
    controls.minDistance = 5; controls.maxDistance = 28; controls.enablePan = false;
    controls.target.set(0, 0.7, 0);

    const amb = new THREE.AmbientLight(0xffffff, 0.8); scene.add(amb);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444a55, 0.35); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(7, 13, 5); dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024); dir.shadow.camera.near = 1; dir.shadow.camera.far = 60;
    const sc = dir.shadow.camera as THREE.OrthographicCamera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.updateProjectionMatrix();
    scene.add(dir);

    const room = new THREE.Group(); scene.add(room);
    const team = new THREE.Group(); scene.add(team);

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const stationAt = (cx: number, cy: number): any => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((cx - r.left) / r.width) * 2 - 1;
      ndc.y = -((cy - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(team.children, true);
      for (const h of hits) { let o: any = h.object; while (o) { if (o.userData && o.userData.key) return o; o = o.parent; } }
      return null;
    };
    let drag: any = null;
    // capture so this runs before OrbitControls: grabbing an agent disables orbit for that gesture
    const onDown = (e: PointerEvent) => {
      const g = stationAt(e.clientX, e.clientY);
      if (g) { drag = { g, key: g.userData.key, x: e.clientX, y: e.clientY, moved: false, baseY: g.position.y }; controls.enabled = false; mount.style.cursor = "grabbing"; }
      else drag = null;
    };
    const onMovePt = (e: PointerEvent) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) drag.g.position.y = drag.baseY + 0.35;
    };
    const onUp = (e: PointerEvent) => {
      const d = drag; drag = null; controls.enabled = true; mount.style.cursor = "";
      if (!d) return;
      d.g.position.y = d.baseY;
      if (!d.moved) { api.current.onPick(d.key); return; }
      const t = stationAt(e.clientX, e.clientY);
      if (t && t.userData.key && t.userData.key !== d.key && api.current.onMove) api.current.onMove(d.key, t.userData.key, t.userData.type);
    };
    renderer.domElement.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMovePt);
    window.addEventListener("pointerup", onUp);

    const buildRoom = () => {
      disposeGroup(room);
      const d = isDark();
      const floorC = d ? 0x12151a : 0xeceff3, wallC = d ? 0x171b21 : 0xf3f5f8, wall2C = d ? 0x1b2029 : 0xe9edf1;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ color: floorC, roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); floor.receiveShadow = true; room.add(floor);
      // subtle grid
      const grid = new THREE.GridHelper(26, 26, d ? 0x2a313b : 0xd6dbe2, d ? 0x20262e : 0xe2e6eb);
      (grid.material as any).opacity = 0.5; (grid.material as any).transparent = true; grid.position.y = 0.01; room.add(grid);
      // back walls
      const wallMat = new THREE.MeshStandardMaterial({ color: wallC, roughness: 1, side: THREE.DoubleSide });
      const wall2Mat = new THREE.MeshStandardMaterial({ color: wall2C, roughness: 1, side: THREE.DoubleSide });
      const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), wallMat);
      back.position.set(0, 3.5, -13); back.receiveShadow = true; room.add(back);
      const left = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), wall2Mat);
      left.rotation.y = Math.PI / 2; left.position.set(-13, 3.5, 0); left.receiveShadow = true; room.add(left);
      // window on back wall
      const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshStandardMaterial({ color: 0x9ecbff, emissive: 0x5a86c0, emissiveIntensity: d ? 0.25 : 0.12, roughness: 0.3 }));
      win.position.set(5, 4.2, -12.9); room.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 0.08), new THREE.MeshStandardMaterial({ color: d ? 0x2d343f : 0xc7cdd6 }));
      frame.position.set(5, 4.2, -12.95); room.add(frame);
      win.position.z = -12.9;
      // plant in a corner
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.9 }));
      pot.position.set(-11, 0.25, -11); pot.castShadow = true; room.add(pot);
      const leafM = new THREE.MeshStandardMaterial({ color: 0x3fa65a, roughness: 0.8 });
      for (const o of [[0, 0.9, 0, 0.55], [0.25, 1.15, 0.1, 0.4], [-0.2, 1.1, -0.1, 0.42]]) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(o[3], 12, 10), leafM);
        leaf.position.set(-11 + o[0], o[1], -11 + o[2]); leaf.castShadow = true; room.add(leaf);
      }
    };

    // generic grid of desks (e.g. a session's agents) — no phases, no supervisor
    const buildGrid = (seats: GridSeat[]) => {
      const d = isDark();
      const deskHex = d ? 0x3a3027 : 0xd8c3a5;
      const COLS = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(seats.length))));
      const rows = Math.ceil(seats.length / COLS);
      const CW = 3.3, RW = 3.0;
      const cx = ((COLS - 1) * CW) / 2, cz = ((rows - 1) * RW) / 2;
      seats.forEach((seat, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const c = seat.colorHex;
        const g = new THREE.Group(); g.position.set(col * CW - cx, 0, row * RW - cz); g.userData.key = seat.key;
        const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.1, 2.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.set(0, 1.0, 0.1); g.add(hit);
        const desk = makeDesk(deskHex); desk.position.z = 0.55; g.add(desk);
        const chair = makeChair(); chair.position.z = -0.35; g.add(chair);
        const person = makePerson(c, hash(seat.key), false); g.add(person);
        const lap = makeLaptop(c); lap.group.position.z = 0.46; lap.group.rotation.y = Math.PI; g.add(lap.group);
        const label = labelSprite(seat.line1, seat.line2, c); label.position.set(0, 2.15, 0); g.add(label);
        team.add(g);
        api.current.animated.push({ obj: person, baseY: 0, phase: (i % 7) * 0.9, bob: true });
        api.current.animated.push({ mat: lap.screenMat, phase: (i % 7) * 0.7, flick: true });
      });
      controls.target.set(0, 0.7, 0);
    };

    const buildTeam = () => {
      disposeGroup(team);
      api.current.animated = [];
      const gridSeats = api.current.grid as GridSeat[] | undefined;
      if (gridSeats && gridSeats.length) { buildGrid(gridSeats); return; }
      const rs: Role[] = (api.current.roles || []).filter((r: Role) => r.enabled && r.instruction.trim());
      const names: string[] = api.current.agentNames || [];
      if (!rs.length) { renderer.render(scene, camera); return; }
      const d = isDark();
      const deskHex = d ? 0x3a3027 : 0xd8c3a5;
      const phases = PHASE_ORDER.filter((p) => rs.some((r) => r.type === p));
      const COLS = 3.2, ROWS = 3.0;
      const seats = rs.map((r) => {
        const ci = phases.indexOf(r.type);
        const j = rs.filter((x) => x.type === r.type).indexOf(r);
        return { r, x: ci * COLS, z: j * ROWS };
      });
      const xs = seats.map((s) => s.x), zs = seats.map((s) => s.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const maxZ = Math.max(...zs);

      // unique names
      const used = new Set<string>();
      const pickName = (key: string) => { const hh = hash(key); for (let k = 0; k < NAMES.length; k++) { const n = NAMES[(hh + k) % NAMES.length]; if (!used.has(n)) { used.add(n); return n; } } return NAMES[hh % NAMES.length]; };
      const supName = pickName("supervisor");
      // stable name per role key (sorted) so reordering doesn't reshuffle names
      const nameByKey: Record<string, string> = {};
      [...seats].sort((a, b) => (a.r.key < b.r.key ? -1 : 1)).forEach((s) => { nameByKey[s.r.key] = pickName(s.r.key); });

      for (let i = 0; i < seats.length; i++) {
        const { r, x, z } = seats[i];
        const px = x - cx, pz = z - cz;
        const c = PHASE_HEX[r.type];
        const g = new THREE.Group();
        g.position.set(px, 0, pz);
        g.userData.key = r.key; g.userData.type = r.type;

        // invisible hit-box so the whole workstation is an easy click/drag target
        const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.1, 2.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.set(0, 1.0, 0.1); g.add(hit);

        const desk = makeDesk(deskHex); desk.position.z = 0.55; g.add(desk);
        const chair = makeChair(); chair.position.z = -0.35; g.add(chair);
        const person = makePerson(c, hash(r.key), false); g.add(person);
        const lap = makeLaptop(c); lap.group.position.z = 0.46; lap.group.rotation.y = Math.PI; g.add(lap.group);
        const unknown = !!r.agent && !names.includes(r.agent);
        const label = labelSprite(`${nameByKey[r.key]} · ${r.title}`, r.agent ? (unknown ? r.agent + " · !" : r.agent) : "default worker", c);
        label.position.set(0, 2.15, 0); g.add(label);

        team.add(g);
        api.current.animated.push({ obj: person, baseY: 0, phase: (i % 7) * 0.9, bob: true });
        api.current.animated.push({ mat: lap.screenMat, phase: (i % 7) * 0.7, flick: true });
      }

      // supervisor at the front
      const sx = 0, sz = maxZ - cz + 2.8;
      const sup = new THREE.Group(); sup.position.set(sx, 0, sz);
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ color: SUP_HEX, transparent: true, opacity: 0.16, roughness: 1 }));
      rug.rotation.x = -Math.PI / 2; rug.position.y = 0.02; sup.add(rug);
      const supPerson = makePerson(SUP_HEX, hash("supervisor"), true); sup.add(supPerson);
      const supLabel = labelSprite(`${supName} · Supervisor`, "orchestrates the run", SUP_HEX);
      supLabel.scale.set(2.8, 0.75, 1); supLabel.position.set(0, 2.5, 0); sup.add(supLabel);
      team.add(sup);
      api.current.supPivot = supPerson;

      // oversight lines from supervisor to each desk
      const lineMat = new THREE.LineBasicMaterial({ color: SUP_HEX, transparent: true, opacity: 0.3 });
      for (const s of seats) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(sx, 1.6, sz),
          new THREE.Vector3(s.x - cx, 0.8, s.z - cz + 0.3),
        ]);
        team.add(new THREE.Line(geo, lineMat));
      }

      controls.target.set(0, 0.7, Math.max(0, sz / 3));
    };

    api.current.rebuild = () => { buildRoom(); buildTeam(); };
    buildRoom(); buildTeam();

    const obs = new MutationObserver(() => api.current.rebuild());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      controls.update();
      for (const a of api.current.animated) {
        if (a.bob) a.obj.position.y = Math.sin(t * 2 + a.phase) * 0.03;
        if (a.flick) a.mat.emissiveIntensity = 0.55 + Math.sin(t * 3 + a.phase) * 0.25;
      }
      if (api.current.supPivot) api.current.supPivot.rotation.y = Math.sin(t * 0.7) * 0.12;
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const ww = Math.max(320, mount.clientWidth), hh = mount.clientHeight || 480;
      renderer.setSize(ww, hh); camera.aspect = ww / hh; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMovePt);
      window.removeEventListener("pointerup", onUp);
      obs.disconnect(); controls.dispose();
      disposeGroup(team); disposeGroup(room); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chips = PHASE_ORDER.filter((p) => roles.some((r) => r.enabled && r.type === p));
  return (
    <div className="ov3d-wrap">
      <div className="ov3d-title">
        {onRename ? (
          <input
            className="ov3d-name mono"
            value={title || ""}
            placeholder="name-the-office"
            onChange={(e) => onRename(e.target.value.toLowerCase())}
            title="This names the office and the saved workflow file"
          />
        ) : (title ? <b>{title}</b> : <span className="muted">Untitled</span>)}
        <span className="muted"> · office</span>
      </div>
      <div className="ov3d" ref={mountRef} />
      {grid ? (
        <div className="ov-legend">
          {legend}
          <span className="ov-hint">drag to rotate · scroll to zoom · click a desk</span>
        </div>
      ) : (
        <div className="ov-legend">
          {chips.map((p) => (
            <span key={p} className="ov-chip"><i style={{ background: "#" + PHASE_HEX[p].toString(16).padStart(6, "0") }} />{PHASE_LABEL[p]}</span>
          ))}
          <span className="ov-chip"><i style={{ background: "#8891e6" }} />Supervisor</span>
          {onAdd && <button className="btn ghost sm" onClick={onAdd}>+ Add teammate</button>}
          <span className="ov-hint">drag to rotate · scroll to zoom · click a desk to edit</span>
        </div>
      )}
    </div>
  );
}
