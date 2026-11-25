/**
 * A wind turbine: a tapered steel tower in three sections on a concrete footing, the nacelle with
 * its yaw bearing and beacon, and a three-bladed rotor whose blades are lofted airfoils, twisted
 * and tapered from a round root to a slender tip. The rotor faces +z. The fleet is a wind farm.
 */
import type * as THREE from "three";
import type { Kit, Model } from "./kit.ts";

/** One blade along +y: airfoil sections lofted from the root to the tip, chord along x. */
export function blade(kit: Kit, length: number, chord: number): THREE.BufferGeometry {
  const { T } = kit;
  const stations = kit.seg(22, 10);
  const around = kit.seg(18, 10);
  const pos: number[] = [];
  for (let j = 0; j <= stations; j++) {
    const t = j / stations;
    // Round at the root, widest a fifth of the way out, then a long taper.
    const c =
      chord *
      (t < 0.2
        ? 0.45 + 0.55 * Math.sin((t / 0.2) * Math.PI * 0.5)
        : 1 - 0.85 * ((t - 0.2) / 0.8) ** 0.8);
    const thick = t < 0.2 ? 1 - 0.8 * (t / 0.2) : 0.2 - 0.08 * ((t - 0.2) / 0.8);
    const twist = (16 * (1 - t) ** 1.6 * Math.PI) / 180;
    const bend = 0.04 * length * t * t;
    const ct = Math.cos(twist);
    const st = Math.sin(twist);
    for (let i = 0; i <= around; i++) {
      const a = (i / around) * Math.PI * 2;
      // A teardrop: blunt leading edge at x = -0.3c, sharp trailing edge at 0.7c.
      const u = 0.5 + 0.5 * Math.cos(a);
      const x = c * (u - 0.3);
      const z = 0.5 * c * thick * Math.sin(a) * (1.15 - 0.85 * u) * (t < 0.2 ? 1 : 1.2);
      pos.push(x * ct - z * st, length * t, x * st + z * ct + bend);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < stations; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i;
      const b = a + 1;
      const c = a + around + 2;
      const d = a + around + 1;
      idx.push(a, d, b, c, b, d);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return kit.keep(g);
}

export default function turbine(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const H = 9;
  const concrete = kit.std({ color: "#5d5a55", roughness: 0.9 });
  kit.mesh(kit.cyl(1.05, 1.15, 0.24, 40), concrete, root, [0, 0.12, 0]);
  kit.shadow(2.6, 2.6, root);

  // The tower: three tapered sections with a flange at each joint.
  const radius = (y: number) => 0.34 - (0.14 * y) / H;
  for (let k = 0; k < 3; k++) {
    const y0 = (k * H) / 3;
    const y1 = ((k + 1) * H) / 3;
    const sec = kit.group(root, [0, 0.24 + y0, 0]);
    kit.mesh(kit.cyl(radius(y1), radius(y0), y1 - y0, 40, true), m.paint, sec, [
      0,
      (y1 - y0) / 2,
      0,
    ]);
    kit.mesh(kit.cyl(radius(y1) + 0.03, radius(y1) + 0.03, 0.06, 40), m.alu, sec, [
      0,
      y1 - y0 - 0.03,
      0,
    ]);
    if (k === 0) kit.mesh(kit.box(0.3, 0.5, 0.06, 0.02), m.dark, sec, [0, 0.5, radius(0.5) + 0.01]);
    kit.part(sec, [0, 0.8 * k, 0], [0, 0.4 * (k - 1), 0], k);
  }
  const top = 0.24 + H;

  // The nacelle, on its yaw bearing, with a beacon on the roof.
  const nacelle = kit.group(root, [0, top, 0]);
  kit.mesh(kit.cyl(0.3, 0.3, 0.2, 32), m.dark, nacelle, [0, 0.1, 0]);
  kit.mesh(kit.box(0.92, 0.95, 2.4, 0.22), m.paint, nacelle, [0, 0.55, -0.35]);
  kit.mesh(kit.box(0.94, 0.08, 2.0, 0.03), m.trim, nacelle, [0, 0.36, -0.45]);
  kit.mesh(kit.box(0.5, 0.2, 0.6, 0.05), m.dark, nacelle, [0, 1.08, -1.0]);
  kit.mesh(kit.box(0.04, 0.5, 0.5, 0.01), m.dark, nacelle, [0.47, 0.6, -1.2]);
  kit.mesh(new T.SphereGeometry(0.07, 12, 8), m.accent, nacelle, [0, 1.06, -1.3]);
  kit.glow(kit.accent.clone().multiplyScalar(1.4), 0.9, nacelle, [0, 1.06, -1.3], 0.8);
  kit.part(nacelle, [0, 2.4, -0.6], [0, -0.6, 0], 3);

  // The rotor: spinner and three blades, turning about z.
  const hub = kit.group(root, [0, top + 0.55, 0.92]);
  const rotor = kit.group(hub);
  kit.spinner(rotor, "z");
  const spinner = kit.mesh(
    kit.lathe(
      [
        [0.4, -0.08],
        [0.44, 0.12],
        [0.42, 0.36],
        [0.34, 0.62],
        [0.2, 0.84],
        [0.06, 0.96],
        [0, 0.98],
      ],
      40,
    ),
    m.paint,
    rotor,
    [0, 0, -0.1],
    [Math.PI / 2, 0, 0],
  );
  spinner.userData.noGhost = false;
  kit.mesh(kit.cyl(0.41, 0.41, 0.05, 40), m.trim, rotor, [0, 0, -0.06], [Math.PI / 2, 0, 0]);
  const bladeGeo = blade(kit, 5.4, 0.78);
  for (let k = 0; k < 3; k++) {
    const arm = kit.group(rotor, [0, 0, 0.12], [0, 0, (k * Math.PI * 2) / 3]);
    kit.mesh(bladeGeo, m.paint, arm, [0, 0.3, 0]);
    kit.mesh(kit.cyl(0.2, 0.2, 0.18, 24), m.alu, arm, [0, 0.36, 0]);
    const dir = new T.Vector3(0, 1, 0).applyAxisAngle(
      new T.Vector3(0, 0, 1),
      (k * Math.PI * 2) / 3,
    );
    kit.part(arm, [dir.x * 1.6, dir.y * 1.6, 2.6], [0, 0.8, 0], 5 + k);
  }
  kit.part(hub, [0, 2.4, 2.2], [0, 0, 1.2], 4);

  return {
    root,
    size: 7.6,
    centre: [0, 7.6, 0],
    setting: "ground",
    look: [0.95, 0.12],
    layout: {
      kind: "grid",
      spacing: [21, 26],
      count: 520,
      jitter: 0.32,
      yaw: 0.08,
      scale: [0.88, 1.08],
    },
    update(time, _dt, run, p) {
      rotor.rotation.z = 0.3 - (time * 1.6 * kit.speed * run + p * 6);
    },
  };
}
