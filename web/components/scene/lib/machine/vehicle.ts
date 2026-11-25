/**
 * An electric hauler on six wheels: a chassis on rocker-bogie suspension, a cab with a dark
 * windscreen, headlights and a beacon mast, a solar roof, and an ore bin with its load. The
 * wheels turn as it drives. The fleet is a working fleet spread across the plain.
 */
import type * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Kit, Model } from "./kit.ts";

const R = 0.44;
const TRACK = 0.98;
const XS = [-1.12, 0, 1.12];

export default function vehicle(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  kit.shadow(2.3, 1.5, root, [0, 0.005, 0], 0.85);

  // A wheel: a rounded tyre with lugs, as one geometry, its axle along z.
  const tyre = new T.LatheGeometry(
    (
      [
        [0.27, -0.17],
        [R - 0.03, -0.17],
        [R, -0.13],
        [R, 0.13],
        [R - 0.03, 0.17],
        [0.27, 0.17],
      ] as [number, number][]
    ).map(([r, y]) => new T.Vector2(r, y)),
    kit.seg(36, 12),
  );
  const lugs: THREE.BufferGeometry[] = [tyre];
  const nLug = 16;
  for (let i = 0; i < nLug; i++) {
    const a = (i / nLug) * Math.PI * 2;
    const lug = new T.BoxGeometry(0.06, 0.3, 0.07);
    lug.rotateY(a);
    lug.translate(Math.sin(a) * (R + 0.02), 0, Math.cos(a) * (R + 0.02));
    lugs.push(lug);
  }
  const wheelGeo = kit.keep(mergeGeometries(lugs) ?? tyre.clone());
  wheelGeo.rotateX(Math.PI / 2);
  for (const g of lugs) g.dispose();
  const hubGeo = kit.cyl(0.2, 0.2, 0.36, 24).rotateX(Math.PI / 2);

  const wheels: THREE.Group[] = [];
  for (const x of XS) {
    for (const s of [-1, 1]) {
      const w = kit.group(root, [x, R, s * TRACK]);
      const spin = kit.group(w);
      kit.spinner(spin, "z");
      kit.mesh(wheelGeo, m.rubber, spin);
      kit.mesh(hubGeo, m.steel, spin);
      kit.mesh(kit.keep(new T.TorusGeometry(0.2, 0.018, 6, 24)), m.strip, spin, [0, 0, s * 0.18]);
      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * Math.PI * 2;
        kit.mesh(kit.cyl(0.025, 0.025, 0.05, 8).rotateX(Math.PI / 2), m.dark, spin, [
          Math.cos(a) * 0.12,
          Math.sin(a) * 0.12,
          s * 0.19,
        ]);
      }
      wheels.push(spin);
      kit.part(w, [0, 0.2, s * 1.4], [0, 0, 0], 3 + (x + 1.2) * 0.2);
    }
  }

  // Rocker-bogie links from the chassis to each wheel.
  const link = kit.box(1.2, 0.1, 0.1, 0.03);
  for (const s of [-1, 1]) {
    const susp = kit.group(root, [0, 0, s * (TRACK - 0.2)]);
    kit.mesh(link, m.dark, susp, [-0.56, R + 0.2, 0], [0, 0, -0.35]);
    kit.mesh(link, m.dark, susp, [0.56, R + 0.2, 0], [0, 0, 0.35]);
    kit.mesh(kit.cyl(0.09, 0.09, 0.14, 16).rotateX(Math.PI / 2), m.steel, susp, [0, R + 0.4, 0]);
    kit.part(susp, [0, 0, s * 0.8], [0, 0, 0], 2);
  }

  // The chassis.
  const chassis = kit.mesh(kit.box(3.1, 0.34, 1.5, 0.06), m.dark, root, [0, R + 0.5, 0]);
  kit.part(chassis, [0, 0.8, 0], [0, 0, 0], 0);

  // The cab, its windscreen, lights and mast.
  const cab = kit.group(root, [1.05, R + 0.67, 0]);
  kit.mesh(kit.box(0.95, 0.72, 1.46, 0.12), m.paint, cab, [0, 0.36, 0]);
  const screen = kit.std({ color: "#0b0f15", metalness: 0.7, roughness: 0.08 });
  kit.mesh(kit.box(0.04, 0.38, 1.3, 0.02), screen, cab, [0.47, 0.44, 0], [0, 0, -0.25]);
  kit.mesh(kit.box(0.5, 0.36, 0.02, 0.01), screen, cab, [0.05, 0.45, 0.735]);
  kit.mesh(kit.box(0.5, 0.36, 0.02, 0.01), screen, cab, [0.05, 0.45, -0.735]);
  for (const z of [-0.5, 0.5]) {
    kit.mesh(kit.box(0.03, 0.08, 0.22, 0.01), m.lamp, cab, [0.48, 0.12, z]);
    kit.solo(kit.glow(new T.Color("#fff2dc").multiplyScalar(1.2), 0.55, cab, [0.55, 0.12, z], 0.6));
  }
  kit.mesh(kit.box(0.02, 0.03, 1.4), m.accent, cab, [0.48, 0.26, 0]);
  const solar = kit.std({ color: "#142a55", metalness: 0.4, roughness: 0.25 });
  kit.mesh(kit.box(0.9, 0.04, 1.38, 0.01), solar, cab, [0, 0.74, 0]);
  kit.mesh(kit.cyl(0.02, 0.02, 0.6, 8), m.steel, cab, [-0.35, 1.04, -0.55]);
  kit.mesh(new T.SphereGeometry(0.05, 10, 8), m.accent, cab, [-0.35, 1.36, -0.55]);
  kit.solo(kit.glow(kit.accent.clone().multiplyScalar(1.5), 0.6, cab, [-0.35, 1.36, -0.55], 0.8));
  kit.part(cab, [0.6, 1.3, 0], [0, 0.4, 0], 4);

  // The ore bin and its load.
  const bin = kit.group(root, [-0.55, R + 0.67, 0]);
  const wall = kit.std({
    color: kit.accent.clone().lerp(new T.Color("#808080"), 0.35),
    roughness: 0.55,
    metalness: 0.3,
  });
  kit.mesh(kit.box(1.9, 0.06, 1.46, 0.02), wall, bin, [0, 0.03, 0]);
  for (const s of [-1, 1]) {
    kit.mesh(kit.box(1.9, 0.62, 0.06, 0.02), wall, bin, [0, 0.34, s * 0.7]);
    kit.mesh(kit.box(0.06, 0.62, 1.46, 0.02), wall, bin, [s * 0.92, 0.34, 0]);
  }
  kit.mesh(kit.box(1.92, 0.04, 0.08), m.dark, bin, [0, 0.66, 0.7]);
  kit.part(bin, [-0.8, 1.5, 0], [0, -0.3, 0], 5);
  const ore = kit.group(bin);
  const rock = kit.std({ color: "#4a4038", roughness: 0.95, flatShading: true });
  const lump = kit.keep(new T.IcosahedronGeometry(0.2, 0));
  for (let i = 0; i < 14; i++) {
    const r = kit.rand;
    const l = kit.mesh(
      lump,
      rock,
      ore,
      [(r() - 0.5) * 1.5, 0.45 + r() * 0.25, (r() - 0.5) * 1.1],
      [r() * 3, r() * 3, 0],
    );
    l.scale.setScalar(0.7 + r() * 0.8);
  }
  kit.part(ore, [0, 2.4, 0], [0, 1, 0], 6);

  return {
    root,
    size: 2.25,
    centre: [0, 1.0, 0],
    setting: "ground",
    look: [0.62, 0.22],
    lookFar: 0.2,
    layout: { kind: "grid", spacing: [7.5, 6.5], count: 520, jitter: 0.35, yaw: 0.6 },
    update(time, _dt, run, p) {
      const a = -(time * 2.2 * kit.speed * run + p * 8);
      for (const w of wheels) w.rotation.z = a;
    },
  };
}
