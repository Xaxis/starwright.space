/**
 * An industrial robot arm at work: a pedestal, a turret, a lower and an upper link with their
 * joint motors, a wrist and a two-fingered gripper, each joint ringed with light. It picks boxes
 * off a roller conveyor and stacks them on a pallet, over and over. The fleet is a factory floor
 * of cells, every arm working in step.
 */
import type * as THREE from "three";
import { type Kit, type Model, mix } from "./kit.ts";

const SHOULDER: [number, number, number] = [0.12, 1.06, 0];
const LOWER = 1.25;
const UPPER = 1.05;
// Turret angles of the conveyor and the pallet: the swing between them passes in front.
const PICK = 1.0;
const PLACE = -2.1;

/** Joint angles through one cycle: [turret, shoulder, elbow, grip (0 open, 1 closed)]. */
const KEYS: [number, number, number, number, number][] = [
  // u, j1, j2, j3, grip
  [0.0, PICK, -0.15, -0.25, 0],
  [0.14, PICK, -0.55, -0.55, 0],
  [0.22, PICK, -0.55, -0.55, 1],
  [0.36, PICK, -0.15, -0.25, 1],
  [0.56, PLACE, -0.15, -0.25, 1],
  [0.68, PLACE, -0.5, -0.5, 1],
  [0.76, PLACE, -0.5, -0.5, 0],
  [0.88, PLACE, -0.15, -0.25, 0],
  [1.0, PICK, -0.15, -0.25, 0],
];

function pose(u: number): [number, number, number, number] {
  for (let i = 1; i < KEYS.length; i++) {
    const b = KEYS[i] as (typeof KEYS)[number];
    if (u <= b[0]) {
      const a = KEYS[i - 1] as (typeof KEYS)[number];
      const t = (u - a[0]) / (b[0] - a[0]);
      const k = t * t * (3 - 2 * t);
      return [mix(a[1], b[1], k), mix(a[2], b[2], k), mix(a[3], b[3], k), mix(a[4], b[4], k)];
    }
  }
  const z = KEYS[0] as (typeof KEYS)[number];
  return [z[1], z[2], z[3], z[4]];
}

export default function arm(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const link = m.trim;
  const ring = (
    parent: THREE.Object3D,
    r: number,
    at: [number, number, number],
    axis: "y" | "z",
  ) => {
    const g = kit.keep(new T.TorusGeometry(r, 0.022, 8, kit.seg(40)));
    if (axis === "y") g.rotateX(Math.PI / 2);
    kit.mesh(g, m.strip, parent, at);
  };

  // The pedestal stays; everything above it turns.
  kit.mesh(kit.cyl(0.55, 0.6, 0.08, 40), m.dark, root, [0, 0.04, 0]);
  kit.mesh(kit.cyl(0.36, 0.42, 0.42, 40), m.dark, root, [0, 0.29, 0]);
  kit.shadow(1.6, 1.6, root);

  const turret = kit.group(root, [0, 0.5, 0]);
  kit.live(turret);
  const tA = kit.group(turret);
  kit.mesh(kit.cyl(0.36, 0.36, 0.3, 40), link, tA, [0, 0.15, 0]);
  kit.mesh(kit.box(0.5, 0.5, 0.62, 0.1), link, tA, [0.08, 0.5, 0]);
  ring(tA, 0.37, [0, 0.02, 0], "y");
  kit.part(tA, [0, 1.2, 0], [0, 1.2, 0], 1);

  // Shoulder: the lower link, rising.
  const shoulder = kit.group(turret, [SHOULDER[0], SHOULDER[1] - 0.5, SHOULDER[2]]);
  const sA = kit.group(shoulder);
  kit.mesh(kit.cyl(0.24, 0.24, 0.72, 32).rotateX(Math.PI / 2), m.dark, sA);
  ring(sA, 0.25, [0, 0, 0.37], "z");
  ring(sA, 0.25, [0, 0, -0.37], "z");
  kit.mesh(kit.box(0.3, LOWER, 0.34, 0.1), link, sA, [0, LOWER / 2, 0]);
  kit.mesh(kit.box(0.08, LOWER * 0.7, 0.36, 0.03), m.dark, sA, [-0.16, LOWER / 2, 0]);
  kit.part(sA, [-0.6, 1.4, 0.4], [0, 0, 0.9], 2);

  // Elbow: the upper link, reaching forward, with its motor behind.
  const elbow = kit.group(shoulder, [0, LOWER, 0]);
  const eA = kit.group(elbow);
  kit.mesh(kit.cyl(0.2, 0.2, 0.5, 32).rotateX(Math.PI / 2), m.dark, eA);
  ring(eA, 0.21, [0, 0, 0.26], "z");
  kit.mesh(kit.box(UPPER, 0.24, 0.26, 0.09), link, eA, [UPPER / 2, 0, 0]);
  kit.mesh(kit.box(0.34, 0.3, 0.3, 0.08), m.dark, eA, [-0.28, 0.02, 0]);
  kit.part(eA, [0.4, 2.0, -0.4], [0, 0, -0.9], 3);

  // Wrist and gripper, pointing down.
  const wrist = kit.group(elbow, [UPPER, 0, 0]);
  const wA = kit.group(wrist);
  kit.mesh(kit.cyl(0.13, 0.13, 0.34, 28).rotateX(Math.PI / 2), m.dark, wA);
  ring(wA, 0.14, [0, 0, 0.18], "z");
  kit.mesh(kit.cyl(0.1, 0.12, 0.18, 24), m.steel, wA, [0, -0.17, 0]);
  kit.mesh(kit.box(0.34, 0.08, 0.16, 0.02), m.dark, wA, [0, -0.29, 0]);
  const fingers: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const f = kit.group(wA, [s * 0.12, -0.33, 0]);
    kit.mesh(kit.box(0.04, 0.22, 0.12, 0.01), m.steel, f, [0, -0.11, 0]);
    kit.mesh(kit.box(0.02, 0.1, 0.1, 0.005), m.rubber, f, [-s * 0.025, -0.16, 0]);
    fingers.push(f);
  }
  const held = kit.mesh(
    kit.box(0.2, 0.18, 0.2, 0.015),
    kit.std({ color: "#b48a58", roughness: 0.8 }),
    wA,
    [0, -0.5, 0],
  );
  kit.solo(held);
  kit.part(wA, [0.8, 1.2, 0.6], [0.6, 0, 0], 4);

  // The cell around it: a roller conveyor and a pallet of stacked boxes.
  const cardboard = kit.std({ color: "#b48a58", roughness: 0.8 });
  const conv = kit.group(root, [Math.cos(-PICK) * 1.38, 0, Math.sin(-PICK) * 1.38], [0, PICK, 0]);
  kit.mesh(kit.box(0.6, 0.06, 2.4, 0.01), m.alu, conv, [0, 0.5, 0]);
  const rollers = new T.InstancedMesh(
    kit.cyl(0.03, 0.03, 0.56, 10).rotateZ(Math.PI / 2),
    m.steel,
    16,
  );
  const mm = new T.Matrix4();
  for (let i = 0; i < 16; i++)
    rollers.setMatrixAt(i, mm.makeTranslation(0, 0.55, -1.1 + i * 0.147));
  conv.add(rollers);
  for (const z of [-1.1, 1.1]) {
    for (const x of [-0.26, 0.26]) kit.mesh(kit.box(0.05, 0.5, 0.05), m.dark, conv, [x, 0.25, z]);
  }
  for (const z of [-0.7, 0.45])
    kit.mesh(kit.box(0.2, 0.18, 0.2, 0.015), cardboard, conv, [0, 0.67, z]);
  kit.part(conv, [0.8, 0, 1.2], [0, 0.5, 0], 0);
  const pallet = kit.group(
    root,
    [Math.cos(-PLACE) * 1.32, 0, Math.sin(-PLACE) * 1.32],
    [0, PLACE, 0],
  );
  kit.mesh(
    kit.box(0.9, 0.12, 0.9, 0.01),
    kit.std({ color: "#7a5a3a", roughness: 0.9 }),
    pallet,
    [0, 0.06, 0],
  );
  for (let i = 0; i < 4; i++) {
    kit.mesh(kit.box(0.2, 0.18, 0.2, 0.015), cardboard, pallet, [
      -0.15 + (i % 2) * 0.3,
      0.21,
      -0.15 + (i >> 1) * 0.3,
    ]);
  }
  kit.part(pallet, [0.8, 0, -1.2], [0, -0.5, 0], 0.5);

  return {
    root,
    size: 2.3,
    centre: [0.2, 1.15, 0],
    setting: "floor",
    look: [0.55, 0.32],
    layout: { kind: "grid", spacing: [4.3, 4.6], count: 520, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const u = (((time * 0.18 * kit.speed + p * 1.3) % 1) + 1) % 1;
      const [j1, j2, j3, grip] = run > 0.001 ? pose(u) : [-0.5, -0.1, -0.6, 0];
      const k = run;
      turret.rotation.y = mix(-0.5, j1, k);
      shoulder.rotation.z = mix(-0.1, j2, k);
      elbow.rotation.z = mix(-0.6, j3, k);
      wrist.rotation.z = -(shoulder.rotation.z + elbow.rotation.z);
      const g = grip * k;
      fingers.forEach((f, i) => {
        f.position.x = (i ? 1 : -1) * (0.12 - 0.02 * g);
      });
      held.visible = g > 0.5;
    },
  };
}
