/**
 * The things the systems scenes are built from, as low-poly geometry in metres with the origin on
 * the ground at each unit's centre: a field's panels, mirrors, turbines, greenhouses, tanks, fabs,
 * racks, houses, towers, wells, farms and kelp lines. Each unit is a few parts, one per look (glass,
 * white paint, glowing band...), so a field of them is a handful of instanced draws.
 */
import type * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { KindContext } from "../../types.ts";
import { glowTexture } from "../bodies.ts";
import { canvasTexture, type GrowClock, growMaterial, type Part } from "./grow.ts";

type T3 = typeof THREE;

/** Geometry helpers: positions are centres, rotations in radians (x, then y, then z). */
export function shapes(T: T3) {
  const place = (
    g: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  return {
    box: (w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
      place(new T.BoxGeometry(w, h, d), x, y, z, rx, ry, rz),
    cyl: (
      rt: number,
      rb: number,
      h: number,
      x = 0,
      y = 0,
      z = 0,
      seg = 12,
      open = false,
      rx = 0,
      rz = 0,
    ) => place(new T.CylinderGeometry(rt, rb, h, seg, 1, open), x, y, z, rx, 0, rz),
    ball: (r: number, x = 0, y = 0, z = 0, seg = 12, half = false) =>
      place(
        new T.SphereGeometry(
          r,
          seg,
          Math.max(4, seg / 2),
          0,
          Math.PI * 2,
          0,
          half ? Math.PI / 2 : Math.PI,
        ),
        x,
        y,
        z,
      ),
    /** A gable roof along x: a box turned 45 degrees and flattened. */
    roof: (len: number, width: number, pitch: number, y: number, x = 0, z = 0) => {
      const s = width / Math.SQRT2;
      const g = new T.BoxGeometry(len, s, s);
      g.rotateX(Math.PI / 4);
      g.scale(1, pitch, 1);
      g.translate(x, y, z);
      return g;
    },
    /** A flat decal on the ground. */
    decal: (w: number, d: number, y = 0.04) => {
      const g = new T.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      return g;
    },
    merge: (gs: THREE.BufferGeometry[]) => {
      const flat = gs.map((g) => {
        const out = g.index ? g.toNonIndexed() : g;
        if (out !== g) g.dispose();
        return out;
      });
      const m = mergeGeometries(flat, false) as THREE.BufferGeometry;
      for (const g of flat) g.dispose();
      return m;
    },
  };
}

/**
 * The looks every unit draws from. Glow looks switch on once a copy is built; the build glow
 * (the accent) shows on every look while a copy is going up.
 */
export function makeLooks(
  ctx: KindContext,
  clock: GrowClock,
  opts: { bob?: number; grow?: "rise" | "pop" | "print"; height?: number } = {},
) {
  const grow = opts.grow ?? "rise";
  const bob = opts.bob;
  const cells = canvasTexture(ctx, 256, 128, (g) => {
    g.fillStyle = "#13284f";
    g.fillRect(0, 0, 256, 128);
    const grad = g.createLinearGradient(0, 0, 256, 128);
    grad.addColorStop(0, "rgba(90,130,200,0.25)");
    grad.addColorStop(1, "rgba(10,20,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "rgba(190,205,230,0.7)";
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 256 / 12) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 128);
      g.stroke();
    }
    for (let y = 0; y <= 128; y += 128 / 6) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
  });
  const base = { grow, bob, height: opts.height };
  const accent = ctx.colour;
  const looks: Record<string, THREE.MeshStandardMaterial> = {
    white: growMaterial(ctx, clock, {
      ...base,
      colour: "#bdb8ae",
      roughness: 0.55,
      metalness: 0.15,
    }),
    frame: growMaterial(ctx, clock, { ...base, colour: "#9aa1ab", roughness: 0.4, metalness: 0.7 }),
    dark: growMaterial(ctx, clock, { ...base, colour: "#24272e", roughness: 0.6, metalness: 0.4 }),
    glass: growMaterial(ctx, clock, {
      ...base,
      colour: "#ffffff",
      map: cells,
      roughness: 0.14,
      metalness: 0.45,
    }),
    mirror: growMaterial(ctx, clock, { ...base, colour: "#e8eef5", roughness: 0.04, metalness: 1 }),
    glow: growMaterial(ctx, clock, {
      ...base,
      colour: "#202020",
      emissive: accent,
      emissiveIntensity: 3.2,
      lights: true,
      flicker: 0.25,
    }),
    warm: growMaterial(ctx, clock, {
      ...base,
      colour: "#302418",
      emissive: "#ffb766",
      emissiveIntensity: 1.3,
      lights: true,
      flicker: 0.1,
    }),
    red: growMaterial(ctx, clock, {
      ...base,
      colour: "#300808",
      emissive: "#ff3020",
      emissiveIntensity: 5,
      lights: true,
      flicker: 0.95,
    }),
    greenhouse: growMaterial(ctx, clock, {
      ...base,
      colour: "#c9d4da",
      roughness: 0.3,
      metalness: 0.1,
      emissive: "#ff5fcf",
      emissiveIntensity: 0.9,
      lights: true,
      flicker: 0.05,
    }),
    barn: growMaterial(ctx, clock, { ...base, colour: "#7a3a2c", roughness: 0.75 }),
    soil: growMaterial(ctx, clock, { ...base, colour: "#5a4630", roughness: 0.95 }),
    buoy: growMaterial(ctx, clock, {
      ...base,
      colour: "#ff8a3d",
      roughness: 0.5,
      emissive: "#ff8a3d",
      emissiveIntensity: 0.6,
      lights: true,
    }),
    kelp: growMaterial(ctx, clock, { ...base, colour: "#3d3c14", roughness: 0.8 }),
    basalt: growMaterial(ctx, clock, {
      ...base,
      colour: "#4a4643",
      roughness: 0.85,
      metalness: 0.1,
    }),
    copper: growMaterial(ctx, clock, { ...base, colour: "#c07a45", roughness: 0.3, metalness: 1 }),
    gold: growMaterial(ctx, clock, { ...base, colour: "#d8ab58", roughness: 0.22, metalness: 1 }),
    blade: growMaterial(ctx, clock, {
      ...base,
      colour: "#e4e2dc",
      roughness: 0.45,
      spin: { pivot: [0, 91.5, 5.6], axis: "z", speed: 1.1 },
    }),
    fan: growMaterial(ctx, clock, {
      ...base,
      colour: "#30343c",
      roughness: 0.5,
      metalness: 0.5,
      spin: { pivot: [0, 0, 0], axis: "y", speed: 2.5 },
    }),
    shadow: growMaterial(ctx, clock, {
      grow: "pop",
      colour: "#000000",
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      buildGlow: 0,
    }),
  };
  const shade = looks.shadow as THREE.MeshStandardMaterial;
  shade.alphaMap = glowTexture(ctx);
  shade.polygonOffset = true;
  shade.polygonOffsetFactor = -2;
  return {
    looks,
    dispose() {
      cells.dispose();
      for (const m of Object.values(looks)) m.dispose();
    },
  };
}

export type UnitName =
  | "panel"
  | "mirror"
  | "turbine"
  | "greenhouse"
  | "tank"
  | "fab"
  | "rack"
  | "house"
  | "tower"
  | "well"
  | "farm"
  | "kelp";

export interface Unit {
  parts: Part[];
  /** Footprint and height, metres. */
  size: [number, number, number];
  /** Spacing between copies in a block, metres (x, z). */
  spacing: [number, number];
  /** Copies per block (x, z) and the road between blocks, metres. */
  block: [number, number];
  road: number;
  layout: "rows" | "rings";
  /** Where each copy's lights glow, and their colour. */
  lights: [number, number, number][];
  light: string;
  /** Height and offset (z) of the cable or pipe that runs along each row. */
  cable: [number, number];
}

/** A field's unit, by name. Geometry is new each call: the caller disposes the parts. */
export function fieldUnit(ctx: KindContext, name: UnitName, accent: string): Unit {
  const s = shapes(ctx.three);
  const P = (geo: THREE.BufferGeometry, look: string, frame?: "base" | "aim"): Part => ({
    geo,
    look,
    frame,
  });
  switch (name) {
    case "panel":
      return {
        parts: [
          P(s.box(4.4, 0.05, 2.2, 0, 1.35, 0, 0.44), "glass"),
          P(
            s.merge([s.box(0.1, 1.3, 0.1, -1.7, 0.65, 0), s.box(0.1, 1.3, 0.1, 1.7, 0.65, 0)]),
            "frame",
          ),
          P(s.box(4.3, 0.05, 0.05, 0, 0.86, 1.0), "glow"),
          P(s.decal(4.6, 2.8), "shadow"),
        ],
        size: [4.4, 2.2, 1.9],
        spacing: [4.8, 6.4],
        block: [12, 5],
        road: 7,
        layout: "rows",
        lights: [[0, 0.86, 1.0]],
        light: accent,
        cable: [0.86, 1.0],
      };
    case "mirror":
      return {
        parts: [
          P(s.cyl(0.16, 0.22, 3.4, 0, 1.7, 0, 8), "frame"),
          P(s.box(5.2, 0.08, 5.2), "mirror", "aim"),
          P(s.box(5, 0.2, 0.3, 0, -0.14, 0), "dark", "aim"),
          P(s.decal(6.5, 6.5), "shadow"),
        ],
        size: [5.2, 5.2, 6],
        spacing: [7.6, 9],
        block: [1, 1],
        road: 0,
        layout: "rings",
        lights: [],
        light: accent,
        cable: [0.3, 0],
      };
    case "turbine": {
      const blades = [0, 1, 2].map((k) => {
        const g = s.box(1.8, 52, 0.4, 0, 27, 0);
        g.rotateZ((k * Math.PI * 2) / 3);
        g.translate(0, 91.5, 5.6);
        return g;
      });
      return {
        parts: [
          P(
            s.merge([
              s.cyl(1.4, 2.4, 90, 0, 45, 0, 14),
              s.box(3.6, 3.6, 11, 0, 91.5, -0.5),
              s.ball(1.9, 0, 91.5, 5.2),
            ]),
            "white",
          ),
          { geo: s.merge(blades), look: "blade" },
          P(s.ball(0.6, 0, 93.7, -4.5, 8), "red"),
          P(s.decal(16, 16), "shadow"),
        ],
        size: [10, 110, 145],
        spacing: [320, 260],
        block: [4, 3],
        road: 0,
        layout: "rows",
        lights: [[0, 93.9, -4.5]],
        light: "#ff3a2a",
        cable: [0.3, 6],
      };
    }
    case "greenhouse": {
      const tube = new ctx.three.CylinderGeometry(5, 5, 40, 18, 1, true, 0, Math.PI);
      tube.rotateZ(Math.PI / 2);
      tube.translate(0, 0.3, 0);
      const endA = new ctx.three.CircleGeometry(5, 12, 0, Math.PI);
      endA.rotateY(Math.PI / 2);
      endA.translate(20, 0.3, 0);
      const endB = new ctx.three.CircleGeometry(5, 12, 0, Math.PI);
      endB.rotateY(-Math.PI / 2);
      endB.translate(-20, 0.3, 0);
      return {
        parts: [
          P(s.merge([tube, endA, endB]), "greenhouse"),
          P(s.box(40.6, 0.3, 10.6, 0, 0.15, 0), "dark"),
          P(s.decal(44, 14), "shadow"),
        ],
        size: [40, 10, 5.3],
        spacing: [46, 15],
        block: [3, 6],
        road: 12,
        layout: "rows",
        lights: [[20.2, 2.5, 0]],
        light: "#ff6ad5",
        cable: [0.4, 5.6],
      };
    }
    case "tank":
      return {
        parts: [
          P(s.merge([s.cyl(4, 4, 11, 0, 5.5, 0, 20), s.ball(4, 0, 11, 0, 20, true)]), "white"),
          P(s.cyl(4.08, 4.08, 0.55, 0, 7.6, 0, 20, true), "glow"),
          P(
            s.merge([s.cyl(4.4, 4.4, 0.4, 0, 0.2, 0, 20), s.box(13, 0.35, 0.35, 6.5, 2.2, 3.4)]),
            "frame",
          ),
          P(s.decal(11, 11), "shadow"),
        ],
        size: [8, 8, 15],
        spacing: [13, 13],
        block: [6, 4],
        road: 9,
        layout: "rows",
        lights: [[0, 7.6, 4.15]],
        light: accent,
        cable: [2.2, 3.4],
      };
    case "fab": {
      const teeth: THREE.BufferGeometry[] = [];
      const windows: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) {
        const z = -11.2 + k * 5.6;
        teeth.push(s.box(56, 0.25, 6.1, 0, 10.3, z, -0.42));
        windows.push(s.box(56, 2.4, 0.2, 0, 10.4, z - 2.7));
      }
      return {
        parts: [
          P(s.merge([s.box(56, 9, 28, 0, 4.5, 0), s.cyl(1.2, 1.6, 22, 22, 11, -9, 10)]), "white"),
          P(s.merge(teeth), "glass"),
          P(s.merge([...windows, s.box(56.3, 1.1, 28.3, 0, 6, 0)]), "warm"),
          P(s.cyl(1.3, 1.3, 0.7, 22, 21.6, -9, 10, true), "glow"),
          P(s.box(64, 0.08, 36, 0, 0.04, 0), "dark"),
        ],
        size: [56, 28, 22],
        spacing: [80, 50],
        block: [3, 2],
        road: 22,
        layout: "rows",
        lights: [[22, 21.8, -9]],
        light: accent,
        cable: [0.3, 16],
      };
    }
    case "rack":
      return {
        parts: [
          P(s.box(12, 2.6, 2.5, 0, 1.3, 0), "dark"),
          P(
            s.merge([s.box(11, 0.22, 0.06, 0, 1.95, 1.27), s.box(11, 0.22, 0.06, 0, 0.85, 1.27)]),
            "glow",
          ),
          P(
            s.merge([
              s.cyl(0.9, 0.9, 0.3, -4, 2.75, 0),
              s.cyl(0.9, 0.9, 0.3, 0, 2.75, 0),
              s.cyl(0.9, 0.9, 0.3, 4, 2.75, 0),
              s.box(0.12, 2.3, 2.3, -6.06, 1.3, 0),
              s.box(0.12, 2.3, 2.3, 6.06, 1.3, 0),
            ]),
            "frame",
          ),
          P(s.decal(14, 4.5), "shadow"),
        ],
        size: [12, 2.5, 2.9],
        spacing: [14.5, 6],
        block: [4, 8],
        road: 9,
        layout: "rows",
        lights: [[0, 1.95, 1.32]],
        light: accent,
        cable: [0.3, 1.8],
      };
    case "house":
      return {
        parts: [
          P(s.box(8, 3, 7, 0, 1.5, 0), "white"),
          P(s.roof(8.6, 7.6, 0.55, 3), "dark"),
          P(
            s.merge([
              s.box(1.2, 1, 7.06, -2, 1.6, 0),
              s.box(1.2, 1, 7.06, 2, 1.6, 0),
              s.box(8.06, 1, 1.2, 0, 1.6, 0),
            ]),
            "warm",
          ),
          P(s.box(3, 0.06, 1.8, 1.6, 4.05, 1.4, 0.5), "glass"),
          P(s.decal(11, 10), "shadow"),
        ],
        size: [8, 7, 5],
        spacing: [22, 22],
        block: [1, 1],
        road: 0,
        layout: "rings",
        lights: [[0, 1.6, 3.6]],
        light: "#ffb766",
        cable: [0.3, 0],
      };
    case "tower": {
      const bands: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 8; k++) bands.push(s.cyl(5.12, 5.12, 0.9, 0, 5 + k * 4.9, 0, 14, true));
      return {
        parts: [
          P(
            s.merge([s.cyl(5, 5.6, 44, 0, 22, 0, 14), s.cyl(5.6, 5.6, 3, 0, 45.5, 0, 14)]),
            "white",
          ),
          P(s.merge(bands), "glow"),
          P(s.cyl(4.2, 4.2, 0.3, 0, 47.2, 0, 14), "fan"),
          P(s.decal(16, 16), "shadow"),
        ],
        size: [11, 11, 47],
        spacing: [34, 34],
        block: [5, 5],
        road: 18,
        layout: "rows",
        lights: [[0, 47.6, 0]],
        light: accent,
        cable: [0.3, 7],
      };
    }
    case "well":
      return {
        parts: [
          P(s.merge([s.box(3, 1.4, 3, 0, 0.7, 0), s.cyl(0.9, 0.9, 1.4, 0, 14.4, 0, 10)]), "frame"),
          P(
            s.merge([s.cyl(0.22, 0.3, 13, 0, 7.9, 0, 8), s.cyl(0.9, 0.9, 1.8, 2.3, 0.9, 0, 10)]),
            "white",
          ),
          P(s.ball(0.38, 0, 15.5, 0, 8), "glow"),
          P(s.decal(6, 6), "shadow"),
        ],
        size: [3, 3, 15.8],
        spacing: [24, 24],
        block: [6, 6],
        road: 14,
        layout: "rows",
        lights: [[0, 15.5, 0]],
        light: accent,
        cable: [0.3, 2.5],
      };
    case "farm":
      return {
        parts: [
          P(s.box(30, 7, 12, 0, 3.5, 0), "barn"),
          P(s.roof(31, 13, 0.45, 7), "dark"),
          P(s.merge([s.cyl(3, 3, 15, 19, 7.5, -2, 14), s.ball(3, 19, 15, -2, 14, true)]), "white"),
          P(s.cyl(3.06, 3.06, 0.6, 19, 13, -2, 14, true), "glow"),
          P(s.box(30.08, 0.8, 12.08, 0, 4.6, 0), "warm"),
          P(s.box(30, 0.06, 18, 0, 0.03, 16), "soil"),
          P(
            s.merge([
              s.box(30, 1.2, 0.15, 0, 0.6, 25),
              s.box(0.15, 1.2, 18, -15, 0.6, 16),
              s.box(0.15, 1.2, 18, 15, 0.6, 16),
            ]),
            "frame",
          ),
          P(s.decal(38, 20, 0.05), "shadow"),
        ],
        size: [36, 34, 18],
        spacing: [62, 50],
        block: [3, 3],
        road: 16,
        layout: "rows",
        lights: [[19, 13, 1.1]],
        light: accent,
        cable: [0.3, -8],
      };
    case "kelp": {
      const buoys: THREE.BufferGeometry[] = [];
      const mats: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) buoys.push(s.ball(0.55, -15 + k * 6, 0.35, 0, 10));
      for (let k = 0; k < 5; k++) {
        const g = s.ball(1, 0, 0, 0, 10);
        g.scale(2.6, 0.12, 1.5);
        g.translate(-12 + k * 6, 0.06, (k % 2) * 0.6 - 0.3);
        mats.push(g);
      }
      return {
        parts: [
          P(s.box(30, 0.08, 0.08, 0, 0.25, 0), "frame"),
          P(s.merge(buoys), "buoy"),
          P(s.merge(mats), "kelp"),
        ],
        size: [30, 3, 1],
        spacing: [34, 10],
        block: [3, 10],
        road: 12,
        layout: "rows",
        lights: [
          [-15, 0.8, 0],
          [15, 0.8, 0],
        ],
        light: "#ffb070",
        cable: [0.25, 0],
      };
    }
  }
}
