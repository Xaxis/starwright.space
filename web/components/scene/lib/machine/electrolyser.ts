/**
 * An electrolyser skid: a stack of cells (bipolar plates with a glowing membrane between each
 * pair) clamped between end plates by tie rods; copper busbars from the rectifier cabinet; and
 * two glass gas separators, hydrogen and oxygen, bubbling as the stack runs. Current ripples
 * through the membranes as light. The fleet is a plant hall of skids.
 */
import type * as THREE from "three";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Kit, LOCAL, type Model } from "./kit.ts";

const N = 28;
const PITCH = 0.072;
const SIDE = 1.3;
const AXIS = 1.05;
const SX = -0.45;

export default function electrolyser(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const L = N * PITCH;

  // The skid.
  for (const z of [-0.95, 0.95])
    kit.mesh(kit.box(4.7, 0.16, 0.16, 0.02), m.dark, root, [0, 0.08, z]);
  for (const x of [-2.2, -0.8, 0.6, 2.2])
    kit.mesh(kit.box(0.14, 0.14, 2.0, 0.02), m.dark, root, [x, 0.08, 0]);
  kit.mesh(
    kit.box(4.7, 0.03, 2.05),
    kit.std({ color: "#353a42", roughness: 0.7, metalness: 0.4 }),
    root,
    [0, 0.17, 0],
  );
  kit.shadow(2.8, 1.5, root);
  for (const x of [SX - L / 2 + 0.2, SX + L / 2 - 0.2])
    kit.mesh(kit.box(0.2, 0.3, 1.0, 0.03), m.dark, root, [x, 0.33, 0]);

  // Plates and membranes, each an instance; the stack fans open along x when exploded.
  const plates = new T.InstancedMesh(
    kit.box(PITCH * 0.72, SIDE, SIDE, 0.012),
    kit.std({ color: "#8f969e", metalness: 0.85, roughness: 0.32 }),
    N + 1,
  );
  const memU = { uTime: { value: 0 }, uOn: { value: 0 }, cColour: { value: kit.accent.clone() } };
  const memMat = kit.keep(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying float vX;
        varying vec2 vYZ;
        void main() {
          ${LOCAL}
          vX = local.x;
          vYZ = position.yz;
          gl_Position = projectionMatrix * modelViewMatrix * local;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform float uTime;
        uniform float uOn;
        uniform vec3 cColour;
        varying float vX;
        varying vec2 vYZ;
        void main() {
          float wave = pow(max(0.5 + 0.5 * sin(vX * 9.0 - uTime * 3.0), 0.0), 3.0);
          float shimmer = 0.85 + 0.15 * sin(vYZ.x * 20.0 + vYZ.y * 13.0 + uTime * 2.0);
          vec3 c = cColour * (0.12 + 2.4 * wave) * shimmer * uOn + cColour * 0.05;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: memU,
    }),
  );
  const mems = new T.InstancedMesh(kit.box(PITCH * 0.24, SIDE * 0.985, SIDE * 0.985), memMat, N);
  const mm = new T.Matrix4();
  for (let i = 0; i <= N; i++)
    plates.setMatrixAt(i, mm.makeTranslation(SX - L / 2 + i * PITCH, AXIS, 0));
  for (let i = 0; i < N; i++)
    mems.setMatrixAt(i, mm.makeTranslation(SX - L / 2 + (i + 0.5) * PITCH, AXIS, 0));
  root.add(plates, mems);
  for (let i = 0; i <= N; i++) {
    const k = i / N - 0.5;
    kit.partAt(
      plates,
      i,
      [k * 2.6, 0.5 + Math.abs(k) * 0.4, 0],
      [k * 0.4, 0, 0],
      2 + Math.abs(k) * 2,
    );
    if (i < N)
      kit.partAt(
        mems,
        i,
        [k * 2.6 + 1.3 / N, 0.5 + Math.abs(k) * 0.4, 0],
        [k * 0.4, 0, 0],
        2.05 + Math.abs(k) * 2,
      );
  }

  // End plates, ports and tie rods.
  for (const s of [-1, 1]) {
    const g = kit.group(root, [SX + s * (L / 2 + 0.13), AXIS, 0]);
    kit.mesh(
      kit.box(0.24, SIDE + 0.24, SIDE + 0.24, 0.03),
      kit.std({ color: "#39424d", metalness: 0.6, roughness: 0.45 }),
      g,
    );
    kit.mesh(kit.box(0.05, SIDE * 0.5, SIDE * 0.5, 0.02), m.dark, g, [s * 0.14, 0, 0]);
    if (s > 0) {
      for (const [y, z] of [
        [0.45, 0.35],
        [0.45, -0.35],
        [-0.45, 0],
      ] as [number, number][]) {
        kit.mesh(kit.cyl(0.07, 0.07, 0.22, 16).rotateZ(Math.PI / 2), m.steel, g, [0.22, y, z]);
      }
    }
    kit.part(g, [s * 1.9, 0.3, 0], [0, s * 0.4, 0], s < 0 ? 0 : 1);
  }
  const rodGeo = kit.cyl(0.032, 0.032, L + 0.7, 12).rotateZ(Math.PI / 2);
  const nut = kit.cyl(0.06, 0.06, 0.05, 6).rotateZ(Math.PI / 2);
  const off = SIDE / 2 + 0.06;
  for (const [y, z] of [
    [off, off],
    [off, -off],
    [-off, off],
    [-off, -off],
    [off, 0],
    [-off, 0],
    [0, off],
    [0, -off],
  ] as [number, number][]) {
    const rod = kit.group(root, [SX, AXIS + y, z]);
    kit.mesh(rodGeo, m.steel, rod);
    for (const s of [-1, 1]) kit.mesh(nut, m.steel, rod, [s * (L / 2 + 0.3), 0, 0]);
    kit.part(rod, [3.4, 0, 0], [0, 0, 0], 5);
  }

  // The separators: glass columns of lye with gas rising through them.
  const tanks: THREE.Vector3[] = [new T.Vector3(1.55, 0, 0.55), new T.Vector3(1.55, 0, -0.55)];
  const lye = kit.std({
    color: "#6ea6e0",
    transparent: true,
    opacity: 0.28,
    roughness: 0.1,
    depthWrite: false,
  });
  tanks.forEach((at, k) => {
    const g = kit.group(root, [at.x, 0.17, at.z]);
    const r = k ? 0.27 : 0.32;
    kit.mesh(kit.cyl(r, r, 1.7, 36, true), m.glass, g, [0, 1.05, 0]).renderOrder = 3;
    kit.mesh(kit.cyl(r * 0.94, r * 0.94, 1.15, 36), lye, g, [0, 0.8, 0]).renderOrder = 2;
    const cap = kit.lathe(
      [
        [r + 0.03, 0],
        [r + 0.03, 0.08],
        [r * 0.7, 0.2],
        [0.08, 0.26],
        [0.08, 0.36],
        [0, 0.36],
      ],
      32,
    );
    kit.mesh(cap, m.steel, g, [0, 1.9, 0]);
    kit.mesh(kit.cyl(r + 0.05, r + 0.05, 0.22, 32), m.steel, g, [0, 0.11, 0]);
    kit.mesh(kit.cyl(r + 0.035, r + 0.035, 0.05, 32), m.trim, g, [0, 1.3, 0]);
    // Gas line from the stack's top port to the separator.
    kit.mesh(
      kit.tube(
        [
          [SX + L / 2 + 0.35 - at.x, AXIS + 0.45 - 0.17, at.z * 0.65],
          [SX + L / 2 + 0.6 - at.x, AXIS + 0.62 - 0.17, at.z * 0.9],
          [-0.05, 1.5, 0],
          [0, 1.95, 0],
        ],
        0.05,
        24,
        10,
      ),
      m.steel,
      g,
    );
    kit.part(g, [0.6, 2.4, at.z * 1.5], [0, 0.6, 0], 6 + k * 0.4);
  });
  // Bubbles: drawn only on the machine itself, not on every copy.
  const nb = kit.count(70, 24);
  const bubbles = new T.InstancedMesh(
    kit.keep(new T.SphereGeometry(0.028, 8, 6)),
    kit.std({
      color: "#ffffff",
      emissive: kit.accent,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
    }),
    nb * 2,
  );
  bubbles.renderOrder = 2;
  kit.solo(bubbles);
  root.add(bubbles);
  const seeds = Array.from({ length: nb * 2 }, () => [
    kit.rand(),
    kit.rand(),
    kit.rand(),
    0.5 + kit.rand(),
  ]);

  // The rectifier cabinet and its busbars.
  const cab = kit.group(root, [-2.05, 0.17, 0]);
  kit.mesh(
    kit.box(0.5, 1.75, 1.3, 0.04),
    kit.std({ color: "#c9ccd0", roughness: 0.5, metalness: 0.3 }),
    cab,
    [0, 0.875, 0],
  );
  for (let i = 0; i < 6; i++)
    kit.mesh(kit.box(0.02, 0.04, 0.8), m.dark, cab, [0.26, 0.3 + i * 0.08, 0]);
  const disp = kit.std({ color: "#050505", emissive: kit.accent, emissiveIntensity: 1.1 });
  kit.mesh(kit.box(0.01, 0.24, 0.4), disp, cab, [0.26, 1.35, 0.2]);
  kit.part(cab, [-1.4, 0.3, 0], [0, -0.5, 0], 0.5);
  for (const s of [-1, 1]) {
    const x1 = SX + s * (L / 2 + 0.13);
    const bus = kit.tube(
      [
        [-1.8, 1.55, s * 0.3],
        [x1 - 0.3, 1.95, s * 0.3],
        [x1, 1.95, s * 0.3],
        [x1, AXIS + SIDE / 2 + 0.12, s * 0.3],
      ],
      0.045,
      30,
      6,
    );
    kit.part(kit.mesh(bus, m.copper, root), [0, 1.6, 0], [0, 0, 0], 7);
  }

  const v = new T.Vector3();
  return {
    root,
    size: 2.9,
    start: 3.4,
    centre: [0, 1.05, 0],
    setting: "floor",
    look: [0.72, 0.3],
    layout: { kind: "grid", spacing: [5.8, 3.5], count: 600, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const t = time * kit.speed + p * 5;
      memU.uTime.value = t;
      memU.uOn.value = run * kit.fade;
      // Bubbles rise through the lye and burst at its surface.
      seeds.forEach(([a, b, c, s], i) => {
        const tank = tanks[i % 2] as THREE.Vector3;
        const r = (i % 2 ? 0.22 : 0.27) * Math.sqrt(a as number);
        const th = (b as number) * Math.PI * 2 + t * 0.6;
        const y = ((c as number) + t * 0.35 * (s as number)) % 1;
        v.set(tank.x + Math.cos(th) * r, 0.17 + 0.25 + y * 1.1, tank.z + Math.sin(th) * r);
        const k = run > 0.05 ? 0.6 + 0.8 * y : 0;
        mm.makeScale(k, k, k).setPosition(v);
        bubbles.setMatrixAt(i, mm);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    },
  };
}
