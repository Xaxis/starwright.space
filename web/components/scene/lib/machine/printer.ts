/**
 * A large gantry printer: an aluminium frame on a plinth, a beam riding the top rails, a carriage
 * and a hanging print head with a glowing nozzle, a spool of wire feedstock and a control panel.
 * On the bed a part grows layer by layer, its newest layer glowing, while the head traces it.
 * The fleet is a print farm.
 */
import { type Kit, type Model, ramp } from "./kit.ts";

const W = 1.45;
const TOP = 3.2;
const BED = 0.62;
const PART = 1.75;

/** The part's radius at height h above the bed: a flared, waisted casing. */
const radius = (h: number) => 0.5 + 0.16 * Math.cos(h * 3.1) + 0.08 * h;

export default function printer(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();

  // Plinth, posts, rails.
  kit.mesh(kit.box(3.3, 0.5, 3.3, 0.04), m.dark, root, [0, 0.25, 0]);
  kit.mesh(kit.box(3.32, 0.04, 0.02), m.strip, root, [0, 0.42, 1.66]);
  kit.shadow(2.2, 2.2, root);
  const post = kit.box(0.14, TOP - 0.5, 0.14, 0.02);
  for (const [x, z] of [
    [-W, -W],
    [W, -W],
    [-W, W],
    [W, W],
  ] as [number, number][]) {
    const p = kit.mesh(post, m.alu, root, [x, 0.5 + (TOP - 0.5) / 2, z]);
    kit.part(p, [x * 0.8, 0.6, z * 0.8], [0, 0.6, 0], 0.5);
  }
  const rail = kit.box(0.16, 0.16, 2 * W + 0.14, 0.02);
  for (const x of [-W, W])
    kit.part(kit.mesh(rail, m.alu, root, [x, TOP, 0]), [0, 1.2, 0], [0, 0, 0], 1);
  const crossbar = kit.box(2 * W, 0.12, 0.12, 0.02);
  for (const z of [-W, W])
    kit.part(kit.mesh(crossbar, m.alu, root, [0, TOP, z]), [0, 1.4, 0], [0, 0, 0], 1.2);

  // The bed.
  const bedTex = kit.canvas(128, 128, (g) => {
    g.fillStyle = "#24272d";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(i * 16, 0);
      g.lineTo(i * 16, 128);
      g.moveTo(0, i * 16);
      g.lineTo(128, i * 16);
      g.stroke();
    }
  });
  const bed = kit.mesh(
    kit.box(2.5, 0.1, 2.5, 0.02),
    kit.std({ map: bedTex, metalness: 0.6, roughness: 0.4 }),
    root,
    [0, BED - 0.05, 0],
  );
  kit.part(bed, [0, -0.2, 2.4], [0, 0, 0], 2);

  // The part, revolved layer by layer so the draw range can reveal it from the bottom up.
  const rings = kit.seg(90, 30);
  const wall: [number, number][] = [];
  for (let j = 0; j < rings; j++) {
    const h = (j / (rings - 1)) * PART;
    wall.push([radius(h), BED + h]);
  }
  const partGeo = kit.lathe(wall, 64);
  const segs = kit.seg(64, 8);
  const layers = kit.canvas(4, 256, (g) => {
    for (let i = 0; i < 128; i++) {
      g.fillStyle = i % 2 ? "#8d9299" : "#6c7178";
      g.fillRect(0, i * 2, 4, 2);
    }
  });
  layers.wrapT = T.RepeatWrapping;
  layers.repeat.set(1, (rings - 1) / 128);
  const metal = kit.std({ map: layers, metalness: 0.85, roughness: 0.38, side: T.DoubleSide });
  const part = kit.mesh(partGeo, metal, root);
  part.userData.noGhost = true;
  const hot = kit.std({ color: "#111111", emissive: kit.accent, emissiveIntensity: 3.2 });
  const glowRing = kit.mesh(
    kit.keep(new T.TorusGeometry(1, 0.028, 8, kit.seg(64))).rotateX(Math.PI / 2),
    hot,
    root,
  );
  glowRing.userData.noGhost = true;
  kit.live(glowRing);

  // Beam, carriage, the vertical axis and the head.
  const beam = kit.group(root, [0, TOP + 0.13, 0]);
  kit.mesh(kit.box(2 * W + 0.3, 0.16, 0.2, 0.03), m.dark, beam);
  kit.mesh(kit.box(2 * W + 0.3, 0.03, 0.04), m.strip, beam, [0, 0.09, 0.08]);
  kit.live(beam);
  kit.part(beam, [0, 1.8, 0], [0, 0.5, 0], 3);
  const carriage = kit.group(beam);
  kit.mesh(kit.box(0.34, 0.3, 0.34, 0.05), m.paint, carriage, [0, 0, 0]);
  const zbar = kit.mesh(kit.box(0.09, 1, 0.09, 0.01), m.steel, carriage, [0, -0.5, 0]);
  const head = kit.group(carriage);
  kit.mesh(kit.box(0.3, 0.26, 0.3, 0.05), m.paint, head, [0, 0.18, 0]);
  kit.mesh(kit.cyl(0.11, 0.11, 0.04, 20), m.dark, head, [0, 0.18, 0.16], [Math.PI / 2, 0, 0]);
  kit.mesh(kit.cyl(0.08, 0.02, 0.16, 20), m.copper, head, [0, -0.03, 0]);
  kit.mesh(new T.SphereGeometry(0.03, 10, 8), hot, head, [0, -0.11, 0]);
  const flare = kit.glow(kit.accent.clone().multiplyScalar(2), 0.5, head, [0, -0.11, 0], 0.9);
  kit.part(carriage, [0, 1.2, 0.6], [0, 1, 0], 4);

  // The spool of feedstock and the control panel.
  const spool = kit.group(root, [W + 0.32, 2.4, 0.4], [0, 0, Math.PI / 2]);
  kit.mesh(kit.cyl(0.42, 0.42, 0.03, 32), m.dark, spool, [0, 0.14, 0]);
  kit.mesh(kit.cyl(0.42, 0.42, 0.03, 32), m.dark, spool, [0, -0.14, 0]);
  kit.mesh(kit.cyl(0.34, 0.34, 0.25, 32), m.copper, spool);
  kit.part(spool, [1.2, 0.4, 0], [0.8, 0, 0], 5);
  const panelG = kit.group(root, [W + 0.25, 1.25, W - 0.1], [0, -0.6, 0]);
  kit.mesh(kit.box(0.08, 0.9, 0.08), m.alu, panelG, [0, -0.35, 0]);
  kit.mesh(kit.box(0.5, 0.36, 0.08, 0.03), m.dark, panelG, [0, 0.2, 0]);
  const screen = kit.std({ color: "#050505", emissive: kit.accent, emissiveIntensity: 0.9 });
  kit.mesh(kit.box(0.4, 0.26, 0.01), screen, panelG, [0, 0.2, 0.045]);
  kit.part(panelG, [0.8, 0.4, 0.8], [0, 0.6, 0], 5.5);

  const shown = { bands: -1 };
  return {
    root,
    size: 2.6,
    centre: [0, 1.6, 0],
    setting: "floor",
    look: [0.7, 0.3],
    layout: { kind: "grid", spacing: [4.6, 4.6], count: 600, jitter: 0, yaw: "same" },
    update(time, _dt, run, p) {
      const done = ramp(p, 0.22, 0.95) * 0.94 + 0.06 * ramp(p, 0.95, 1);
      const bands = Math.max(1, Math.round(done * (rings - 1)));
      if (bands !== shown.bands) {
        partGeo.setDrawRange(0, bands * segs * 6);
        shown.bands = bands;
      }
      const h = (bands / (rings - 1)) * PART;
      const r = radius(h);
      glowRing.position.y = BED + h;
      glowRing.scale.set(r, 1, r);
      glowRing.visible = p > 0.2;
      const a = time * 2.4 * kit.speed * run + p * 40;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const nozzle = BED + h + 0.12;
      beam.position.z = z;
      carriage.position.x = x;
      // The head hangs from the carriage to just above the newest layer.
      const drop = TOP + 0.13 - nozzle;
      head.position.y = -drop;
      zbar.scale.y = drop;
      zbar.position.y = -drop / 2;
      flare.material.opacity = 0.9 * ramp(p, 0.2, 0.26);
      hot.emissiveIntensity = 3.2 * kit.fade;
    },
  };
}
