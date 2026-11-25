/**
 * A solar sail unfurling: a small spacecraft with its boom deployer, four booms that telescope
 * out along the diagonals, and four quadrants of mirror film, ripstop-gridded and billowing a
 * little, opening between them. The whole sail turns slowly on its axis and flashes as its face
 * swings through the Sun's reflection. The fleet is a flotilla of sails through deep space.
 */
import type * as THREE from "three";
import { type Kit, type Model, ramp } from "./kit.ts";

const SPAN = 6;

const FILM = "#cdd2da";

export default function sail(kit: Kit): Model {
  const { T, m } = kit;
  const root = new T.Group();
  const tilt = kit.group(root, [0, 0, 0], [0.55, 0, 0.2]);
  const disc = kit.group(tilt);
  kit.spinner(disc, "y");

  // The craft at the hub.
  const bus = kit.group(disc);
  kit.mesh(kit.box(0.7, 0.5, 0.7, 0.04), m.gold, bus, [0, -0.32, 0]);
  kit.mesh(kit.cyl(0.42, 0.42, 0.2, 32), m.dark, bus, [0, 0.02, 0]);
  kit.mesh(kit.cyl(0.18, 0.18, 0.12, 24), m.steel, bus, [0, 0.16, 0]);
  kit.mesh(new T.SphereGeometry(0.05, 10, 8), m.accent, bus, [0, 0.25, 0]);
  const cells = kit.std({ color: "#13244a", metalness: 0.4, roughness: 0.25 });
  kit.mesh(kit.box(0.6, 0.03, 0.3, 0.01), cells, bus, [0, -0.6, 0]);
  kit.part(bus, [0, -1.4, 0], [0, 0.8, 0], 0);

  // Ripstop film: a faint grid of seams on bright metal.
  const grid = kit.canvas(256, 256, (g) => {
    g.fillStyle = "#f2f4f7";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(120,130,150,0.55)";
    g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      g.beginPath();
      g.moveTo(i * 16, 0);
      g.lineTo(i * 16, 256);
      g.moveTo(0, i * 16);
      g.lineTo(256, i * 16);
      g.stroke();
    }
  });
  const film = kit.std({
    map: grid,
    color: FILM,
    metalness: 1,
    roughness: 0.38,
    side: T.DoubleSide,
    envMapIntensity: 1,
  });

  // A quadrant between two booms, as a sagging triangle whose shape is redrawn as it unfurls.
  const res = kit.detail < 1 ? 10 : 18;
  const quadrant = () => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const id = (i: number, j: number) => (i * (2 * res + 3 - i)) / 2 + j;
    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res - i; j++) {
        pos.push(0, 0, 0);
        uv.push((i / res) * 3, (j / res) * 3);
      }
    }
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res - i; j++) {
        idx.push(id(i, j), id(i + 1, j), id(i, j + 1));
        if (j < res - i - 1) idx.push(id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return kit.keep(g);
  };
  const quads: THREE.BufferGeometry[] = [];
  const tips: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    tips.push([Math.cos(a) * SPAN, Math.sin(a) * SPAN]);
  }
  for (let k = 0; k < 4; k++) {
    const g = quadrant();
    quads.push(g);
    const q = kit.mesh(g, film, disc);
    q.userData.noGhost = true;
  }
  const shape = (u: number) => {
    quads.forEach((g, k) => {
      const [ax, az] = tips[k] as [number, number];
      const [bx, bz] = tips[(k + 1) % 4] as [number, number];
      const attr = g.getAttribute("position") as THREE.BufferAttribute;
      let n = 0;
      for (let i = 0; i <= res; i++) {
        for (let j = 0; j <= res - i; j++) {
          const s = i / res;
          const t = j / res;
          const billow = s * t * (1 - s - t) * 6.75;
          // Folded while stowed: pleats that flatten as the film pulls taut.
          const pleat = (1 - u) * 0.18 * Math.sin((s - t) * 28);
          attr.setXYZ(
            n++,
            (s * ax + t * bx) * u,
            -0.42 * billow * u + pleat * u * (s + t),
            (s * az + t * bz) * u,
          );
        }
      }
      attr.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    });
  };

  // Booms, their tips lit, telescoping out with the film.
  const booms: THREE.Group[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const b = kit.group(disc, [0, 0.02, 0], [0, -a, 0]);
    const rod = kit
      .cyl(0.035, 0.05, 1, 10)
      .rotateZ(Math.PI / 2)
      .translate(0.5, 0, 0);
    kit.mesh(rod, m.alu, b);
    const tip = kit.mesh(new T.SphereGeometry(0.06, 10, 8), m.accent, b, [1, 0, 0]);
    tip.userData.noGhost = true;
    booms.push(b);
    const dock = kit.mesh(
      kit.box(0.24, 0.16, 0.16, 0.03),
      m.dark,
      disc,
      [Math.cos(a) * 0.45, 0.02, Math.sin(a) * 0.45],
      [0, -a, 0],
    );
    kit.part(dock, [Math.cos(a) * 1.4, 0.4, Math.sin(a) * 1.4], [0, 1, 0], 1 + k * 0.3);
  }
  const deploy = { u: -1 };
  const unfurl = (u: number) => {
    if (u === deploy.u) return;
    deploy.u = u;
    shape(Math.max(0.03, u));
    for (const b of booms) {
      b.scale.set(Math.max(0.05, u) * SPAN, 1, 1);
      (b.children[1] as THREE.Object3D).scale.set(1 / (Math.max(0.05, u) * SPAN), 1, 1);
    }
  };
  unfurl(1);
  kit.live(disc);

  return {
    root,
    size: SPAN * 0.95,
    start: 2,
    centre: [0, 0, 0],
    setting: "space",
    look: [0.85, 0.45],
    lookFar: 0.3,
    layout: {
      kind: "volume",
      spacing: 19,
      count: 260,
      jitter: 0.35,
      yaw: "random",
      height: [-9, 9],
      tumble: 0.35,
    },
    update(time, _dt, _run, p) {
      unfurl(ramp(p, 0.16, 0.46));
      // A sail is a mirror: hundreds of them catching the Sun would bloom into fog, so the film
      // dulls as the fleet grows.
      const dull = (1 - kit.fade) / 0.6;
      film.color.set(FILM).multiplyScalar(1 - 0.3 * dull);
      film.roughness = 0.38 + 0.37 * dull;
      disc.rotation.y = time * 0.08 * kit.speed + p * 1.4;
    },
  };
}
