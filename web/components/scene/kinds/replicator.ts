/**
 * A machine that builds copies of itself. The story opens on the seed building its first copy:
 * parts it makes itself stream across in the record's colour, and the share it cannot yet make
 * (one minus closure) arrives from outside in cold blue. Then every copy builds a copy, generation
 * after generation, 2^g of them, and the camera pulls back as the population explodes.
 *
 * The colony grows outward from the seed like a culture on a plate: each generation's copies go up
 * in order from the inside out, so a lit construction front sweeps outward, each copy fed by its
 * nearest finished neighbour, and the links between them draw the colony's family tree.
 *
 * Params: unit (cube, arm, cell or fab), generations (1 to 12), closure (0 to 1).
 */

import { rng } from "../lib/particles.ts";
import { makeFlow, makeGlows, makeLinks } from "../lib/systems/glow.ts";
import { growMaterial, makeClock, makeCrowd, type Part } from "../lib/systems/grow.ts";
import {
  crowd,
  grouped,
  mix,
  orbitView,
  ramp,
  storyBeats,
  viewDistance,
} from "../lib/systems/kit.ts";
import { lightFromSky, makeGroundSky, makeSkyEarth, SKIES } from "../lib/systems/sky.ts";
import { makeTerrain, type TerrainName } from "../lib/systems/terrain.ts";
import { makeLooks, shapes } from "../lib/systems/units.ts";
import type { Kind, View } from "../types.ts";

type UnitName = "cube" | "arm" | "cell" | "fab";

interface Replica {
  parts: Part[];
  /** Footprint and height, metres; the lattice step. */
  size: [number, number, number];
  step: number;
  terrain: TerrainName;
  sky: string;
  lights: { at: [number, number, number]; colour: string }[];
}

const replicator: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera, renderer } = ctx;
  const unitName: UnitName = (["cube", "arm", "cell", "fab"] as const).includes(
    ctx.params.unit as UnitName,
  )
    ? (ctx.params.unit as UnitName)
    : "fab";
  const G = Math.max(1, Math.min(12, Math.round(Number(ctx.params.generations ?? 8)) || 8));
  const closure = Math.max(0, Math.min(1, Number(ctx.params.closure ?? 0.9)));
  const N = 2 ** G;
  const rand = rng(31 + G);
  const s = shapes(T);
  const clock = makeClock(ctx);
  const accent = ctx.colour;

  // --- The unit -------------------------------------------------------------------------------
  const P = (geo: Part["geo"], look: string): Part => ({ geo, look });
  const spin = { pivot: [0, 0, 0] as [number, number, number], axis: "y" as const, speed: 0.45 };
  /** Machines are printed layer by layer; cells swell and divide. */
  const mode = unitName === "cell" ? ("pop" as const) : ("print" as const);
  const height = { fab: 9.7, cube: 2, arm: 2.7, cell: 1.45 }[unitName];
  const how = { grow: mode, height };
  const extra: Record<string, InstanceType<typeof T.MeshStandardMaterial>> = {
    melt: growMaterial(ctx, clock, {
      ...how,
      colour: "#301008",
      emissive: "#ff6a1a",
      emissiveIntensity: 3.5,
      lights: true,
      flicker: 0.3,
    }),
    armBody: growMaterial(ctx, clock, {
      ...how,
      colour: "#c9ccd2",
      roughness: 0.35,
      metalness: 0.6,
      spin,
    }),
    armJoint: growMaterial(ctx, clock, {
      ...how,
      colour: "#202020",
      emissive: accent,
      emissiveIntensity: 3,
      lights: true,
      spin,
    }),
    membrane: growMaterial(ctx, clock, {
      grow: "pop",
      colour: "#7fe0c4",
      roughness: 0.25,
      metalness: 0,
      emissive: "#2fb894",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    slit: growMaterial(ctx, clock, {
      ...how,
      colour: "#151515",
      emissive: accent,
      emissiveIntensity: 1.6,
      lights: true,
      flicker: 0.2,
    }),
    nucleus: growMaterial(ctx, clock, {
      grow: "pop",
      colour: "#202020",
      emissive: accent,
      emissiveIntensity: 1.3,
      lights: true,
      flicker: 0.2,
    }),
  };
  let def: Replica;
  if (unitName === "fab") {
    // A seed factory of cast basalt, roofed and winged in the panels it makes, its melt glowing.
    def = {
      parts: [
        P(s.box(12, 4.5, 9, 0, 2.25, 0), "basalt"),
        P(
          s.merge([
            s.box(12.4, 0.2, 9.4, 0, 4.6, 0),
            s.box(8, 0.1, 5, -10.5, 1.7, 0, 0.42),
            s.box(8, 0.1, 5, 10.5, 1.7, 0, 0.42),
          ]),
          "glass",
        ),
        P(
          s.merge([
            s.cyl(1.6, 2.1, 4.5, 3, 2.25, 6.3, 12),
            s.box(0.3, 1.4, 0.3, -10.5, 0.7, 0),
            s.box(0.3, 1.4, 0.3, 10.5, 0.7, 0),
          ]),
          "dark",
        ),
        P(s.cyl(0.25, 0.25, 9, -4.5, 4.5, -3.4, 8), "frame"),
        P(s.ball(0.9, 3, 3.1, 8.1, 10), "melt"),
        P(s.ball(0.45, -4.5, 9.2, -3.4, 8), "glow"),
        P(s.decal(30, 13), "shadow"),
      ],
      size: [29, 9, 9.5],
      step: 34,
      terrain: "regolith",
      sky: "regolith",
      lights: [
        { at: [-4.5, 9.2, -3.4], colour: accent },
        { at: [3, 3.1, 8.2], colour: "#ff7a2a" },
      ],
    };
  } else if (unitName === "cube") {
    const e = 0.94;
    const edges = [];
    for (const x of [-e, e]) for (const z of [-e, e]) edges.push(s.box(0.12, 2, 0.12, x, 1, z));
    for (const y of [0.06, 1.94]) {
      for (const z of [-e, e]) edges.push(s.box(2, 0.12, 0.12, 0, y, z));
      for (const x of [-e, e]) edges.push(s.box(0.12, 0.12, 2, x, y, 0));
    }
    def = {
      parts: [
        P(s.merge(edges), "frame"),
        P(s.box(1.82, 1.82, 1.82, 0, 1, 0), "dark"),
        P(
          s.merge([
            s.box(1.2, 0.1, 1.86, 0, 1.35, 0),
            s.box(1.86, 0.1, 1.2, 0, 1.35, 0),
            s.box(0.7, 0.04, 0.7, 0, 1.93, 0),
          ]),
          "slit",
        ),
        P(s.decal(2.8, 2.8), "shadow"),
      ],
      size: [2, 2, 2],
      step: 3,
      terrain: "floor",
      sky: "void",
      lights: [{ at: [0, 2.0, 0], colour: accent }],
    };
  } else if (unitName === "arm") {
    const upper = s.box(0.3, 1.8, 0.3, 0, 0.9, 0);
    upper.rotateX(0.55);
    upper.translate(0, 1.05, 0);
    const fore = s.box(0.24, 1.5, 0.24, 0, 0.75, 0);
    fore.rotateX(2.1);
    fore.translate(0, 1.05 + 1.8 * Math.cos(0.55), 1.8 * Math.sin(0.55));
    def = {
      parts: [
        P(s.cyl(0.7, 0.9, 0.5, 0, 0.25, 0, 16), "dark"),
        P(s.merge([s.cyl(0.42, 0.5, 0.55, 0, 0.78, 0, 12), upper, fore]), "armBody"),
        P(
          s.merge([
            s.ball(0.26, 0, 1.05, 0, 10),
            s.ball(0.22, 0, 1.05 + 1.8 * Math.cos(0.55), 1.8 * Math.sin(0.55), 10),
            s.ball(
              0.16,
              0,
              1.05 + 1.8 * Math.cos(0.55) - 1.5 * Math.cos(Math.PI - 2.1),
              1.8 * Math.sin(0.55) + 1.5 * Math.sin(Math.PI - 2.1),
              8,
            ),
          ]),
          "armJoint",
        ),
        P(s.decal(2.6, 2.6), "shadow"),
      ],
      size: [1.8, 2.6, 2.6],
      step: 4.6,
      terrain: "floor",
      sky: "void",
      lights: [{ at: [0, 1.05, 0], colour: accent }],
    };
  } else {
    def = {
      parts: [
        P(s.ball(0.7, 0, 0.72, 0, 36), "membrane"),
        P(s.ball(0.27, 0.1, 0.74, 0.06, 24), "nucleus"),
      ],
      size: [1.4, 1.4, 1.4],
      step: 1.5,
      terrain: "floor",
      sky: "medium",
      lights: [{ at: [0.1, 0.74, 0.06], colour: accent }],
    };
  }
  const looks = makeLooks(ctx, clock, how);
  const allLooks = { ...looks.looks, ...extra };
  const big = Math.max(...def.size);

  // --- The colony: sites on a hex lattice, nearest the seed first, in a ragged organic outline.
  // Each generation's copies go up in order outward, so the colony spreads as a disc with a lit
  // construction front, and each copy is supplied by its nearest finished neighbour.
  const sites: { x: number; z: number; r: number }[] = [];
  const L = Math.ceil(Math.sqrt(N) * 0.8) + 4;
  const ph = [rand(), rand(), rand(), rand()].map((x) => x * Math.PI * 2);
  const outline = (a: number) =>
    1 +
    0.16 * Math.sin(2 * a + (ph[0] as number)) +
    0.1 * Math.sin(3 * a + (ph[1] as number)) +
    0.07 * Math.sin(5 * a + (ph[2] as number));
  const loose = unitName === "cell" ? 0.18 : 0;
  for (let j = -L; j <= L; j++) {
    for (let i = -L; i <= L; i++) {
      const x = (i + (j & 1) * 0.5 + (rand() - 0.5) * loose) * def.step;
      const z = (j * 0.866 + (rand() - 0.5) * loose) * def.step;
      const r = Math.hypot(x, z);
      sites.push({ x, z, r: r / outline(Math.atan2(z, x)) + rand() * def.step * 0.7 });
    }
  }
  sites.sort((a, b) => a.r - b.r);
  const pos = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const site = sites[k] as { x: number; z: number };
    pos[k * 3] = site.x;
    pos[k * 3 + 2] = site.z;
  }
  const genOf = (k: number) => (k === 0 ? 0 : Math.floor(Math.log2(k)) + 1);
  /** When each copy starts going up, on the clock in generations, and how long it takes. */
  const BUILD = 0.42;
  const start = new Float32Array(N);
  start[0] = -2;
  for (let k = 1; k < N; k++) {
    const g = genOf(k);
    const half = 2 ** (g - 1);
    start[k] = g - 1 + 0.55 * ((k - half) / half);
  }
  // Each copy's supplier: the nearest copy already finished when it starts.
  const supplier = new Int32Array(N);
  const cellSize = def.step * 1.5;
  const buckets = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  const finish = (j: number) => (start[j] as number) + (j === 0 ? 1 : BUILD);
  buckets.set(key(0, 0), [0]);
  for (let k = 1; k < N; k++) {
    const x = pos[k * 3] as number;
    const z = pos[k * 3 + 2] as number;
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let ring = 1; ring <= 4 && best < 0; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (const j of buckets.get(`${cx + dx},${cz + dz}`) ?? []) {
            if (finish(j) > (start[k] as number) + 0.02) continue;
            const d = Math.hypot((pos[j * 3] as number) - x, (pos[j * 3 + 2] as number) - z);
            if (d < bestD) {
              bestD = d;
              best = j;
            }
          }
        }
      }
    }
    supplier[k] = Math.max(0, best);
    const kk = key(x, z);
    const list = buckets.get(kk);
    if (list) list.push(k);
    else buckets.set(kk, [k]);
  }
  const matrices = new Float32Array(N * 16);
  const grow = new Float32Array(N * 2);
  const seed = new Float32Array(N);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const v = new T.Vector3();
  const one = new T.Vector3(1, 1, 1);
  const upY = new T.Vector3(0, 1, 0);
  for (let k = 0; k < N; k++) {
    // Cells turn as they like; machines stand square to the lattice.
    const yaw = unitName === "cell" ? rand() * Math.PI * 2 : 0;
    q.setFromAxisAngle(upY, yaw);
    m.compose(v.set(pos[k * 3] as number, 0, pos[k * 3 + 2] as number), q, one);
    m.toArray(matrices, k * 16);
    grow[k * 2] = start[k] as number;
    grow[k * 2 + 1] = k === 0 ? 1 : BUILD;
    seed[k] = rand();
  }
  const frame = crowd(pos);
  const final = frame(N);
  /** The story's clock in generations: the seed's first copy under way at 0, all built at 1. */
  const gens = (p: number) => mix(0.18, G + 0.05, p);

  // --- Sky and ground ----------------------------------------------------------------------------
  const preset = SKIES[def.sky] ?? (SKIES.void as (typeof SKIES)["void"]);
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const reach = final.radius * 2.2 + big * 2;
  const ground = makeTerrain(ctx, def.terrain, sky, reach);
  scene.add(ground.mesh);
  const azStart = 0.95;
  const azEnd = 1.95;
  const viewAz = azStart + Math.PI;
  const skyEarth = unitName === "fab" ? makeSkyEarth(ctx, sky, viewAz + 0.28, 0.1) : undefined;
  if (skyEarth) scene.add(skyEarth.group);

  // --- The copies, their lights and their family tree --------------------------------------------
  const copies = makeCrowd(ctx, def.parts, allLooks, matrices, grow, seed);
  scene.add(copies.group);
  const nl = def.lights.length;
  const lp = new Float32Array(N * nl * 3);
  const lg = new Float32Array(N * nl * 2);
  const lc = new Float32Array(N * nl * 3);
  const col = new T.Color();
  for (let k = 0; k < N; k++) {
    m.fromArray(matrices, k * 16);
    def.lights.forEach((l, j) => {
      const i = k * nl + j;
      v.set(...l.at).applyMatrix4(m);
      lp.set([v.x, v.y, v.z], i * 3);
      lg.set([grow[k * 2] as number, grow[k * 2 + 1] as number], i * 2);
      col.set(l.colour).multiplyScalar(1.2);
      lc.set([col.r, col.g, col.b], i * 3);
    });
  }
  const glows = makeGlows(ctx, clock, {
    position: lp,
    grow: lg,
    colour: lc,
    size: big * 0.14,
    min: 1.8,
    max: 22,
    twinkle: 0.3,
    // A cell's glow sits inside its own membrane: softer, or the close view blows out.
    gain: unitName === "cell" ? 0.8 : 1.8,
  });
  scene.add(glows.points);

  const tree = {
    from: new Float32Array((N - 1) * 3),
    to: new Float32Array((N - 1) * 3),
    link: new Float32Array((N - 1) * 3),
    born: new Float32Array((N - 1) * 2),
  };
  for (let k = 1; k < N; k++) {
    const pk = supplier[k] as number;
    tree.from.set([pos[pk * 3] as number, 0.08, pos[pk * 3 + 2] as number], (k - 1) * 3);
    tree.to.set([pos[k * 3] as number, 0.08, pos[k * 3 + 2] as number], (k - 1) * 3);
    tree.link.set([def.step * 0.12, rand(), 0.7], (k - 1) * 3);
    tree.born.set([start[k] as number, BUILD * 0.6], (k - 1) * 2);
  }
  const accentCol = new T.Color(accent);
  const lineage = makeLinks(
    ctx,
    { ...tree, segments: new Uint8Array(N - 1).fill(6) },
    {
      line: accentCol.clone().multiplyScalar(0.55),
      pulse: accentCol.clone().multiplyScalar(1.3),
      pulses: 0.8,
      speed: 0.3,
      gain: 0.85,
    },
  );
  scene.add(lineage.lines);

  // --- Parts in flight: made in place (accent) from the parent, imported (blue) from outside ------
  const srcDir =
    unitName === "fab"
      ? new T.Vector3(
          Math.cos(0.1) * Math.cos(viewAz + 0.28),
          Math.sin(0.1),
          Math.cos(0.1) * Math.sin(viewAz + 0.28),
        )
      : new T.Vector3(Math.cos(viewAz + 0.7), 0.45, Math.sin(viewAz + 0.7)).normalize();
  const srcDist = final.radius * 3 + big * 12;
  const src = new T.Vector3(final.centre[0], 0, final.centre[2]).addScaledVector(srcDir, srcDist);
  const budget = Math.round(1600 * ctx.detail) + 200;
  const importSize = big * 0.11;
  const flows = {
    from: [] as number[],
    to: [] as number[],
    flow: [] as number[],
    window: [] as number[],
    colour: [] as number[],
  };
  const local = new T.Color(accent).multiplyScalar(1.5);
  const imported = new T.Color("#7fc0ff").multiplyScalar(1.8);
  const h = def.size[2];
  for (let k = 1; k < N; k++) {
    const g = genOf(k);
    const pk = supplier[k] as number;
    const per = Math.max(2, Math.min(48, Math.round(budget / 2 ** (g - 1))));
    const cx = pos[k * 3] as number;
    const cz = pos[k * 3 + 2] as number;
    const px = pos[pk * 3] as number;
    const pz = pos[pk * 3 + 2] as number;
    const dist = Math.hypot(cx - px, cz - pz);
    for (let j = 0; j < per; j++) {
      const out = rand() < 1 - closure;
      const jx = (rand() - 0.5) * def.size[0] * 0.5;
      const jz = (rand() - 0.5) * def.size[1] * 0.5;
      if (out) {
        flows.from.push(
          src.x + (rand() - 0.5) * big * 2,
          src.y + (rand() - 0.5) * big,
          src.z + (rand() - 0.5) * big * 2,
        );
        flows.flow.push(srcDist * 0.12, rand(), 0.6 + rand() * 0.6, importSize);
        flows.colour.push(imported.r, imported.g, imported.b);
      } else {
        flows.from.push(px + jx, h * 0.6, pz + jz);
        flows.flow.push(dist * 0.3 + h, rand(), 0.7 + rand() * 0.8, big * 0.05);
        flows.colour.push(local.r, local.g, local.b);
      }
      flows.to.push(cx + jx * 0.6, h * 0.35, cz + jz * 0.6);
      flows.window.push((start[k] as number) - 0.03, (start[k] as number) + BUILD * 0.9);
    }
  }
  const parts = makeFlow(
    ctx,
    {
      from: new Float32Array(flows.from),
      to: new Float32Array(flows.to),
      flow: new Float32Array(flows.flow),
      window: new Float32Array(flows.window),
      colour: new Float32Array(flows.colour),
    },
    { rate: unitName === "cell" ? 0.25 : 0.35, min: 1.4, max: 14 },
  );
  scene.add(parts.points);

  // Cells live in a culture: motes of nutrient drift through it.
  const motes =
    unitName === "cell"
      ? (() => {
          const nm = Math.round(2500 * ctx.detail);
          const mp = new Float32Array(nm * 3);
          const R = final.radius * 2.5 + 6;
          for (let i = 0; i < nm; i++)
            mp.set([(rand() - 0.5) * 2 * R, rand() * R * 0.35, (rand() - 0.5) * 2 * R], i * 3);
          return makeGlows(ctx, clock, {
            position: mp,
            grow: new Float32Array(nm * 2).fill(-1).map((x, i) => (i % 2 ? 0.5 : x)),
            colour: new T.Color("#5fd8c8").multiplyScalar(0.5),
            size: 0.15,
            min: 1,
            max: 6,
            twinkle: 0.6,
          });
        })()
      : undefined;
  if (motes) scene.add(motes.points);

  // --- The camera: on the seed and its first copy, pulling back as the colony doubles -----------
  const pose = (p: number): View => {
    const k = Math.min(N, Math.max(2, 2 ** gens(p)));
    const c = frame(k);
    const R = Math.max(def.step * 0.6, c.radius * 1.4 + big * 0.35);
    const d = Math.max(big * 2.2, R * 2.3);
    const el = mix(unitName === "fab" ? 0.17 : 0.3, 0.78, ramp(p, 0, 1) ** 0.7);
    const az = mix(azStart, azEnd, ramp(p, 0, 1));
    const view = orbitView([c.centre[0], 0, c.centre[2]], d, az, el, 0.2, 5);
    view.target = [c.centre[0], h * 0.4 * (1 - ramp(p, 0, 0.4)), c.centre[2]];
    return view;
  };

  const beats = storyBeats(ctx).map((b) => {
    const gc = gens(b.at);
    const done = 2 ** Math.min(G, Math.floor(gc));
    const gen = Math.min(G, Math.floor(gc) + 1);
    return {
      ...b,
      meter: `${b.meter ?? b.title} · gen ${gen} · ${grouped(done)} ${done === 1 ? "unit" : "units"}`,
    };
  });

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats,
    pose,
    update(time, _dt, p) {
      renderer.getSize(size);
      const px = size.y * renderer.getPixelRatio();
      const gc = gens(p);
      clock.uBuilt.value = gc;
      clock.uTime.value = time;
      lineage.uniforms.uClock.value = gc;
      parts.uniforms.uClock.value = gc;
      sky.update(camera);
      light.update(viewDistance(camera));
      ground.update(time, camera);
      skyEarth?.update(time, camera);
      glows.update(px);
      motes?.update(px);
      lineage.update(time);
      parts.update(time, px);
    },
    dispose() {
      sky.dispose();
      light.dispose();
      ground.dispose();
      skyEarth?.dispose();
      copies.dispose();
      for (const part of def.parts) part.geo.dispose();
      looks.dispose();
      for (const mat of Object.values(extra)) mat.dispose();
      glows.dispose();
      motes?.dispose();
      lineage.dispose();
      parts.dispose();
    },
  };
};

export default replicator;
