/**
 * The machines that compute, for the compute kind: halls of racks on a desert grid or modules in
 * orbit behind red radiators, wafers drawn by electron beams, swarms of thin compute leaves with
 * laser links, dilution-fridge chandeliers with their qubits, and photonic chips where light
 * threads a mesh of interferometers. Each builds into the scene and tells its story along progress:
 * the smallest working part close up, then the installation growing to its full count.
 */
import type * as THREE from "three";
import type { KindContext, View } from "../../types.ts";
import { rng } from "../particles.ts";
import { makeGlows, makeLinks } from "./glow.ts";
import { canvasTexture, growMaterial, makeClock, makeCrowd, type Part } from "./grow.ts";
import { clamp01, crowd, logMix, mix, orbitView, ramp, type V3, viewDistance } from "./kit.ts";
import { makeOrbitBackdrop } from "./orbit.ts";
import { lightFromSky, makeGroundSky, SKIES } from "./sky.ts";
import { makeTerrain } from "./terrain.ts";
import { makeLooks, shapes } from "./units.ts";

export interface ComputeOptions {
  racks: number;
  radiators: number;
  orbit: boolean;
}

export interface ComputeWorld {
  /** What one of the counted things is called, singular and plural. */
  noun: [string, string];
  /** How much of the installation stands at progress p, 0 (the first one) to 1 (all of them). */
  built(p: number): number;
  pose(p: number): View;
  update(time: number, p: number, pixelHeight: number): void;
  dispose(): void;
}

type Builder = (ctx: KindContext, o: ComputeOptions) => ComputeWorld;

/**
 * The build clock in units: just under one at the start (the first unit finished, its lights on,
 * the next not begun), all of them lit at the end.
 */
const standing = (n: number) => (p: number) => 0.95 * Math.exp(p * Math.log(n * 1.25));

/** Unit i's build window on the clock: the first one quick, so it stands lit at the start. */
const win = (i: number, n: number, k: number) => [i / n, i ? (k * i + 1) / n : 0.5 / n];

/** Points on a hex lattice, nearest the centre first, x and z per point. */
function hexDisc(n: number, step: number, jitter: number, seed: number): Float32Array {
  const r = rng(seed);
  const L = Math.ceil(Math.sqrt(n) * 0.75) + 3;
  const pts: { x: number; z: number; d: number }[] = [];
  for (let j = -L; j <= L; j++) {
    for (let i = -L; i <= L; i++) {
      const x = (i + (j & 1) * 0.5) * step;
      const z = j * 0.866 * step;
      pts.push({ x, z, d: Math.hypot(x, z) + r() * step * jitter });
    }
  }
  pts.sort((a, b) => a.d - b.d);
  const out = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const p = pts[k] as { x: number; z: number };
    out[k * 2] = p.x;
    out[k * 2 + 1] = p.z;
  }
  return out;
}

/** A tall strip of server lights, scrolled to make them blink. */
function ledTexture(ctx: KindContext, accent: string): THREE.CanvasTexture {
  const r = rng(5);
  const tex = canvasTexture(ctx, 32, 256, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 32, 256);
    const colours = [accent, accent, "#5dff9a", "#6ab8ff", "#ffffff"];
    for (let y = 2; y < 256; y += 6) {
      for (let x = 3; x < 30; x += 5) {
        if (r() < 0.45) continue;
        g.fillStyle = colours[Math.floor(r() * colours.length)] as string;
        g.fillRect(x, y, 2, 2);
      }
    }
  });
  tex.wrapS = tex.wrapT = ctx.three.RepeatWrapping;
  return tex;
}

/** Cables or laser links as lines, from a flat list. */
function lines(
  ctx: KindContext,
  list: { a: V3; b: V3; lift: number; start: number; draw: number; w: number; segs: number }[],
  o: { line: THREE.Color; pulse: THREE.Color; pulses: number; speed: number; gain: number },
) {
  const r = rng(77);
  const m = list.length;
  const from = new Float32Array(m * 3);
  const to = new Float32Array(m * 3);
  const link = new Float32Array(m * 3);
  const born = new Float32Array(m * 2);
  const segments = new Uint8Array(m);
  list.forEach((l, k) => {
    from.set(l.a, k * 3);
    to.set(l.b, k * 3);
    link.set([l.lift, r(), l.w], k * 3);
    born.set([l.start, Math.max(1e-4, l.draw)], k * 2);
    segments[k] = l.segs;
  });
  return makeLinks(ctx, { from, to, link, born, segments }, o);
}

// --- Halls of racks, or compute modules in orbit ----------------------------------------------------

const datacentre: Builder = (ctx, o) => (o.orbit ? orbitModules(ctx, o) : halls(ctx, o));

function halls(ctx: KindContext, o: ComputeOptions): ComputeWorld {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, Math.round(5000 * ctx.detail)));
  const PER_ROW = 12;
  const ROWS = 10;
  const PER_HALL = PER_ROW * ROWS;
  const PX = 0.64;
  const PZ = 3;
  const HW = PER_ROW * PX + 5;
  const HD = ROWS * PZ + 4;
  const hallCount = Math.ceil(n / PER_HALL);
  const GX = HW + 18;
  const GZ = HD + 14;
  const side = Math.ceil(Math.sqrt(hallCount)) + 2;
  const cand: { i: number; j: number; d: number }[] = [];
  for (let i = -side; i <= side; i++)
    for (let j = -side; j <= side; j++) cand.push({ i, j, d: Math.hypot(i * GX, j * GZ * 0.8) });
  cand.sort((a, b) => a.d - b.d);
  const hallAt = cand.slice(0, hallCount).map((c) => [c.i * GX, c.j * GZ] as [number, number]);
  const slots: { c: number; r: number; k: number }[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < PER_ROW; c++)
      slots.push({ c, r, k: Math.abs(r - 4.5) * 30 + Math.abs(c - 5.5) });
  slots.sort((a, b) => a.k - b.k);
  const spots: { x: number; z: number; yaw: number; key: number; h: number; r: number }[] = [];
  for (let h = 0; h < hallCount; h++) {
    const [hx, hz] = hallAt[h] as [number, number];
    for (let k = 0; k < PER_HALL; k++) {
      const sl = slots[k] as { c: number; r: number };
      spots.push({
        x: hx + (sl.c - 5.5) * PX,
        z: hz + (sl.r - 4.5) * PZ,
        yaw: sl.r % 2 ? Math.PI : 0,
        key: h + 1.6 * (k / PER_HALL),
        h,
        r: sl.r,
      });
    }
  }
  spots.sort((a, b) => a.key - b.key);
  spots.length = n;
  const clock = makeClock(ctx);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const v = new T.Vector3();
  const one = new T.Vector3(1, 1, 1);
  const up = new T.Vector3(0, 1, 0);
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const r = rng(3);
  const hallFirst = new Array<number>(hallCount).fill(-1);
  const hallLast = new Array<number>(hallCount).fill(0);
  spots.forEach((sp, i) => {
    m.compose(v.set(sp.x, 0, sp.z), q.setFromAxisAngle(up, sp.yaw), one);
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.12), i * 2);
    seed[i] = r();
    at.set([sp.x, 0, sp.z], i * 3);
    if ((hallFirst[sp.h] as number) < 0) hallFirst[sp.h] = i;
    hallLast[sp.h] = i;
  });
  const frame = crowd(at);
  const count = standing(n);

  const preset = SKIES.desert as (typeof SKIES)["desert"];
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const reach = Math.max(...hallAt.map(([x, z]) => Math.hypot(x, z))) + GX;
  const ground = makeTerrain(ctx, "desert", sky, reach);
  scene.add(ground.mesh);

  const leds = ledTexture(ctx, ctx.colour);
  const looks = makeLooks(ctx, clock, { grow: "print", height: 2.2 });
  const rackLooks = {
    body: growMaterial(ctx, clock, {
      grow: "print",
      height: 2.2,
      colour: "#1b1e25",
      roughness: 0.45,
      metalness: 0.6,
    }),
    leds: growMaterial(ctx, clock, {
      grow: "print",
      height: 2.2,
      colour: "#050505",
      emissive: "#ffffff",
      emissiveMap: leds,
      emissiveIntensity: 2.4,
      lights: true,
      flicker: 0.1,
    }),
  };
  const rackParts: Part[] = [
    { geo: s.box(0.6, 2.1, 1.1, 0, 1.05, 0), look: "body" },
    { geo: s.box(0.52, 1.9, 0.02, 0, 1.05, 0.56), look: "leds" },
  ];
  const racks = makeCrowd(ctx, rackParts, rackLooks, mats, grow, seed);
  scene.add(racks.group);

  // The halls: a floor, low walls and an open roof frame, each appearing as its first rack does.
  const hallMats = new Float32Array(hallCount * 16);
  const hallGrow = new Float32Array(hallCount * 2);
  const hallSeed = new Float32Array(hallCount);
  const coolMats: number[] = [];
  const coolGrow: number[] = [];
  const perCool = Math.max(1, Math.round(o.radiators * 10));
  for (let h = 0; h < hallCount; h++) {
    const [hx, hz] = hallAt[h] as [number, number];
    m.compose(v.set(hx, 0, hz), q.identity(), one);
    m.toArray(hallMats, h * 16);
    const f = Math.max(0, hallFirst[h] as number);
    hallGrow.set([f / n - 0.004, 0.004 + 1 / n], h * 2);
    hallSeed[h] = r();
    const done = ((hallLast[h] as number) + 1) / n;
    for (let k = 0; k < perCool; k++) {
      m.compose(v.set(hx + HW / 2 + 3.2, 0, hz - HD / 2 + 2 + k * 3.2), q.identity(), one);
      coolMats.push(...m.toArray());
      coolGrow.push(done, 0.02 + 0.15 * done);
    }
  }
  const beams: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++)
    beams.push(s.box(HW, 0.2, 0.25, 0, 4.6, -HD / 2 + 2 + k * ((HD - 4) / 5)));
  const hallParts: Part[] = [
    { geo: s.box(HW, 0.25, HD, 0, 0.125, 0), look: "dark" },
    {
      geo: s.merge([
        s.box(HW, 1.1, 0.3, 0, 0.8, HD / 2),
        s.box(HW, 1.1, 0.3, 0, 0.8, -HD / 2),
        s.box(0.3, 1.1, HD, HW / 2, 0.8, 0),
        s.box(0.3, 1.1, HD, -HW / 2, 0.8, 0),
      ]),
      look: "white",
    },
    {
      geo: s.merge([
        ...beams,
        s.box(0.3, 4.6, 0.3, HW / 2, 2.3, HD / 2),
        s.box(0.3, 4.6, 0.3, -HW / 2, 2.3, HD / 2),
        s.box(0.3, 4.6, 0.3, HW / 2, 2.3, -HD / 2),
        s.box(0.3, 4.6, 0.3, -HW / 2, 2.3, -HD / 2),
      ]),
      look: "frame",
    },
  ];
  const hallsCrowd = makeCrowd(ctx, hallParts, looks.looks, hallMats, hallGrow, hallSeed);
  scene.add(hallsCrowd.group);
  // Dry coolers beside each hall: their fins glow with the heat the racks shed.
  const heat = growMaterial(ctx, clock, {
    grow: "print",
    height: 2,
    colour: "#2a1410",
    emissive: "#c8340f",
    emissiveIntensity: 0.5 + 1.2 * o.radiators,
    lights: true,
    flicker: 0.05,
  });
  const nc = coolGrow.length / 2;
  const coolSeed = new Float32Array(nc).map(() => r());
  const coolParts: Part[] = [
    { geo: s.box(2.6, 1.4, 2.6, 0, 0.7, 0), look: "frame" },
    { geo: s.box(2.64, 0.35, 2.64, 0, 1.0, 0), look: "heat" },
    {
      geo: s.merge([s.cyl(0.8, 0.8, 0.2, 0, 1.5, -0.6), s.cyl(0.8, 0.8, 0.2, 0, 1.5, 0.65)]),
      look: "dark",
    },
  ];
  const coolers = makeCrowd(
    ctx,
    coolParts,
    { ...looks.looks, heat },
    new Float32Array(coolMats),
    new Float32Array(coolGrow),
    coolSeed,
  );
  scene.add(coolers.group);

  // Glow: each rack's face, each cooler's heat; cables over the rows and fibre between the halls.
  const lp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    m.fromArray(mats, i * 16);
    v.set(0, 1.5, 0.6).applyMatrix4(m);
    lp.set([v.x, v.y, v.z], i * 3);
  }
  const rackGlow = makeGlows(ctx, clock, {
    position: lp,
    grow,
    colour: new T.Color(ctx.colour).multiplyScalar(0.9),
    size: 0.5,
    min: 1.3,
    max: 12,
    twinkle: 0.5,
  });
  scene.add(rackGlow.points);
  const cp = new Float32Array(nc * 3);
  for (let k = 0; k < nc; k++)
    cp.set([coolMats[k * 16 + 12] as number, 1.1, coolMats[k * 16 + 14] as number], k * 3);
  const coolGlow = makeGlows(ctx, clock, {
    position: cp,
    grow: new Float32Array(coolGrow),
    colour: new T.Color("#ff4a1a").multiplyScalar(0.25 + 0.6 * o.radiators),
    size: 3,
    min: 2,
    max: 30,
    twinkle: 0.1,
  });
  scene.add(coolGlow.points);
  const cables: Parameters<typeof lines>[1] = [];
  const rows = new Map<string, number[]>();
  spots.forEach((sp, i) => {
    const k = `${sp.h}:${sp.r}`;
    const list = rows.get(k);
    if (list) list.push(i);
    else rows.set(k, [i]);
  });
  for (const list of rows.values()) {
    const sp = spots[list[0] as number] as { h: number; r: number; z: number };
    const [hx] = hallAt[sp.h] as [number, number];
    const end = Math.max(...list.map((i) => (grow[i * 2] as number) + (grow[i * 2 + 1] as number)));
    cables.push({
      a: [hx - 5.5 * PX, 2.35, sp.z],
      b: [hx + 5.5 * PX, 2.35, sp.z],
      lift: 0,
      start: grow[(list[0] as number) * 2] as number,
      draw: end - (grow[(list[0] as number) * 2] as number),
      w: 0.6,
      segs: 6,
    });
  }
  for (let h = 1; h < hallCount; h++) {
    const [hx, hz] = hallAt[h] as [number, number];
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let g = 0; g < h; g++) {
      const [gx, gz] = hallAt[g] as [number, number];
      const d = Math.hypot(gx - hx, gz - hz);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    const [bx, bz] = hallAt[best] as [number, number];
    const f = Math.max(0, hallFirst[h] as number) / n;
    cables.push({
      a: [hx - HW / 2 - 4, 0.3, hz - HD / 2 - 4],
      b: [bx - HW / 2 - 4, 0.3, bz - HD / 2 - 4],
      lift: 0,
      start: f,
      draw: 0.02,
      w: 1,
      segs: 12,
    });
  }
  const accent = new T.Color(ctx.colour);
  const cableLines = lines(ctx, cables, {
    line: accent.clone().multiplyScalar(0.4),
    pulse: accent.clone().multiplyScalar(1.4),
    pulses: 1,
    speed: 0.6,
    gain: 0.8,
  });
  scene.add(cableLines.lines);

  return {
    noun: ["rack", "racks"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const c = frame(Math.min(n, count(p)));
      const R = Math.max(1.2, c.radius * 1.45 + 0.8);
      const d = Math.max(3.4, R * 2.5);
      const lift = 1.2 * (1 - ramp(p, 0, 0.3)) + R * 0.25 * ramp(p, 0.1, 0.6);
      const view = orbitView(
        [c.centre[0], 0, c.centre[2]],
        d,
        mix(1.05, 1.9, ramp(p, 0, 1)),
        mix(0.14, 0.42, ramp(p, 0, 0.95) ** 0.8),
        0.2,
        5,
      );
      view.target = [c.centre[0], lift, c.centre[2]];
      return view;
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      cableLines.uniforms.uClock.value = count(p) / n;
      cableLines.update(time);
      leds.offset.y = time * 0.05;
      sky.update(ctx.camera);
      light.update(viewDistance(ctx.camera));
      ground.update(time, ctx.camera);
      rackGlow.update(px);
      coolGlow.update(px);
    },
    dispose() {
      for (const x of [
        sky,
        light,
        ground,
        racks,
        hallsCrowd,
        coolers,
        looks,
        rackGlow,
        coolGlow,
        cableLines,
      ])
        x.dispose();
      for (const part of [...rackParts, ...hallParts, ...coolParts]) part.geo.dispose();
      for (const mat of [rackLooks.body, rackLooks.leds, heat]) mat.dispose();
      leds.dispose();
    },
  };
}

/** Compute modules in formation in low orbit, each behind broad radiator wings. */
function orbitModules(ctx: KindContext, o: ComputeOptions): ComputeWorld {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, Math.round(2000 * ctx.detail)));
  const STEP = 52;
  const xz = hexDisc(n, STEP, 0.3, 9);
  const clock = makeClock(ctx);
  const sunDir = new T.Vector3(-0.78, 0.38, -0.5).normalize();
  const backdrop = makeOrbitBackdrop(ctx, sunDir);
  const looks = makeLooks(ctx, clock, { grow: "pop" });
  const heat = growMaterial(ctx, clock, {
    grow: "pop",
    colour: "#1e1210",
    roughness: 0.7,
    emissive: "#a8260c",
    emissiveIntensity: 0.25 + 1.0 * o.radiators,
    lights: true,
    flicker: 0.04,
  });
  const parts: Part[] = [
    {
      geo: s.merge([s.box(12, 3.4, 3.4), s.cyl(1.2, 1.2, 1, 6.5, 0, 0, 12, false, 0, Math.PI / 2)]),
      look: "white",
    },
    { geo: s.merge([s.box(0.3, 7, 0.3, 0, 5.2, 0), s.box(0.3, 0.3, 30, 0, 0, 0)]), look: "frame" },
    { geo: s.box(18, 0.1, 7, 0, 8.8, 0, -0.35), look: "glass" },
    {
      geo: s.merge([s.box(11, 0.12, 12, 0, 0, 8.2), s.box(11, 0.12, 12, 0, 0, -8.2)]),
      look: "heat",
    },
    { geo: s.ball(0.35, -6.2, 1.9, 0, 8), look: "warm" },
  ];
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const v = new T.Vector3();
  const r = rng(13);
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2] as number;
    const z = xz[i * 2 + 1] as number;
    const y = (r() - 0.5) * STEP * 0.3;
    m.compose(
      v.set(x, y, z),
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), (r() - 0.5) * 0.08),
      new T.Vector3(1, 1, 1),
    );
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.12), i * 2);
    seed[i] = r();
    at.set([x, y, z], i * 3);
  }
  const mods = makeCrowd(ctx, parts, { ...looks.looks, heat }, mats, grow, seed);
  scene.add(mods.group);
  const glowPos = new Float32Array(n * 6);
  const glowGrow = new Float32Array(n * 4);
  const glowCol = new Float32Array(n * 6);
  const hot = new T.Color("#ff4a1a").multiplyScalar(0.3 + 0.9 * o.radiators);
  const acc = new T.Color(ctx.colour).multiplyScalar(0.45);
  for (let i = 0; i < n; i++) {
    m.fromArray(mats, i * 16);
    v.set(0, 0, 8.2).applyMatrix4(m);
    glowPos.set([v.x, v.y, v.z], i * 6);
    v.set(-6.2, 1.9, 0).applyMatrix4(m);
    glowPos.set([v.x, v.y, v.z], i * 6 + 3);
    glowGrow.set(
      [
        grow[i * 2] as number,
        grow[i * 2 + 1] as number,
        grow[i * 2] as number,
        grow[i * 2 + 1] as number,
      ],
      i * 4,
    );
    glowCol.set([hot.r, hot.g, hot.b, acc.r, acc.g, acc.b], i * 6);
  }
  const glows = makeGlows(ctx, clock, {
    position: glowPos,
    grow: glowGrow,
    colour: glowCol,
    size: 4,
    min: 1.6,
    max: 40,
    twinkle: 0.2,
  });
  scene.add(glows.points);
  // Laser links to the two nearest neighbours already flying.
  const list: Parameters<typeof lines>[1] = [];
  for (let i = 1; i < n; i++) {
    const near: { j: number; d: number }[] = [];
    for (let j = 0; j < i; j++)
      near.push({
        j,
        d: Math.hypot(
          (at[i * 3] as number) - (at[j * 3] as number),
          (at[i * 3 + 1] as number) - (at[j * 3 + 1] as number),
          (at[i * 3 + 2] as number) - (at[j * 3 + 2] as number),
        ),
      });
    near.sort((a, b) => a.d - b.d);
    for (const { j } of near.slice(0, 2)) {
      const end = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
      list.push({
        a: [at[j * 3] as number, (at[j * 3 + 1] as number) + 1.9, at[j * 3 + 2] as number],
        b: [at[i * 3] as number, (at[i * 3 + 1] as number) + 1.9, at[i * 3 + 2] as number],
        lift: 0,
        start: end,
        draw: 0.6 / n + 0.01,
        w: 0.8,
        segs: 6,
      });
    }
  }
  const laser = new T.Color("#9fd8ff");
  const links = lines(ctx, list, {
    line: laser.clone().multiplyScalar(0.25),
    pulse: laser.clone().multiplyScalar(1.6),
    pulses: 1,
    speed: 1.2,
    gain: 0.7,
  });
  scene.add(links.lines);
  const frame = crowd(at);
  const count = standing(n);
  return {
    noun: ["module", "modules"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const c = frame(Math.min(n, count(p)));
      const R = Math.max(14, c.radius * 1.5 + 18);
      const d = R * 2.4;
      return orbitView(
        c.centre,
        d,
        mix(0.7, 1.5, ramp(p, 0, 1)),
        mix(0.3, 0.75, ramp(p, 0, 1)),
        0.2,
        5,
      );
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      links.uniforms.uClock.value = count(p) / n;
      links.update(time);
      backdrop.update(time, ctx.camera);
      glows.update(px);
    },
    dispose() {
      for (const x of [backdrop, mods, looks, glows, links]) x.dispose();
      for (const part of parts) part.geo.dispose();
      heat.dispose();
    },
  };
}

// --- Wafers --------------------------------------------------------------------------------------

const WAFER_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSeed;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const WAFER_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uWrite;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 cAccent;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vSeed;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec3 V = normalize(uCam - vW);
  vec3 N = normalize(vN);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  // Dies in a grid, written in raster order up to this wafer's progress.
  vec2 g = (p + 1.0) * 7.0;
  vec2 die = floor(g);
  vec2 f = fract(g);
  float inDie = step(0.06, f.x) * step(f.x, 0.94) * step(0.06, f.y) * step(f.y, 0.94) * step(r, 0.96);
  float order = (die.y * 14.0 + (mod(die.y, 2.0) > 0.5 ? 13.0 - die.x : die.x)) / 196.0;
  float write = fract(uWrite + vSeed);
  float done = step(order, write);
  float head = 1.0 - smoothstep(0.0, 0.012, abs(order - write));
  // Patterned dies shimmer like thin films; unwritten silicon is a grey mirror.
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (nv * 1.6 + h21(die) * 0.3 + vec3(0.0, 0.33, 0.67)));
  float traces = step(0.5, fract(f.x * 9.0 + step(0.5, h21(die + 3.0)) * f.y * 9.0)) * 0.5 + 0.5;
  vec3 silicon = vec3(0.55, 0.57, 0.6) * (0.25 + 0.75 * pow(1.0 - nv, 3.0)) + vec3(0.06);
  vec3 c = mix(silicon, film * traces * 0.9 + 0.05, done * inDie);
  float lit = max(dot(N, normalize(uSunDir)), 0.0) * 0.6 + 0.4;
  c *= lit;
  c += cAccent * head * inDie * 3.0;
  c += cAccent * done * inDie * 0.08 * (0.6 + 0.4 * sin(uTime * 2.0 + h21(die) * 30.0));
  gl_FragColor = vec4(c, 1.0);
  #include <logdepthbuf_fragment>
}`;

function waferMaterial(ctx: KindContext, sunDir: THREE.Vector3) {
  const T = ctx.three;
  const uniforms = {
    uWrite: { value: 0 },
    uTime: { value: 0 },
    uCam: { value: new T.Vector3() },
    cAccent: { value: new T.Color(ctx.colour) },
    uSunDir: { value: sunDir },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: WAFER_VERT,
    fragmentShader: WAFER_FRAG,
    uniforms,
  });
  return { mat, uniforms };
}

const wafer: Builder = (ctx, o) => (o.orbit ? orbitWafer(ctx, o) : waferLine(ctx, o));

/** Wafers in sealed chambers along a line, each under an electron-beam column. */
function waferLine(ctx: KindContext, o: ComputeOptions): ComputeWorld {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, 400));
  const PER = 10;
  const SX = 1.7;
  const SZ = 3.2;
  const clock = makeClock(ctx);
  const preset = SKIES.void as (typeof SKIES)["void"];
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const ground = makeTerrain(ctx, "floor", sky, 30);
  scene.add(ground.mesh);
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const r = rng(21);
  const rowsN = Math.ceil(n / PER);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / PER);
    const col = i % PER;
    const x = (col - (Math.min(n, PER) - 1) / 2) * SX;
    const z = (row - (rowsN - 1) / 2) * SZ * (row % 2 ? 1 : 1);
    m.makeTranslation(x, 0, z);
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.15), i * 2);
    seed[i] = r();
    at.set([x, 0.9, z], i * 3);
  }
  const looks = makeLooks(ctx, clock, { grow: "print", height: 2.2 });
  const glass = growMaterial(ctx, clock, {
    grow: "print",
    height: 2.2,
    colour: "#9fc4e8",
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const parts: Part[] = [
    {
      geo: s.merge([
        s.box(1.3, 0.08, 1.1, 0, 0.84, 0),
        s.box(0.08, 0.84, 0.08, -0.6, 0.42, -0.5),
        s.box(0.08, 0.84, 0.08, 0.6, 0.42, -0.5),
        s.box(0.08, 0.84, 0.08, -0.6, 0.42, 0.5),
        s.box(0.08, 0.84, 0.08, 0.6, 0.42, 0.5),
        s.box(1.3, 0.08, 1.1, 0, 1.8, 0),
      ]),
      look: "frame",
    },
    { geo: s.box(1.26, 0.92, 1.06, 0, 1.34, 0), look: "glass" },
    {
      geo: s.merge([
        s.cyl(0.13, 0.16, 0.5, 0, 2.05, 0, 14),
        s.cyl(0.05, 0.08, 0.16, 0, 1.75, 0, 10),
      ]),
      look: "dark",
    },
    { geo: s.cyl(0.17, 0.17, 0.015, 0, 0.8875, 0, 40), look: "frame" },
  ];
  const crowd0 = makeCrowd(ctx, parts, { ...looks.looks, glass }, mats, grow, seed);
  scene.add(crowd0.group);
  // The wafers: one shader shared by every chamber, each wafer at its own point in the writing.
  const waferGeo = new T.CircleGeometry(0.15, 48);
  waferGeo.rotateX(-Math.PI / 2);
  waferGeo.translate(0, 0.9, 0);
  waferGeo.setAttribute("aSeed", new T.InstancedBufferAttribute(seed, 1));
  const sunDir = new T.Vector3(0.3, 1, 0.2).normalize();
  const wm = waferMaterial(ctx, sunDir);
  const wafers = new T.InstancedMesh(waferGeo, wm.mat, n);
  (wafers.instanceMatrix.array as Float32Array).set(mats);
  wafers.frustumCulled = false;
  scene.add(wafers);
  // Electron beams: a bright thread from each column's tip to its wafer, and the spot it writes.
  const beamTop = new Float32Array(n * 3);
  const beamGrow = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    beamTop.set([at[i * 3] as number, 1.67, at[i * 3 + 2] as number], i * 3);
    beamGrow.set([(grow[i * 2] as number) + (grow[i * 2 + 1] as number), 0.01], i * 2);
  }
  const beamList: Parameters<typeof lines>[1] = [];
  for (let i = 0; i < n; i++) {
    const x = at[i * 3] as number;
    const z = at[i * 3 + 2] as number;
    beamList.push({
      a: [x, 1.67, z],
      b: [x + 0.02, 0.905, z + 0.02],
      lift: 0,
      start: (grow[i * 2] as number) + (grow[i * 2 + 1] as number),
      draw: 0.01,
      w: 1,
      segs: 4,
    });
  }
  const accent = new T.Color(ctx.colour);
  const beamLines = lines(ctx, beamList, {
    line: accent.clone().multiplyScalar(1.4),
    pulse: new T.Color("#ffffff").multiplyScalar(2),
    pulses: 1,
    speed: 3,
    gain: 1,
  });
  scene.add(beamLines.lines);
  const spot = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    spot.set([(at[i * 3] as number) + 0.02, 0.91, (at[i * 3 + 2] as number) + 0.02], i * 3);
  const spots = makeGlows(ctx, clock, {
    position: spot,
    grow: beamGrow,
    colour: accent.clone().lerp(new T.Color("#ffffff"), 0.4).multiplyScalar(2),
    size: 0.05,
    min: 2,
    max: 30,
    twinkle: 0.6,
  });
  scene.add(spots.points);
  const tops = makeGlows(ctx, clock, {
    position: beamTop,
    grow: beamGrow,
    colour: accent.clone().multiplyScalar(1.2),
    size: 0.08,
    min: 1.5,
    max: 20,
    twinkle: 0.3,
  });
  scene.add(tops.points);
  const frame = crowd(at);
  const count = standing(n);
  return {
    noun: ["chamber", "chambers"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const k = Math.min(n, count(p));
      const c = frame(k);
      const R = Math.max(0.22, c.radius * 1.5 + 0.2 * ramp(p, 0, 0.3) + (k > 1 ? 0.6 : 0));
      const d = logMix(0.62, Math.max(0.62, R * 2.6), ramp(p, 0, 1) ** 0.6);
      const view = orbitView(
        [c.centre[0], 0.9, c.centre[2]],
        d,
        mix(1.2, 1.85, ramp(p, 0, 1)),
        mix(0.95, 0.55, ramp(p, 0, 0.6)),
        0.3,
        6,
      );
      return view;
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      wm.uniforms.uWrite.value = 0.15 + p * 2.3 + time * 0.01;
      wm.uniforms.uTime.value = time;
      ctx.camera.getWorldPosition(wm.uniforms.uCam.value);
      beamLines.uniforms.uClock.value = count(p) / n;
      beamLines.update(time);
      sky.update(ctx.camera);
      light.update(viewDistance(ctx.camera));
      ground.update(time, ctx.camera);
      spots.update(px);
      tops.update(px);
    },
    dispose() {
      for (const x of [sky, light, ground, crowd0, looks, beamLines, spots, tops]) x.dispose();
      for (const part of parts) part.geo.dispose();
      glass.dispose();
      waferGeo.dispose();
      wm.mat.dispose();
      wafers.dispose();
    },
  };
}

/** A wafer patterned in orbit: a shield's shadow, beams with no cleanroom, a radiator glowing red. */
function orbitWafer(ctx: KindContext, o: ComputeOptions): ComputeWorld {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, 60));
  const clock = makeClock(ctx);
  const sunDir = new T.Vector3(-0.8, 0.3, -0.5).normalize();
  const backdrop = makeOrbitBackdrop(ctx, sunDir);
  const looks = makeLooks(ctx, clock, { grow: "pop" });
  const heat = growMaterial(ctx, clock, {
    grow: "pop",
    colour: "#1e1210",
    emissive: "#a8260c",
    emissiveIntensity: 0.3 + 1.4 * o.radiators,
    lights: true,
    flicker: 0.04,
  });
  // The shield faces the Sun (-x side); the wafer sits in its shadow on a turntable.
  const shield = new T.CylinderGeometry(1.7, 1.7, 0.05, 48);
  shield.rotateZ(Math.PI / 2);
  shield.translate(-1.5, 0, 0);
  const parts: Part[] = [
    { geo: shield, look: "mirror" },
    {
      geo: s.merge([
        s.box(1.7, 0.12, 0.12, -0.65, -0.3, 0),
        s.box(0.12, 0.12, 2.2, 0, -0.4, 0.4),
        s.cyl(0.22, 0.25, 0.2, 0, -0.12, 0, 20),
      ]),
      look: "frame",
    },
    {
      geo: s.merge([
        s.cyl(0.07, 0.1, 0.45, -0.35, 0.65, 0, 10, false, 0, 0.5),
        s.cyl(0.07, 0.1, 0.45, 0.35, 0.65, 0, 10, false, 0, -0.5),
      ]),
      look: "dark",
    },
    { geo: s.box(0.9, 0.04, 0.6, 0.2, -0.4, 1.4), look: "heat" },
    { geo: s.box(2.6, 0.04, 1.6, 0.6, -0.4, -1.6), look: "dark" },
  ];
  const STEP = 11;
  const xz = hexDisc(n, STEP, 0.2, 4);
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const r = rng(8);
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2] as number;
    const z = xz[i * 2 + 1] as number;
    m.makeTranslation(x, (r() - 0.5) * 2, z);
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.15), i * 2);
    seed[i] = r();
    at.set([x, m.elements[13], z], i * 3);
  }
  const rigs = makeCrowd(ctx, parts, { ...looks.looks, heat }, mats, grow, seed);
  scene.add(rigs.group);
  const waferGeo = new T.CircleGeometry(0.15, 48);
  waferGeo.rotateX(-Math.PI / 2);
  waferGeo.translate(0, 0.0, 0);
  waferGeo.setAttribute("aSeed", new T.InstancedBufferAttribute(seed, 1));
  const wm = waferMaterial(ctx, new T.Vector3(0, 1, 0));
  const wafers = new T.InstancedMesh(waferGeo, wm.mat, n);
  wafers.frustumCulled = false;
  scene.add(wafers);
  const accent = new T.Color(ctx.colour);
  const beamList: Parameters<typeof lines>[1] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [at[i * 3] as number, at[i * 3 + 1] as number, at[i * 3 + 2] as number];
    const start = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
    beamList.push({
      a: [x - 0.46, y + 0.84, z],
      b: [x - 0.03, y + 0.01, z],
      lift: 0,
      start,
      draw: 0.01,
      w: 1,
      segs: 4,
    });
    beamList.push({
      a: [x + 0.46, y + 0.84, z],
      b: [x + 0.03, y + 0.01, z],
      lift: 0,
      start,
      draw: 0.01,
      w: 1,
      segs: 4,
    });
  }
  const beams = lines(ctx, beamList, {
    line: accent.clone().multiplyScalar(1.3),
    pulse: new T.Color("#ffffff").multiplyScalar(2),
    pulses: 1,
    speed: 3,
    gain: 1,
  });
  scene.add(beams.lines);
  const gp = new Float32Array(n * 6);
  const gg = new Float32Array(n * 4);
  const gc = new Float32Array(n * 6);
  const red = new T.Color("#ff4a1a").multiplyScalar(0.2 + o.radiators * 1.2);
  const hot = accent.clone().lerp(new T.Color("#ffffff"), 0.4).multiplyScalar(2);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [at[i * 3] as number, at[i * 3 + 1] as number, at[i * 3 + 2] as number];
    gp.set([x, y + 0.01, z, x + 0.2, y - 0.38, z + 1.4], i * 6);
    const st = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
    gg.set([st, 0.01, st, 0.01], i * 4);
    gc.set([hot.r, hot.g, hot.b, red.r, red.g, red.b], i * 6);
  }
  const glows = makeGlows(ctx, clock, {
    position: gp,
    grow: gg,
    colour: gc,
    size: 0.1,
    min: 1.6,
    max: 40,
    twinkle: 0.4,
  });
  scene.add(glows.points);
  const frame = crowd(at);
  const count = standing(n);
  const turn = new T.Matrix4();
  return {
    noun: ["wafer", "wafers"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const c = frame(Math.min(n, count(p)));
      const R = c.radius * 1.4 + 3.5;
      const far = R * 2.6;
      const d = logMix(1.1, far, ramp(p, 0, 1) ** 0.7);
      // Slide from the first rig to the formation's centre as fast as the camera backs away, so
      // the rigs stay in frame on the way out.
      const t = (d - 1.1) / Math.max(1e-6, far - 1.1);
      const target: V3 = [0, 1, 2].map((j) => mix(at[j] as number, c.centre[j] as number, t)) as V3;
      return orbitView(
        target,
        d,
        mix(0.95, 0.45, ramp(p, 0, 1)),
        mix(0.9, 0.55, ramp(p, 0.3, 1)),
        0.3,
        6,
      );
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      // Each wafer turns on its table as the beams write.
      for (let i = 0; i < n; i++) {
        m.fromArray(mats, i * 16);
        turn.makeRotationY(time * 0.4 + (seed[i] as number) * 6);
        m.multiply(turn);
        m.toArray(wafers.instanceMatrix.array as Float32Array, i * 16);
      }
      wafers.instanceMatrix.needsUpdate = true;
      wm.uniforms.uWrite.value = 0.15 + p * 2 + time * 0.01;
      wm.uniforms.uTime.value = time;
      ctx.camera.getWorldPosition(wm.uniforms.uCam.value);
      beams.uniforms.uClock.value = count(p) / n;
      beams.update(time);
      backdrop.update(time, ctx.camera);
      glows.update(px);
    },
    dispose() {
      for (const x of [backdrop, rigs, looks, beams, glows]) x.dispose();
      for (const part of parts) part.geo.dispose();
      heat.dispose();
      waferGeo.dispose();
      wm.mat.dispose();
      wafers.dispose();
    },
  };
}

// --- A swarm of compute leaves ---------------------------------------------------------------------

/** Thin leaves in formation, faces to the Sun, backs dotted with glowing chiplets, laser-linked. */
const swarm: Builder = (ctx, o) => {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, Math.round(5000 * ctx.detail)));
  const STEP = 16;
  const xz = hexDisc(n, STEP, 0.25, 17);
  const clock = makeClock(ctx);
  const sunDir = new T.Vector3(-0.62, 0.5, -0.6).normalize();
  const backdrop = makeOrbitBackdrop(ctx, sunDir);
  const chips = canvasTexture(ctx, 128, 128, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#fff";
    for (let y = 8; y < 128; y += 16)
      for (let x = 8; x < 128; x += 16) g.fillRect(x - 3, y - 3, 6, 6);
  });
  const looks = makeLooks(ctx, clock, { grow: "pop" });
  const back = growMaterial(ctx, clock, {
    grow: "pop",
    colour: "#15171c",
    metalness: 0.6,
    roughness: 0.4,
    emissive: ctx.colour,
    emissiveMap: chips,
    emissiveIntensity: 1.8,
    lights: true,
    flicker: 0.3,
  });
  const parts: Part[] = [
    { geo: s.box(9, 0.04, 9, 0, 0.03, 0), look: "glass" },
    { geo: s.box(9, 0.04, 9, 0, -0.03, 0), look: "back" },
    {
      geo: s.merge([
        s.box(9.2, 0.12, 0.12, 0, 0, 4.55),
        s.box(9.2, 0.12, 0.12, 0, 0, -4.55),
        s.box(0.12, 0.12, 9.2, 4.55, 0, 0),
        s.box(0.12, 0.12, 9.2, -4.55, 0, 0),
      ]),
      look: "frame",
    },
  ];
  // Every leaf turns its face (local +y) to the Sun.
  const face = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), sunDir);
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const v = new T.Vector3();
  const r = rng(29);
  for (let i = 0; i < n; i++) {
    v.set(xz[i * 2] as number, (r() - 0.5) * 3, xz[i * 2 + 1] as number);
    m.compose(v, face, new T.Vector3(1, 1, 1));
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.12), i * 2);
    seed[i] = r();
    at.set([v.x, v.y, v.z], i * 3);
  }
  const leaves = makeCrowd(ctx, parts, { ...looks.looks, back }, mats, grow, seed);
  scene.add(leaves.group);
  const glowsAt = new Float32Array(n * 3);
  const under = sunDir.clone().multiplyScalar(-0.8);
  for (let i = 0; i < n; i++)
    glowsAt.set(
      [
        (at[i * 3] as number) + under.x,
        (at[i * 3 + 1] as number) + under.y,
        (at[i * 3 + 2] as number) + under.z,
      ],
      i * 3,
    );
  const glows = makeGlows(ctx, clock, {
    position: glowsAt,
    grow,
    colour: new T.Color(ctx.colour).multiplyScalar(0.9),
    size: 1.5,
    min: 1.5,
    max: 30,
    twinkle: 0.3,
  });
  scene.add(glows.points);
  // Laser links between neighbours on the lattice.
  const list: Parameters<typeof lines>[1] = [];
  const cell = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
  for (let i = 0; i < n; i++) {
    const x = at[i * 3] as number;
    const z = at[i * 3 + 2] as number;
    const cx = Math.round(x / STEP);
    const cz = Math.round(z / STEP);
    let links = 0;
    for (let dz = -1; dz <= 1 && links < 3; dz++) {
      for (let dx = -1; dx <= 1 && links < 3; dx++) {
        for (const j of cell.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (links >= 3) break;
          const d = Math.hypot((at[j * 3] as number) - x, (at[j * 3 + 2] as number) - z);
          if (d > STEP * 1.3) continue;
          const end = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
          list.push({
            a: [at[j * 3] as number, at[j * 3 + 1] as number, at[j * 3 + 2] as number],
            b: [x, at[i * 3 + 1] as number, z],
            lift: 0,
            start: end,
            draw: 0.3 / n + 0.004,
            w: 0.7,
            segs: 3,
          });
          links++;
        }
      }
    }
    const k = key(x, z);
    const listK = cell.get(k);
    if (listK) listK.push(i);
    else cell.set(k, [i]);
  }
  const laser = new T.Color("#9fd8ff");
  const links = lines(ctx, list, {
    line: laser.clone().multiplyScalar(0.18),
    pulse: laser.clone().multiplyScalar(1.5),
    pulses: 0.9,
    speed: 1.5,
    gain: 0.6,
  });
  scene.add(links.lines);
  const frame = crowd(at);
  const count = standing(n);
  return {
    noun: ["leaf", "leaves"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const c = frame(Math.min(n, count(p)));
      const R = Math.max(7, c.radius * 1.45 + 6);
      return orbitView(
        c.centre,
        R * 2.5,
        mix(0.75, 1.4, ramp(p, 0, 1)),
        mix(0.35, 0.7, ramp(p, 0, 1)),
        0.2,
        5,
      );
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      links.uniforms.uClock.value = count(p) / n;
      links.update(time);
      backdrop.update(time, ctx.camera);
      glows.update(px);
    },
    dispose() {
      for (const x of [backdrop, leaves, looks, glows, links]) x.dispose();
      for (const part of parts) part.geo.dispose();
      back.dispose();
      chips.dispose();
    },
  };
};

// --- Quantum: dilution fridges ----------------------------------------------------------------------

/** Chandeliers of gold plates in a hall, microwave pulses running down to a grid of qubits. */
const quantum: Builder = (ctx, o) => {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, 200));
  const clock = makeClock(ctx);
  const preset = SKIES.void as (typeof SKIES)["void"];
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const ground = makeTerrain(ctx, "floor", sky, 40);
  scene.add(ground.mesh);
  const looks = makeLooks(ctx, clock, { grow: "print", height: 2.6 });
  // Plates from room temperature at the top to the mixing chamber at the bottom.
  const plates: [number, number][] = [
    [1.75, 0.3],
    [1.45, 0.27],
    [1.18, 0.23],
    [0.95, 0.19],
    [0.75, 0.16],
  ];
  const goldParts: THREE.BufferGeometry[] = plates.map(([y, rr]) =>
    s.cyl(rr, rr, 0.025, 0, y, 0, 40),
  );
  for (let k = 0; k < plates.length - 1; k++) {
    const [y0, r0] = plates[k] as [number, number];
    const [y1] = plates[k + 1] as [number, number];
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * Math.PI * 2 + k;
      goldParts.push(
        s.cyl(
          0.008,
          0.008,
          y0 - y1,
          Math.cos(ang) * r0 * 0.7,
          (y0 + y1) / 2,
          Math.sin(ang) * r0 * 0.7,
          6,
        ),
      );
    }
  }
  goldParts.push(s.box(0.07, 0.09, 0.05, 0, 0.67, 0));
  const COAX = 14;
  const coax: THREE.BufferGeometry[] = [];
  const coaxAt: [number, number][] = [];
  for (let k = 0; k < COAX; k++) {
    const ang = (k / COAX) * Math.PI * 2;
    const rr = 0.09 + (k % 2) * 0.03;
    coaxAt.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
    coax.push(s.cyl(0.004, 0.004, 1.1, Math.cos(ang) * rr, 1.27, Math.sin(ang) * rr, 5));
  }
  const parts: Part[] = [
    { geo: s.merge(goldParts), look: "brass" },
    { geo: s.merge(coax), look: "copper" },
    {
      geo: s.merge([
        s.cyl(0.34, 0.34, 0.06, 0, 2.05, 0, 40),
        s.box(0.06, 2.6, 0.06, 0.42, 1.3, 0.42),
        s.box(0.06, 2.6, 0.06, -0.42, 1.3, 0.42),
        s.box(0.06, 2.6, 0.06, 0.42, 1.3, -0.42),
        s.box(0.06, 2.6, 0.06, -0.42, 1.3, -0.42),
        s.box(0.9, 0.06, 0.9, 0, 2.6, 0),
      ]),
      look: "frame",
    },
    { geo: s.decal(1.4, 1.4), look: "shadow" },
  ];
  const PER = 4;
  const SP = 2.6;
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const r = rng(41);
  const rowsN = Math.ceil(n / PER);
  for (let i = 0; i < n; i++) {
    const x = ((i % PER) - (Math.min(n, PER) - 1) / 2) * SP;
    const z = (Math.floor(i / PER) - (rowsN - 1) / 2) * SP;
    m.makeTranslation(x, 0, z);
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.15), i * 2);
    seed[i] = r();
    at.set([x, 1, z], i * 3);
  }
  // Gold plating under lab light: a little emissive, so it reads against the dark hall.
  const brass = growMaterial(ctx, clock, {
    grow: "print",
    height: 2.6,
    colour: "#e2b25e",
    metalness: 0.6,
    roughness: 0.28,
    emissive: "#6a4210",
    emissiveIntensity: 0.6,
  });
  const fridges = makeCrowd(ctx, parts, { ...looks.looks, brass }, mats, grow, seed);
  scene.add(fridges.group);
  // Microwave pulses down the coax to the chip.
  const accent = new T.Color(ctx.colour);
  const list: Parameters<typeof lines>[1] = [];
  for (let i = 0; i < n; i++) {
    const x = at[i * 3] as number;
    const z = at[i * 3 + 2] as number;
    const st = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
    for (const [cx, cz] of coaxAt)
      list.push({
        a: [x + cx, 1.82, z + cz],
        b: [x + cx * 0.3, 0.72, z + cz * 0.3],
        lift: 0,
        start: st,
        draw: 0.02,
        w: 0.8,
        segs: 6,
      });
  }
  const pulses = lines(ctx, list, {
    line: new T.Color("#5a8fd0").multiplyScalar(0.15),
    pulse: new T.Color("#8fd0ff").multiplyScalar(1.6),
    pulses: 1,
    speed: 1.4,
    gain: 0.9,
  });
  scene.add(pulses.lines);
  // The qubits: a 7 by 7 grid on the chip's face, data and measure qubits in a checkerboard.
  const Q = 7;
  const qp = new Float32Array(n * Q * Q * 3);
  const qg = new Float32Array(n * Q * Q * 2);
  const qc = new Float32Array(n * Q * Q * 3);
  const blue = new T.Color("#7fc8ff").multiplyScalar(1.4);
  const acc = accent.clone().multiplyScalar(1.5);
  for (let i = 0; i < n; i++) {
    const st = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
    for (let a = 0; a < Q; a++) {
      for (let b = 0; b < Q; b++) {
        const k = (i * Q + a) * Q + b;
        qp.set(
          [
            (at[i * 3] as number) + (a - 3) * 0.008,
            0.67 + (b - 3) * 0.009,
            (at[i * 3 + 2] as number) + 0.026,
          ],
          k * 3,
        );
        qg.set([st, 0.01], k * 2);
        const c = (a + b) % 2 ? blue : acc;
        qc.set([c.r, c.g, c.b], k * 3);
      }
    }
  }
  const qubits = makeGlows(ctx, clock, {
    position: qp,
    grow: qg,
    colour: qc,
    size: 0.006,
    min: 1.2,
    max: 16,
    twinkle: 0.85,
  });
  scene.add(qubits.points);
  const frame = crowd(at);
  const count = standing(n);
  return {
    noun: ["cryostat", "cryostats"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const k = Math.min(n, count(p));
      const c = frame(k);
      const zoom = ramp(p, 0, 1);
      const R = c.radius * 1.4 + 1.4;
      const d = logMix(1.7, Math.max(3.2, R * 2.6), zoom ** 0.75);
      const ty = mix(1.25, 1.0, zoom);
      const cx = mix(at[0] as number, c.centre[0], ramp(p, 0.2, 1));
      const cz = mix(at[2] as number, c.centre[2], ramp(p, 0.2, 1));
      return orbitView([cx, ty, cz], d, mix(1.3, 1.05, zoom), mix(0.1, 0.5, zoom), 0.25, 6);
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      pulses.uniforms.uClock.value = count(p) / n;
      pulses.update(time);
      sky.update(ctx.camera);
      light.update(viewDistance(ctx.camera));
      ground.update(time, ctx.camera);
      qubits.update(px);
    },
    dispose() {
      for (const x of [sky, light, ground, fridges, looks, pulses, qubits]) x.dispose();
      brass.dispose();
      for (const part of parts) part.geo.dispose();
    },
  };
};

// --- Optical: light in waveguides ------------------------------------------------------------------

/**
 * Photonic chips: light enters at one edge, threads a mesh of interferometers (each crossing a
 * multiply), and lands on detectors at the other. Chips in a grid on a board.
 */
const optical: Builder = (ctx, o) => {
  const T = ctx.three;
  const { scene } = ctx;
  const s = shapes(T);
  const n = Math.max(1, Math.min(o.racks, 120));
  const clock = makeClock(ctx);
  const preset = SKIES.void as (typeof SKIES)["void"];
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const ground = makeTerrain(ctx, "floor", sky, 20);
  scene.add(ground.mesh);
  const looks = makeLooks(ctx, clock, { grow: "pop" });
  const parts: Part[] = [
    { geo: s.box(1, 0.04, 1, 0, 0.12, 0), look: "die" },
    { geo: s.box(1.2, 0.1, 1.2, 0, 0.05, 0), look: "frame" },
  ];
  const PER = 8;
  const SP = 1.5;
  const mats = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const r = rng(51);
  const rowsN = Math.ceil(n / PER);
  for (let i = 0; i < n; i++) {
    const x = ((i % PER) - (Math.min(n, PER) - 1) / 2) * SP;
    const z = (Math.floor(i / PER) - (rowsN - 1) / 2) * SP;
    m.makeTranslation(x, 0, z);
    m.toArray(mats, i * 16);
    grow.set(win(i, n, 0.15), i * 2);
    seed[i] = r();
    at.set([x, 0.14, z], i * 3);
  }
  // Silicon: a blue-grey mirror.
  const die = growMaterial(ctx, clock, {
    grow: "pop",
    colour: "#5a6478",
    metalness: 0.55,
    roughness: 0.22,
  });
  const chips = makeCrowd(ctx, parts, { ...looks.looks, die }, mats, grow, seed);
  scene.add(chips.group);
  // The mesh: 8 waveguides across each chip, with couplers between neighbours in alternating
  // columns (a Clements mesh), and light running left to right through all of it.
  const CH = 8;
  const COLS = 10;
  const y = 0.142;
  const list: Parameters<typeof lines>[1] = [];
  const heaters: number[] = [];
  const heaterGrow: number[] = [];
  const io: number[] = [];
  const ioGrow: number[] = [];
  for (let i = 0; i < n; i++) {
    const ox = at[i * 3] as number;
    const oz = at[i * 3 + 2] as number;
    const st = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
    const zAt = (c: number) => oz + (c - (CH - 1) / 2) * 0.1;
    const xAt = (k: number) => ox - 0.42 + (k / COLS) * 0.84;
    for (let k = 0; k < COLS; k++) {
      const x0 = xAt(k);
      const x1 = xAt(k + 1);
      const coupled = new Set<number>();
      for (let c = k % 2; c + 1 < CH; c += 2) {
        coupled.add(c);
        coupled.add(c + 1);
        list.push({
          a: [x0, y, zAt(c)],
          b: [x1, y, zAt(c + 1)],
          lift: 0,
          start: st + k * 0.002,
          draw: 0.004,
          w: 0.9,
          segs: 3,
        });
        list.push({
          a: [x0, y, zAt(c + 1)],
          b: [x1, y, zAt(c)],
          lift: 0,
          start: st + k * 0.002,
          draw: 0.004,
          w: 0.9,
          segs: 3,
        });
        heaters.push((x0 + x1) / 2, y + 0.002, (zAt(c) + zAt(c + 1)) / 2);
        heaterGrow.push(st + k * 0.002, 0.01);
      }
      for (let c = 0; c < CH; c++) {
        if (!coupled.has(c))
          list.push({
            a: [x0, y, zAt(c)],
            b: [x1, y, zAt(c)],
            lift: 0,
            start: st + k * 0.002,
            draw: 0.004,
            w: 0.6,
            segs: 3,
          });
      }
    }
    for (let c = 0; c < CH; c++) {
      list.push({
        a: [ox - 0.9, y + 0.05, zAt(c) * 1 + (c - 3.5) * 0.04],
        b: [xAt(0), y, zAt(c)],
        lift: 0.02,
        start: st,
        draw: 0.01,
        w: 0.7,
        segs: 6,
      });
      io.push(xAt(COLS) + 0.02, y + 0.003, zAt(c));
      ioGrow.push(st + 0.02, 0.01);
    }
  }
  const links = lines(ctx, list, {
    line: new T.Color("#4a6fa0").multiplyScalar(0.6),
    pulse: new T.Color(ctx.colour).lerp(new T.Color("#9fe0ff"), 0.35).multiplyScalar(1.7),
    pulses: 1,
    speed: 0.5,
    gain: 0.9,
  });
  scene.add(links.lines);
  const heat = makeGlows(ctx, clock, {
    position: new Float32Array(heaters),
    grow: new Float32Array(heaterGrow),
    colour: new T.Color(ctx.colour).multiplyScalar(1.3),
    size: 0.012,
    min: 1.2,
    max: 14,
    twinkle: 0.7,
  });
  const det = makeGlows(ctx, clock, {
    position: new Float32Array(io),
    grow: new Float32Array(ioGrow),
    colour: new T.Color("#9fe0ff").multiplyScalar(1.6),
    size: 0.02,
    min: 1.4,
    max: 18,
    twinkle: 0.5,
  });
  scene.add(heat.points, det.points);
  const frame = crowd(at);
  const count = standing(n);
  return {
    noun: ["chip", "chips"],
    built: (p) => clamp01((count(p) - 1) / Math.max(1, n - 1)),
    pose(p) {
      const c = frame(Math.min(n, count(p)));
      const R = Math.max(0.18, c.radius * 1.4 + 0.65 * ramp(p, 0.1, 0.4));
      const d = logMix(1.3, Math.max(1.3, R * 2.6), ramp(p, 0, 1) ** 0.7);
      return orbitView(
        [c.centre[0], 0.14, c.centre[2]],
        d,
        mix(1.25, 1.75, ramp(p, 0, 1)),
        mix(0.95, 0.62, ramp(p, 0, 1)),
        0.3,
        6,
      );
    },
    update(time, p, px) {
      clock.uBuilt.value = count(p) / n;
      clock.uTime.value = time;
      links.uniforms.uClock.value = count(p) / n;
      links.update(time);
      sky.update(ctx.camera);
      light.update(viewDistance(ctx.camera));
      ground.update(time, ctx.camera);
      heat.update(px);
      det.update(px);
    },
    dispose() {
      for (const x of [sky, light, ground, chips, looks, links, heat, det]) x.dispose();
      die.dispose();
      for (const part of parts) part.geo.dispose();
    },
  };
};

export const COMPUTERS: Record<"datacentre" | "wafer" | "swarm" | "quantum" | "optical", Builder> =
  {
    datacentre,
    wafer,
    swarm,
    quantum,
    optical,
  };
