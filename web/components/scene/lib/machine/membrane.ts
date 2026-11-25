/**
 * A membrane flow cell on its stand: two clear chambers clamped either side of a membrane in a
 * steel frame, end plates with their ports, a feed pump, and a flask filling with product. On
 * the feed side molecules of two sizes tumble about; the small ones slip through the membrane's
 * pores, glowing as they pass, while the large ones bounce back. The fleet is a plant of cells.
 */
import type * as THREE from "three";
import { type Kit, type Model, ramp } from "./kit.ts";

const AX = 1.25;
const HALF = 1.15;
const SIDE = 1.1;

export default function membrane(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();

  // Stand and base.
  kit.mesh(kit.box(3.6, 0.08, 1.5, 0.02), m.dark, root, [0.2, 0.04, 0]);
  for (const x of [-0.9, 0.9])
    kit.mesh(kit.box(0.12, AX - SIDE / 2 - 0.08, 0.9, 0.02), m.alu, root, [
      x,
      (AX - SIDE / 2) / 2 + 0.04,
      0,
    ]);
  kit.shadow(2.2, 1.1, root);

  // The membrane: a sheet of pores, lit from within.
  const pores = kit.canvas(256, 256, (g) => {
    g.fillStyle = "#222";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 18; i++) {
      for (let j = 0; j < 18; j++) {
        const x = (i + (j % 2) * 0.5) * 14.2 + 4;
        const y = j * 14.2 + 7;
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const sheetMat = kit.std({
    color: kit.accent.clone().lerp(new T.Color("#ffffff"), 0.6),
    map: pores,
    emissive: kit.accent,
    emissiveMap: pores,
    emissiveIntensity: 0.5,
    roughness: 0.5,
    transparent: true,
    opacity: 0.8,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const sheet = kit.mesh(
    new T.PlaneGeometry(SIDE, SIDE),
    sheetMat,
    root,
    [0, AX, 0],
    [0, Math.PI / 2, 0],
  );
  sheet.renderOrder = 2;
  kit.part(sheet, [0, 1.8, 0], [0, 0, 0.6], 3);

  // The clamping frame round it.
  const frame = kit.group(root, [0, AX, 0]);
  const bar = kit.box(0.1, 0.12, SIDE + 0.24, 0.02);
  for (const s of [-1, 1]) {
    kit.mesh(bar, m.steel, frame, [0, s * (SIDE / 2 + 0.06), 0]);
    kit.mesh(bar, m.steel, frame, [0, 0, s * (SIDE / 2 + 0.06)], [Math.PI / 2, 0, 0]);
  }
  kit.part(frame, [0, 2.4, 0], [0, 0.6, 0], 2);

  // The two chambers, end plates and ports.
  const chamber = kit.box(HALF - 0.08, SIDE, SIDE, 0.04);
  for (const s of [-1, 1]) {
    const c = kit.mesh(chamber, m.glass, root, [s * (HALF / 2 + 0.02), AX, 0]);
    c.renderOrder = 4;
    c.userData.noGhost = true;
    kit.part(c, [s * 1.2, 0.4, 0], [0, 0, 0], s < 0 ? 1 : 1.5);
    const end = kit.group(root, [s * (HALF + 0.04), AX, 0]);
    kit.mesh(kit.box(0.12, SIDE + 0.2, SIDE + 0.2, 0.03), m.dark, end);
    for (const [y, z] of [
      [0.62, 0.62],
      [0.62, -0.62],
      [-0.62, 0.62],
      [-0.62, -0.62],
    ] as [number, number][]) {
      kit.mesh(kit.cyl(0.03, 0.03, 2 * HALF + 0.3, 10).rotateZ(Math.PI / 2), m.steel, end, [
        -s * HALF,
        y,
        z,
      ]);
    }
    kit.mesh(kit.cyl(0.07, 0.07, 0.24, 16).rotateZ(Math.PI / 2), m.steel, end, [
      s * 0.16,
      s * 0.3,
      0,
    ]);
    kit.part(end, [s * 1.9, 0.2, 0], [0, s * 0.5, 0], s < 0 ? 0 : 0.5);
  }

  // The feed pump and its line; the product line down to a flask that fills as the story runs.
  const pump = kit.group(root, [-1.55, 0.08, 0.35]);
  kit.mesh(kit.cyl(0.18, 0.18, 0.4, 24).rotateZ(Math.PI / 2), m.paint, pump, [0, 0.22, 0]);
  kit.mesh(kit.cyl(0.14, 0.14, 0.3, 24).rotateZ(Math.PI / 2), m.dark, pump, [0.3, 0.22, 0]);
  kit.mesh(new T.SphereGeometry(0.03, 8, 6), m.accent, pump, [-0.1, 0.42, 0.1]);
  kit.mesh(
    kit.tube(
      [
        [0.4, 0.22, 0],
        [0.5, 0.6, -0.2],
        [0.35, 1.3, -0.35],
        [0.25, AX - 0.3 + 0.62, -0.35],
      ],
      0.045,
      24,
      8,
    ),
    m.rubber,
    pump,
  );
  kit.part(pump, [-0.8, 0, 0.8], [0, 0.8, 0], 4);
  const flask = kit.group(root, [1.75, 0.08, 0.1]);
  const glassProfile: [number, number][] = [
    [0.0, 0.0],
    [0.3, 0.0],
    [0.33, 0.12],
    [0.3, 0.32],
    [0.1, 0.55],
    [0.08, 0.75],
  ];
  kit.mesh(kit.lathe(glassProfile, 32), m.glass, flask).renderOrder = 4;
  const liquid = kit.std({
    color: kit.accent,
    emissive: kit.accent,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const fill = kit.mesh(kit.cyl(0.28, 0.3, 1, 28), liquid, flask, [0, 0.01, 0]);
  fill.renderOrder = 3;
  kit.live(fill);
  kit.mesh(
    kit.tube(
      [
        [-0.45, AX - 0.3 - 0.08, 0],
        [-0.25, AX - 0.5, -0.05],
        [0, 1.0, 0],
        [0, 0.7, 0],
      ],
      0.035,
      20,
      8,
    ),
    m.rubber,
    flask,
  );
  kit.part(flask, [0.8, 0, 0.6], [0, -0.6, 0], 4.5);

  // Molecules: drawn on the machine itself only.
  const nSmall = kit.count(90, 30);
  const nBig = kit.count(50, 18);
  const small = new T.InstancedMesh(
    kit.keep(new T.SphereGeometry(0.035, 10, 8)),
    kit.std({ color: kit.accent, emissive: kit.accent, emissiveIntensity: 1.6, roughness: 0.3 }),
    nSmall,
  );
  const big = new T.InstancedMesh(
    kit.keep(new T.IcosahedronGeometry(0.075, 1)),
    kit.std({ color: "#dfe3ea", roughness: 0.35, metalness: 0.1 }),
    nBig,
  );
  for (const x of [small, big]) {
    kit.solo(x);
    root.add(x);
  }
  const seed = (n: number) =>
    Array.from({ length: n }, () => [kit.rand(), kit.rand(), kit.rand(), kit.rand()]);
  const sSeeds = seed(nSmall);
  const bSeeds = seed(nBig);
  const mm = new T.Matrix4();
  const v = new T.Vector3();
  const one = new T.Vector3(1, 1, 1);
  const q = new T.Quaternion();
  const span = SIDE / 2 - 0.1;
  const place = (
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    s: number,
  ) => {
    v.set(x, AX + y, z);
    mesh.setMatrixAt(i, mm.compose(v, q, one.setScalar(s)));
  };

  return {
    root,
    size: 2.35,
    centre: [0.15, 1.0, 0],
    setting: "floor",
    look: [0.85, 0.3],
    layout: { kind: "grid", spacing: [4.6, 2.9], count: 640, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const t = time * kit.speed * 0.6 + p * 4;
      const on = ramp(p, 0.12, 0.3);
      sheetMat.emissiveIntensity = (0.35 + 1.1 * run) * kit.fade;
      sSeeds.forEach(([a, b, c, d], i) => {
        // Across the cell, left to right, wandering a little; brightest while in the membrane.
        const s = ((a as number) + t * (0.12 + 0.1 * (d as number))) % 1;
        const x = -HALF + 0.08 + s * (2 * HALF - 0.16);
        const y = ((b as number) * 2 - 1) * span + Math.sin(t * 3 + i) * 0.05;
        const z = ((c as number) * 2 - 1) * span + Math.cos(t * 2.6 + i) * 0.05;
        const pass = Math.exp(-((x / 0.08) ** 2));
        place(small, i, x, y, z, on * (1 + 1.4 * pass));
      });
      bSeeds.forEach(([a, b, c, d], i) => {
        // Back and forth on the feed side, turned away at the membrane.
        const s = ((a as number) + t * (0.1 + 0.08 * (d as number))) % 1;
        const tri = 1 - Math.abs(2 * s - 1);
        const x = -HALF + 0.12 + tri * (HALF - 0.22);
        const y = ((b as number) * 2 - 1) * span + Math.sin(t * 2 + i) * 0.04;
        const z = ((c as number) * 2 - 1) * span + Math.cos(t * 1.7 + i) * 0.04;
        place(big, i, x, y, z, on);
      });
      small.instanceMatrix.needsUpdate = true;
      big.instanceMatrix.needsUpdate = true;
      const level = 0.04 + 0.26 * ramp(p, 0.25, 0.95);
      fill.scale.set(1, level, 1);
      fill.position.y = 0.01 + level / 2;
    },
  };
}
