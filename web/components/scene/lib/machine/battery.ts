/**
 * A battery module: twelve prismatic cells clamped between end plates by tie rods, on a cooling
 * plate with its coolant lines, wired in series by busbars, watched by a management board and
 * leaving by two orange high-voltage cables. A window in each cell shows its charge as light
 * rising through it, ions streaming upward as it fills. The fleet is a storage hall.
 */
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model, ramp } from "./kit.ts";

const N = 12;
const PITCH = 0.31;
const CW = 0.27;
const CH = 1.25;
const CD = 1.5;
const BASE = 0.14;

export default function battery(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const x0 = (-(N - 1) * PITCH) / 2;
  const top = BASE + CH;

  // The cooling plate and its lines.
  kit.mesh(kit.box(4.5, BASE, 1.75, 0.02), m.alu, root, [0, BASE / 2, 0]);
  const coolant = kit.std({ color: "#2f6fb0", roughness: 0.35, metalness: 0.3 });
  for (const z of [0.8, -0.8]) {
    kit.mesh(kit.cyl(0.045, 0.045, 4.6, 16).rotateZ(Math.PI / 2), coolant, root, [0, 0.07, z]);
    kit.mesh(kit.cyl(0.07, 0.07, 0.12, 16).rotateZ(Math.PI / 2), m.steel, root, [2.33, 0.07, z]);
  }
  kit.shadow(2.8, 1.3, root);

  // The cells: body, two terminals, a vent and a charge window, each an instance that flies home.
  const body = new T.InstancedMesh(
    kit.box(CW, CH, CD, 0.025),
    kit.std({ color: "#1f3f70", roughness: 0.45, metalness: 0.15 }),
    N,
  );
  const posT = new T.InstancedMesh(kit.cyl(0.085, 0.085, 0.09, 20), m.alu, N);
  const negT = new T.InstancedMesh(kit.cyl(0.085, 0.085, 0.09, 20), m.copper, N);
  const vent = new T.InstancedMesh(kit.cyl(0.06, 0.06, 0.012, 20), m.dark, N);
  const level = { value: 0 };
  const time = { value: 0 };
  const gain = { value: 1 };
  const windowMat = kit.keep(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          vUv = uv;
          ${LOCAL}
          vSeed = fract(local.x * 3.17 + local.z * 1.3);
          gl_Position = projectionMatrix * modelViewMatrix * local;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform float uLevel;
        uniform float uTime;
        uniform float uGain;
        uniform vec3 cColour;
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          float lv = clamp(uLevel * (0.92 + 0.08 * vSeed), 0.0, 1.0);
          float below = step(vUv.y, lv);
          float bands = pow(max(0.5 + 0.5 * sin((vUv.y * 14.0 - uTime * 1.6 + vSeed * 6.0) * 3.14159), 0.0), 4.0);
          float edge = exp(-abs(vUv.y - lv) * 60.0);
          float frame = step(0.08, vUv.x) * step(vUv.x, 0.92);
          vec3 c = cColour * (below * (0.35 + 0.9 * bands) + edge * 2.2 + 0.03) * frame * uGain;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: { uLevel: level, uTime: time, uGain: gain, cColour: { value: kit.accent.clone() } },
    }),
  );
  const win = new T.InstancedMesh(kit.keep(new T.PlaneGeometry(CW * 0.62, CH * 0.8)), windowMat, N);
  const mm = new T.Matrix4();
  for (let i = 0; i < N; i++) {
    const x = x0 + i * PITCH;
    body.setMatrixAt(i, mm.makeTranslation(x, BASE + CH / 2 + 0.005, 0));
    // In series: the terminals swap sides from one cell to the next.
    const s = i % 2 ? 1 : -1;
    posT.setMatrixAt(i, mm.makeTranslation(x, top + 0.045, s * 0.45));
    negT.setMatrixAt(i, mm.makeTranslation(x, top + 0.045, -s * 0.45));
    vent.setMatrixAt(i, mm.makeTranslation(x, top + 0.01, 0));
    win.setMatrixAt(i, mm.makeTranslation(x, BASE + CH / 2, CD / 2 + 0.004));
  }
  root.add(body, posT, negT, vent, win);
  for (let i = 0; i < N; i++) {
    const from: [number, number, number] = [0, 1.2 + (i % 3) * 0.18, (i % 2 ? 1 : -1) * 0.35];
    const turn: [number, number, number] = [0, 0, (i % 2 ? 1 : -1) * 0.25];
    for (const mesh of [body, posT, negT, vent, win]) kit.partAt(mesh, i, from, turn, 2 + i * 0.35);
  }

  // Busbars across neighbouring terminals, then the end plates and the rods that clamp them.
  const bars = new T.InstancedMesh(kit.box(PITCH + 0.12, 0.035, 0.2, 0.01), m.steel, N - 1);
  for (let i = 0; i < N - 1; i++) {
    const z = i % 2 ? -0.45 : 0.45;
    bars.setMatrixAt(i, mm.makeTranslation(x0 + (i + 0.5) * PITCH, top + 0.105, z));
  }
  root.add(bars);
  for (let i = 0; i < N - 1; i++) kit.partAt(bars, i, [0, 1.0, 0], [0, 0.6, 0], 7 + i * 0.15);
  const plateX = x0 - PITCH / 2 - 0.09;
  for (const side of [-1, 1]) {
    const g = kit.group(root, [side * -plateX, 0, 0]);
    kit.mesh(kit.box(0.14, CH + 0.08, CD + 0.12, 0.02), m.dark, g, [0, BASE + CH / 2, 0]);
    for (const y of [0.45, 0.95])
      kit.mesh(kit.box(0.06, 0.08, CD + 0.1, 0.01), m.alu, g, [side * 0.09, BASE + y, 0]);
    kit.part(g, [side * 1.6, 0.2, 0], [0, side * 0.4, 0], 1);
  }
  const rodGeo = kit.cyl(0.03, 0.03, -plateX * 2 + 0.36, 12).rotateZ(Math.PI / 2);
  const nutGeo = kit.cyl(0.055, 0.055, 0.05, 6).rotateZ(Math.PI / 2);
  for (const y of [BASE + 0.25, BASE + CH - 0.25]) {
    for (const z of [-CD / 2 - 0.02, CD / 2 + 0.02]) {
      const rod = kit.group(root, [0, y, z]);
      kit.mesh(rodGeo, m.steel, rod);
      for (const s of [-1, 1]) kit.mesh(nutGeo, m.steel, rod, [s * (-plateX + 0.13), 0, 0]);
      kit.part(rod, [3.2, 0, 0], [0, 0, 0], 6.5);
    }
  }

  // The management board and its sense leads, and the high-voltage cables.
  const bms = kit.group(root, [0, top + 0.16, 0]);
  kit.mesh(kit.box(3.3, 0.03, 0.34, 0.01), kit.std({ color: "#0f3a26", roughness: 0.5 }), bms);
  kit.mesh(kit.box(0.4, 0.06, 0.2, 0.01), m.dark, bms, [-0.6, 0.04, 0]);
  kit.mesh(new T.SphereGeometry(0.03, 8, 6), m.accent, bms, [0.9, 0.035, 0.08]);
  kit.part(bms, [0, 1.3, 0.3], [0, 0.5, 0], 11);
  const orange = kit.std({ color: "#e0661c", roughness: 0.5 });
  for (const side of [-1, 1]) {
    const z = side < 0 ? 0.45 : N % 2 ? 0.45 : -0.45;
    const x = side * (-x0 + 0.02);
    const cable = kit.tube(
      [
        [x, top + 0.1, z],
        [x + side * 0.35, top + 0.25, z],
        [x + side * 0.75, top - 0.2, z],
        [x + side * 0.95, 0.12, z + 0.3],
      ],
      0.06,
      24,
      10,
    );
    kit.part(kit.mesh(cable, orange, root), [side * 1.2, 1.0, 0], [0, 0, 0], 12);
  }

  return {
    root,
    size: 2.75,
    start: 3.4,
    centre: [0, 0.75, 0],
    setting: "floor",
    look: [0.62, 0.42],
    lookFar: 0.3,
    layout: { kind: "grid", spacing: [5.6, 3.1], count: 700, jitter: 0, yaw: "same" },
    update(t, _dt, run, p) {
      level.value = 0.06 + 0.94 * ramp(p, 0.2, 0.62) + 0.03 * Math.sin(t * 0.4) * run;
      time.value = t * kit.speed * 1.5 + p * 6;
      gain.value = kit.fade;
    },
  };
}
