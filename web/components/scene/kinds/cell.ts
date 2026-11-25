/**
 * A living cell, then many. The story starts close on one cell (a rod-shaped microbe with its
 * chromosome and flagella, a plant cell streaming chloroplasts round its vacuole, an animal cell
 * with its nucleus and mitochondria, a swimming alga with its cup-shaped chloroplast and eyespot,
 * or a neuron firing down its myelinated axon) as its designed genes switch on and it glows. If it
 * divides, it pinches in two and the daughters part; then the camera pulls back through a colony
 * doubling around it to a living mat: a biofilm, a leaf, a tissue, a bloom or a firing network.
 *
 * Units: one cell is about 2.5 across. Progress: genes on by 0.3, division to 0.5, colony to 0.8,
 * the mat to 1. Organelles sets how full the cell is; glow how brightly its new genes shine.
 */
import type * as THREE from "three";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import {
  CELL_FUNCS,
  type CellType,
  interior,
  makeMembrane,
  makeOrganelles,
  neurites,
  type Organelle,
  randomQ,
  SHAPE,
} from "../lib/matter/cells.ts";
import {
  Bin,
  flight,
  glowPoints,
  LIGHT,
  lin,
  makeBackdrop,
  onSphere,
  pixelScale,
  ramp,
  rng,
  type Shot,
  share,
  storyBeats,
} from "../lib/matter/common.ts";
import type { Kind } from "../types.ts";

const TYPES: CellType[] = ["microbe", "plant", "animal", "algae", "neuron"];

/** Each type's skin, its half extents, how far its daughters move apart, and its streaming. */
const LOOK: Record<
  CellType,
  { mem: string; extent: [number, number, number]; half: number; stream: number; wob: number }
> = {
  microbe: { mem: "#9fe6ff", extent: [1.26, 0.46, 0.46], half: 0.78, stream: 0, wob: 0.05 },
  plant: { mem: "#b8f0c0", extent: [1.45, 0.92, 0.92], half: 0.9, stream: 0.35, wob: 0.02 },
  animal: { mem: "#ffc9e0", extent: [1.05, 1.05, 1.05], half: 0.72, stream: 0.12, wob: 0.16 },
  algae: { mem: "#c6ffd8", extent: [0.95, 0.8, 0.8], half: 0.65, stream: 0.05, wob: 0.06 },
  neuron: { mem: "#cfe0ff", extent: [0.55, 0.55, 0.55], half: 0.4, stream: 0.08, wob: 0.12 },
};

/** The mat's surface, by cell type (CELL), spreading to radius uR with a ragged, glowing front. */
const MAT_FRAG = /* glsl */ `
${FRAG_HEAD}
${NOISE}
uniform float uMat;
uniform float uR;
uniform float uFront;
uniform float uHole;
uniform float uTime;
uniform float uGlow;
uniform float uFog;
uniform vec3 cHeart;
uniform vec3 cAccent;
uniform vec3 cFog;
varying vec3 vW;
// Distance to the nearest cell centre, to the nearest wall, and the cell's own random number.
vec3 voronoi(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 9.0;
  float d2 = 9.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec3 h = hash33(vec3(g + o, 7.0));
      vec2 r = o + 0.15 + 0.7 * h.xy - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = h.z; }
      else if (d < d2) d2 = d;
    }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
void main() {
  vec2 p = vW.xz;
  float r = length(p);
  // The growing edge, ragged as colonies are.
  float front = uFront * (0.82 + 0.36 * vnoise(vec3(p * 0.02, 1.0)));
  float alive = smoothstep(front, front - 3.0, r) * smoothstep(uHole * 0.8, uHole, r);
  if (alive <= 0.0) discard;
  float px = max(fwidth(p.x), 1e-3);
  float dens = fbm(vec3(p * 0.025, 3.0));
  vec3 c;
#if CELL == 0
  // Biofilm: rods packed in a slime, piled into towers where it is densest.
  vec3 v = voronoi(p * vec2(0.6, 1.2) / 1.1);
  float body = smoothstep(0.02, 0.12, v.y);
  // Water channels wind through it, dark; the dense patches are towers, brighter.
  float channel = smoothstep(0.035, 0.0, abs(fbm(vec3(p * 0.012, 5.0)) - 0.5));
  c = cHeart * (0.1 + 0.35 * body * (0.6 + 0.4 * v.z)) * (0.25 + 1.6 * dens * dens) * (1.0 - 0.8 * channel);
#elif CELL == 1
  // A leaf: bricks of cells walled in green, veins running out to the edge.
  vec2 q = p / vec2(3.15, 2.0);
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 f = min(fract(q), 1.0 - fract(q)) * vec2(3.15, 2.0);
  float wall = 1.0 - smoothstep(0.05, 0.25, min(f.x, f.y));
  float grain = hash13(vec3(floor(q), 2.0));
  float vein = smoothstep(1.4, 0.2, abs(fract((p.y - abs(p.x) * 0.55) / 38.0) - 0.5) * 38.0);
  vein = max(vein, smoothstep(2.2, 0.3, abs(p.y)));
  c = cHeart * (0.22 + 0.16 * grain) * (1.0 - 0.5 * wall) + vec3(0.25, 0.32, 0.1) * vein * 0.5;
#elif CELL == 2
  // Tissue: cells drawn out into fibres, each with its nucleus.
  vec3 v = voronoi(p * vec2(0.35, 1.0) / 1.0);
  float edge = smoothstep(0.0, 0.08, v.y);
  float nuc = smoothstep(0.32, 0.22, v.x);
  c = vec3(0.32, 0.12, 0.18) * (0.35 + 0.4 * edge) + cHeart * nuc * 0.5;
#elif CELL == 3
  // A bloom: too many cells to see, swirled by the water.
  vec2 w = p + 18.0 * vec2(fbm(vec3(p * 0.012, uTime * 0.01)), fbm(vec3(p * 0.012 + 5.0, uTime * 0.01)));
  float b = smoothstep(0.35, 0.75, fbm(vec3(w * 0.03, 2.0)));
  float speck = step(0.8, hash13(vec3(floor(p * 1.5), 1.0)));
  c = cHeart * (0.05 + 0.5 * b + 0.25 * speck * b);
  alive *= 0.35 + 0.65 * b;
#else
  // Cortex: cell bodies with their axons along the walls between them, signals running.
  vec3 v = voronoi(p / 9.0);
  float soma = smoothstep(0.12, 0.05, v.x);
  float axon = smoothstep(0.035, 0.0, v.y);
  float fire = pow(max(sin(uTime * (1.0 + v.z * 2.0) + v.z * 40.0), 0.0), 16.0);
  c = vec3(0.04, 0.04, 0.07) + cHeart * (soma * (0.5 + 1.5 * fire) + axon * 0.25) + cAccent * axon * fire * 0.8;
#endif
  // Fine detail fades out where it is smaller than a pixel, rather than shimmering.
  c = mix(c, cHeart * 0.2, smoothstep(0.3, 1.2, px));
  // The new genes glow along the growing front.
  c += cAccent * (0.15 + 0.6 * uGlow) * exp(-abs(r - front) / 2.5) * step(uFront, uR * 0.999);
  c = mix(c, cFog, 1.0 - exp(-length(cameraPosition - vW) / uFog));
  gl_FragColor = vec4(c, alive);
  ${FRAG_TAIL}
}`;

/** What fills each type of cell, more of it as organelles rises. */
function fill(type: CellType, o: number, rand: () => number): Organelle[] {
  const shape = SHAPE[type];
  const list: Organelle[] = [];
  const n = (k: number) => Math.max(1, Math.round(k * (0.25 + o)));
  const put = (
    kind: number,
    centre: [number, number, number],
    scale: [number, number, number],
    side = 0,
    q = randomQ(rand),
  ) => list.push({ kind, centre, scale, q, born: rand() * 0.9, side });
  const nucleus = (c: [number, number, number], r: number) => {
    // A copy for each daughter: the nucleus divides with the cell.
    for (const side of [-1, 1]) {
      put(0, c, [r, r * 0.92, r * 0.95], side, [0, 0, 0, 1]);
      put(1, [c[0] + r * 0.25, c[1] + r * 0.2, c[2]], [r * 0.32, r * 0.32, r * 0.32], side);
    }
  };
  if (type === "microbe") {
    for (let i = 0; i < n(8); i++) {
      const r = 0.05 + rand() * 0.05;
      put(5, interior(shape, rand, 0.2, 0.75), [r, r, r]);
    }
    for (let i = 0; i < n(6); i++) put(4, interior(shape, rand, 0.2, 0.8), [0.06, 0.05, 0.05]);
  } else if (type === "plant") {
    nucleus([0.75, 0.35, 0.3], 0.3);
    // Chloroplasts line the cell, between the vacuole and the wall.
    for (let i = 0; i < n(22); i++) put(3, interior(shape, rand, 0.78, 0.9), [0.24, 0.09, 0.17]);
    for (let i = 0; i < n(10); i++) put(2, interior(shape, rand, 0.7, 0.88), [0.14, 0.055, 0.055]);
    for (let i = 0; i < 3; i++)
      put(9, [-0.7 + i * 0.05, -0.4 + i * 0.06, 0.45], [0.2, 0.02, 0.14], 0, [0, 0, 0, 1]);
    // Carbon-concentrating shells, where the cell is packed full enough to have them.
    for (let i = 0; i < Math.round(12 * Math.max(0, o - 0.5) * 2); i++)
      put(7, interior(shape, rand, 0.72, 0.86), [0.05, 0.05, 0.05]);
  } else if (type === "animal") {
    nucleus([0.05, 0.05, 0], 0.4);
    for (let i = 0; i < n(26); i++) put(2, interior(shape, rand, 0.5, 0.85), [0.16, 0.055, 0.055]);
    for (let i = 0; i < 4; i++)
      put(9, [-0.48, 0.34 - i * 0.07, 0.25], [0.22 - i * 0.02, 0.022, 0.16], 0, [0.2, 0, 0, 0.98]);
    for (let i = 0; i < n(14); i++) {
      const r = 0.045 + rand() * 0.04;
      put(4, interior(shape, rand, 0.45, 0.9), [r, r, r]);
    }
  } else if (type === "algae") {
    nucleus([0.18, 0.05, 0], 0.24);
    // The cup-shaped chloroplast: plates tiling the back of the cell.
    for (let i = 0; i < n(26); i++) {
      const [x, y, z] = onSphere(rand);
      const d: [number, number, number] = [-Math.abs(x) - 0.2, y, z];
      const l = Math.hypot(...d);
      const b = [(d[0] / l) * 0.95 * 0.72, (d[1] / l) * 0.8 * 0.72, (d[2] / l) * 0.8 * 0.72] as [
        number,
        number,
        number,
      ];
      if (b[0] > 0.15) continue;
      put(3, b, [0.2, 0.06, 0.2]);
    }
    put(7, [-0.42, 0, 0], [0.17, 0.17, 0.17]);
    for (let i = 0; i < n(6); i++) {
      const [x, y, z] = onSphere(rand);
      put(5, [-0.42 + x * 0.21, y * 0.21, z * 0.21], [0.07, 0.025, 0.07]);
    }
    put(8, [0.42, 0.52, 0.12], [0.09, 0.035, 0.09], 0, [0.3, 0, 0, 0.95]);
    for (const z of [-0.18, 0.18]) put(6, [0.72, 0.15, z], [0.07, 0.07, 0.07]);
    for (let i = 0; i < n(6); i++) put(2, interior(shape, rand, 0.3, 0.7), [0.12, 0.045, 0.045]);
  } else {
    nucleus([0, 0, 0], 0.24);
    for (let i = 0; i < n(12); i++) put(2, interior(shape, rand, 0.55, 0.85), [0.09, 0.035, 0.035]);
    for (let i = 0; i < n(16); i++) put(9, interior(shape, rand, 0.5, 0.85), [0.06, 0.015, 0.05]);
  }
  return list;
}

/** Where the colony's cells sit, nearest first: a biofilm, a leaf's tissue, a fibre, a bloom or a
 * network. The middle is left for the first cell and its daughters. */
function colony(type: CellType, n: number, rand: () => number) {
  type Spot = { p: [number, number, number]; yaw: number; tilt: number; s: number; d: number };
  const out: Spot[] = [];
  const free = (p: [number, number, number]) => Math.hypot(p[0] * 0.6, p[1], p[2]) >= 2.2;
  if (type === "plant" || type === "animal") {
    // Packed tissue: bricks of a leaf, offset row by row, or a sheet of round cells. Each grows
    // outward from the first, with a ragged front.
    const K = Math.ceil(Math.sqrt(n)) + 2;
    for (let j = -K; j <= K; j++)
      for (let i = -K; i <= K; i++) {
        const p: [number, number, number] =
          type === "plant"
            ? [(i + (Math.abs(j) % 2) * 0.5) * 3.15, 0, j * 2.0]
            : [(i + (Math.abs(j) % 2) * 0.5) * 2.1, (rand() - 0.5) * 0.3, j * 2.1 * 0.866];
        if (type === "plant" ? !i && !j : !free(p)) continue;
        const d = Math.hypot(...p) * (0.8 + 0.4 * rand());
        out.push({
          p,
          yaw: type === "plant" ? 0 : rand() * 6.28,
          tilt: 0,
          s: type === "plant" ? 1 : 0.95 + rand() * 0.1,
          d,
        });
      }
  } else
    for (let i = 0; out.length < n && i < n * 20; i++) {
      let p: [number, number, number];
      let tilt = 0;
      if (type === "microbe") {
        const r = 1.45 * Math.sqrt(i + 3);
        const a = (i + 3) * 2.39996;
        p = [Math.cos(a) * r, (rand() - 0.5) * 0.4, Math.sin(a) * r];
      } else if (type === "algae") {
        const [x, y, z] = onSphere(rand);
        const r = 2.2 + 2.1 * Math.cbrt(i);
        p = [x * r, y * r * 0.6, z * r];
        tilt = (rand() - 0.5) * 1.5;
      } else {
        const [x, y, z] = onSphere(rand);
        const r = 3 + 2.4 * Math.cbrt(i);
        p = [x * r, y * r * 0.35, z * r];
      }
      if (!free(p)) continue;
      out.push({ p, yaw: rand() * Math.PI * 2, tilt, s: 0.85 + rand() * 0.3, d: Math.hypot(...p) });
    }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, n);
}

const cell: Kind = (ctx) => {
  const T = ctx.three;
  const bin = new Bin();
  const { scene, camera } = ctx;
  const type = (
    TYPES.includes(ctx.params.type as CellType) ? ctx.params.type : "microbe"
  ) as CellType;
  const organelles = share(ctx.params.organelles, 0.5);
  const divides = ctx.params.divide === true || ctx.params.divide === "true";
  const glow = share(ctx.params.glow, 0.4);
  const look = LOOK[type];
  const shape = SHAPE[type];
  const accent = lin(ctx, ctx.colour);
  const rand = rng(17);

  const back = makeBackdrop(ctx, bin, {
    top: "#08202a",
    bottom: "#020709",
    haze: ctx.colour,
    amount: 0.07,
  });
  scene.add(back.mesh);

  // --- The first cell --------------------------------------------------------------------------------
  const hero = new T.Group();
  scene.add(hero);
  const mem = makeMembrane(ctx, bin, accent, {
    shape,
    colour: look.mem,
    wobble: look.wob,
    half: look.half,
    fill: 0.04,
  });
  hero.add(mem.mesh);
  const skins = [mem];
  if (type === "plant") {
    // The wall outside the membrane, and the big vacuole inside.
    const wall = makeMembrane(ctx, bin, accent, {
      shape,
      colour: "#7fe0a0",
      wobble: 0,
      half: look.half,
      scale: [1.07, 1.08, 1.08],
      fill: 0.02,
    });
    const vac = makeMembrane(ctx, bin, accent, {
      shape,
      colour: "#6fa8ff",
      wobble: 0.04,
      half: look.half,
      scale: [0.62, 0.6, 0.6],
      fill: 0.07,
    });
    hero.add(wall.mesh, vac.mesh);
    skins.push(wall, vac);
  }
  const org = makeOrganelles(ctx, bin, accent, shape, fill(type, organelles, rand), {
    half: mem.uniforms.uHalf,
    stream: look.stream,
    extent: look.extent,
  });
  hero.add(org.mesh);
  // A plant cell divides by building a wall across its middle: the plate grows out from the
  // centre, bright at its growing rim, and stays as the wall between the daughters.
  const plateMat = bin.add(
    new T.MeshBasicMaterial({
      color: lin(ctx, "#c8ffb0"),
      transparent: true,
      opacity: 0,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  const rimMat = bin.add(plateMat.clone());
  rimMat.color = accent.clone();
  const plate = new T.Group();
  plate.add(
    new T.Mesh(bin.add(new T.CircleGeometry(1, 48)), plateMat),
    new T.Mesh(bin.add(new T.RingGeometry(0.9, 1, 48)), rimMat),
  );
  plate.rotation.y = Math.PI / 2;
  plate.visible = false;
  if (type === "plant") hero.add(plate);

  const cellU = {
    uSplit: mem.uniforms.uSplit,
    uHalf: mem.uniforms.uHalf,
    uWob: { value: look.wob },
    uOn: { value: 0 },
    uGlow: { value: glow },
    cAccent: { value: accent },
    uStream: { value: look.stream },
    uExtent: { value: new T.Vector3(...look.extent) },
  };
  const cellDecl = /* glsl */ `
    #define CELL ${shape}
    uniform float uSplit;
    uniform float uHalf;
    uniform float uWob;
    uniform float uOn;
    uniform float uGlow;
    uniform vec3 cAccent;
    uniform float uStream;
    uniform vec3 uExtent;
    ${CELL_FUNCS}
    vec3 stream(vec3 c, float k) {
      vec3 e = c / uExtent;
      float a = uTime * uStream * (0.6 + 0.8 * k);
      return vec3(e.x * cos(a) - e.z * sin(a), e.y, e.x * sin(a) + e.z * cos(a)) * uExtent;
    }`;
  // Ribosomes and small molecules, streaming with the cytoplasm, lit as new genes are read.
  const ribo = glowPoints(ctx, bin, {
    count: type === "neuron" ? 700 : 2600,
    seed: 23,
    colour: "#cfe8ff",
    size: 0.03,
    maxPx: 4,
    uniforms: cellU,
    decl: cellDecl,
    body: /* glsl */ `
      vec3 n = normalize(aSeed.xyz * 2.0 - 1.0 + 1e-3);
      vec3 c = baseShape(n) * pow(aSeed.w, 0.4) * 0.9;
      c = stream(c, aSeed2.x);
      c += 0.03 * sin(uTime * 3.0 + aSeed2.yzw * 30.0);
      pos = inside(c, uSplit, 0.0);
      float lit = step(aSeed2.x, 0.55) * smoothstep(aSeed2.y * 0.9, aSeed2.y * 0.9 + 0.1, uOn);
      col = mix(cColour * 0.7, cAccent * 1.1, lit * uGlow);
      alpha = 0.45 + 0.3 * lit * uGlow;`,
  });
  hero.add(ribo.points);

  // The microbe's chromosome: a supercoiled ring, built piece by piece, copied before it divides.
  let dna: ReturnType<typeof glowPoints> | undefined;
  const dnaU = { uDNA: { value: 1 } };
  if (type === "microbe") {
    const m = ctx.detail < 0.5 ? 900 : 1800;
    const P = new Float32Array(m * 2 * 3);
    const A = new Float32Array(m * 2 * 2);
    for (const [ci, side] of [
      [0, -1],
      [1, 1],
    ] as const)
      for (let i = 0; i < m; i++) {
        const t = (i / m) * Math.PI * 2;
        // The nucleoid: one closed loop folded on itself many times.
        const x = 0.62 * Math.sin(3 * t + 0.7 * Math.sin(5 * t));
        const y = 0.2 * Math.sin(7 * t + 0.4) + 0.05 * Math.sin(29 * t);
        const z = 0.2 * Math.cos(11 * t) + 0.05 * Math.cos(31 * t);
        P.set([x, y, z], (ci * m + i) * 3);
        A.set([i / m, side], (ci * m + i) * 2);
      }
    dna = glowPoints(ctx, bin, {
      count: 0,
      seed: 29,
      colour: "#7ff6ff",
      size: 0.035,
      maxPx: 5,
      attributes: { aP: { array: P, size: 3 }, aA: { array: A, size: 2 } },
      uniforms: { ...cellU, ...dnaU },
      decl: `${cellDecl}\nattribute vec3 aP; attribute vec2 aA; uniform float uDNA;`,
      body: /* glsl */ `
        pos = inside(aP, uSplit, aA.y);
        float shown = (aA.y > 0.0 ? step(0.02, uSplit) : 1.0) * step(aA.x, uDNA);
        float head = smoothstep(uDNA - 0.03, uDNA, aA.x) * step(uDNA, 0.999);
        col = mix(cColour, cAccent * 1.4, 0.3 + 0.5 * uGlow) + vec3(1.0) * head * 2.0;
        alpha = shown * (0.2 + 0.15 * uOn);`,
    });
    hero.add(dna.points);
  }

  // Flagella: the microbe's spread over its surface, the alga's two at its front.
  let flag: ReturnType<typeof glowPoints> | undefined;
  if (type === "microbe" || type === "algae") {
    const dirs: [number, number, number][] =
      type === "algae"
        ? [
            [0.9, 0.42, 0.1],
            [0.9, -0.42, -0.1],
          ]
        : Array.from({ length: 6 }, () => {
            const [x, y, z] = onSphere(rand);
            return [x * 1.5, y, z] as [number, number, number];
          });
    const per = ctx.detail < 0.5 ? 110 : 200;
    const F = new Float32Array(dirs.length * per * 4);
    dirs.forEach((d, k) => {
      const l = Math.hypot(...d);
      for (let i = 0; i < per; i++)
        F.set([d[0] / l, d[1] / l, d[2] / l, i / per], (k * per + i) * 4);
    });
    flag = glowPoints(ctx, bin, {
      count: 0,
      seed: 31,
      colour: type === "algae" ? "#d8ffe4" : "#bfefff",
      size: 0.03,
      maxPx: 4,
      attributes: { aF: { array: F, size: 4 } },
      uniforms: { ...cellU, uLen: { value: type === "algae" ? 2.0 : 2.8 } },
      decl: `${cellDecl}\nattribute vec4 aF; uniform float uLen;`,
      body: /* glsl */ `
        vec3 d = normalize(aF.xyz);
        float s = aF.w;
        vec3 base = cellPoint(d, uSplit, 0.0);
        vec3 t1 = normalize(cross(d, abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 t2 = cross(d, t1);
        float ph = s * 11.0 - uTime * 7.0 + dot(d, vec3(12.9, 78.2, 37.7));
        float amp = 0.16 * smoothstep(0.0, 0.25, s);
        pos = base + d * s * uLen + (t1 * sin(ph) + t2 * cos(ph)) * amp;
        alpha = 0.85 * (1.0 - s * 0.6);`,
    });
    hero.add(flag.points);
  }

  // The neuron's dendrites and axon, with spikes running out along it.
  let spikeU: { uRate: { value: number }; uTime: { value: number } } | undefined;
  if (type === "neuron") {
    const nr = neurites(T, 37);
    bin.add(nr.geometry);
    spikeU = { uRate: { value: 0 }, uTime: { value: 0 } };
    const mat = bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nattribute vec2 aDist; varying vec2 vD; varying vec3 vW; varying vec3 vN;\nvoid main(){ vD = aDist; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          ${LIGHT}
          uniform float uRate;
          uniform float uTime;
          uniform float uGlow;
          uniform vec3 cAccent;
          uniform vec3 cMem;
          varying vec2 vD;
          varying vec3 vW;
          varying vec3 vN;
          void main() {
            vec3 N = normalize(vN);
            vec3 V = normalize(cameraPosition - vW);
            vec3 base = vD.y > 1.5 ? vec3(0.85, 0.86, 0.9) : cMem * 0.55;
            vec3 c = lit(base, N, V, cMem * 0.5);
            // Action potentials: pulses leaving the cell body down the axon; smaller ones on the
            // dendrites, running in.
            float d = vD.y > 0.5 ? vD.x - uTime * 3.0 : -vD.x - uTime * 1.2;
            float w = fract(d / 2.6);
            float spike = smoothstep(0.0, 0.02, w) * (1.0 - smoothstep(0.02, 0.1, w));
            c += cAccent * spike * uRate * (vD.y > 0.5 ? 2.2 : 0.8) * (0.6 + uGlow);
            gl_FragColor = vec4(c, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: {
          ...spikeU,
          uGlow: { value: glow },
          cAccent: { value: accent },
          cMem: { value: lin(ctx, look.mem) },
        },
      }),
    );
    hero.add(new T.Mesh(nr.geometry, mat));
  }

  // --- The colony and the mat --------------------------------------------------------------------------
  const nCol = ctx.detail < 0.5 ? 96 : 220;
  const spots = colony(type, nCol, rand);
  const lg = Math.log2(nCol + 2);
  const dummy = new T.Object3D();
  const insts = spots.map((s, i) => {
    dummy.position.set(...s.p);
    dummy.rotation.set(s.tilt, s.yaw, 0);
    dummy.scale.setScalar(s.s);
    dummy.updateMatrix();
    // Doubling: each generation as many again as all before it.
    const born = (Math.log2(i + 2) - 1) / (lg - 1);
    return {
      m: dummy.matrix.clone(),
      born,
      phase: rand(),
      split: rand() < 0.12 ? 0.5 + rand() * 0.4 : 0,
    };
  });
  const col = makeMembrane(ctx, bin, accent, {
    shape,
    colour: look.mem,
    wobble: look.wob,
    half: look.half,
    fill: 0.06,
    bright: type === "microbe" || type === "neuron" ? 0.75 : 0.45,
    instances: insts,
    segments: [24, 16],
  });
  scene.add(col.mesh);
  // Each colony cell's heart: its nucleus, chloroplasts or chromosome, as a glow.
  const heart =
    type === "plant" || type === "algae" ? "#4fe07a" : type === "microbe" ? "#7ff6ff" : "#a68cff";
  const cp = new Float32Array(spots.length * 3);
  const cb = new Float32Array(spots.length);
  spots.forEach((s, i) => {
    cp.set(s.p, i * 3);
    cb[i] = (insts[i] as (typeof insts)[number]).born;
  });
  const hearts = glowPoints(ctx, bin, {
    count: 0,
    seed: 41,
    colour: heart,
    size: 0.9,
    maxPx: 18,
    attributes: { aP: { array: cp, size: 3 }, aB: { array: cb, size: 1 } },
    uniforms: { uGrow: { value: 0 }, uGlow: { value: glow }, cAccent: { value: accent } },
    decl: "attribute vec3 aP; attribute float aB; uniform float uGrow; uniform float uGlow; uniform vec3 cAccent;",
    body: /* glsl */ `
      pos = aP;
      alpha = smoothstep(aB, aB + 0.04, uGrow) * 0.5;
      col = mix(cColour, cAccent, 0.3 + 0.5 * uGlow);`,
  });
  scene.add(hearts.points);
  // Synapses between the network's neurons, signals running along them.
  let wires: THREE.LineSegments | undefined;
  const wireU = { uGrow: { value: 0 }, uTime: { value: 0 }, cColour: { value: accent } };
  if (type === "neuron") {
    const pos: number[] = [];
    const born: number[] = [];
    const along: number[] = [];
    const ends = [[0, 0, 0] as [number, number, number], ...spots.map((s) => s.p)];
    const bornOf = [0, ...insts.map((s) => s.born)];
    ends.forEach((p, i) => {
      const near = ends
        .map((q, j) => ({ j, d: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j, d } of near) {
        const q = ends[j] as [number, number, number];
        const b = Math.max(bornOf[i] as number, bornOf[j] as number);
        const steps = 8;
        for (let k = 0; k < steps; k++)
          for (const t of [k / steps, (k + 1) / steps]) {
            const sag = Math.sin(t * Math.PI) * d * 0.12;
            pos.push(
              p[0] + (q[0] - p[0]) * t,
              p[1] + (q[1] - p[1]) * t - sag,
              p[2] + (q[2] - p[2]) * t,
            );
            born.push(b);
            along.push(t * d);
          }
      }
    });
    const geo = bin.add(new T.BufferGeometry());
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aBorn", new T.Float32BufferAttribute(born, 1));
    geo.setAttribute("aAlong", new T.Float32BufferAttribute(along, 1));
    wires = new T.LineSegments(
      geo,
      bin.add(
        new T.ShaderMaterial({
          vertexShader: `${VERT_HEAD}\nattribute float aBorn; attribute float aAlong; varying float vB; varying float vA;\nvoid main(){ vB = aBorn; vA = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
          fragmentShader: `${FRAG_HEAD}\nuniform float uGrow; uniform float uTime; uniform vec3 cColour; varying float vB; varying float vA;\nvoid main(){ float on = smoothstep(vB, vB + 0.05, uGrow); float pulse = pow(max(0.5 + 0.5 * sin((vA * 0.5 - uTime * 1.5) * 6.2832), 0.0), 10.0); gl_FragColor = vec4(cColour * (0.12 + 1.3 * pulse) * on, 1.0); ${FRAG_TAIL} }`,
          uniforms: wireU,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      ),
    );
    wires.frustumCulled = false;
    scene.add(wires);
  }
  // The mat: a living surface spreading from the colony, cells packed edge to edge (a biofilm, a
  // leaf with its veins, a sheet of tissue, a bloom swirling in the water, a cortex of firing cells).
  const matR = type === "neuron" ? 160 : 190;
  const colR = Math.max(...spots.map((s) => Math.hypot(...s.p)));
  const matU = {
    uMat: { value: 0 },
    uR: { value: matR },
    // Flat colonies sit on the mat; a ball or a slab of cells sits in a hole in it.
    uHole: { value: type === "algae" || type === "neuron" ? colR * 1.05 : 0 },
    uFront: { value: 0 },
    uTime: { value: 0 },
    uGlow: { value: glow },
    uFog: { value: 400 },
    cHeart: { value: lin(ctx, heart) },
    cAccent: { value: accent },
    cFog: { value: lin(ctx, "#03090c") },
  };
  const matGeo = bin.add(
    new T.RingGeometry(Math.max(0.01, matU.uHole.value * 0.75), matR * 1.25, 160, 24),
  );
  matGeo.rotateX(-Math.PI / 2);
  const matMesh = new T.Mesh(
    matGeo,
    bin.add(
      new T.ShaderMaterial({
        defines: { CELL: shape },
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW;\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: MAT_FRAG,
        uniforms: matU,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  matMesh.position.y =
    type === "microbe" ? -0.55 : type === "plant" ? -1.1 : type === "animal" ? -1.2 : 0;
  matMesh.renderOrder = -1;
  scene.add(matMesh);
  // Glints over it: single cells catching the light, or, in a cortex, firing.
  const mat = glowPoints(ctx, bin, {
    count: 4000,
    seed: 43,
    colour: heart,
    size: 1.2,
    maxPx: 5,
    uniforms: {
      uMat: matU.uMat,
      uR: { value: matR },
      uR0: { value: Math.max(colR, matU.uHole.value) },
      uY: { value: matMesh.position.y + 0.3 },
      uGlow: { value: glow },
      cAccent: { value: accent },
    },
    decl: "uniform float uMat; uniform float uR; uniform float uR0; uniform float uY; uniform float uGlow; uniform vec3 cAccent;",
    body: /* glsl */ `
      float r = mix(uR0, uR, sqrt(aSeed.x));
      float a = aSeed.y * 6.2832;
      pos = vec3(cos(a) * r, uY, sin(a) * r);
      float front = mix(uR0, uR, uMat);
      float on = smoothstep(front, front - 6.0, r);
      float tw = pow(max(sin(uTime * (1.0 + 2.0 * aSeed2.x) + aSeed2.y * 50.0), 0.0), 8.0);
      col = mix(cColour, cAccent, 0.3 + 0.5 * uGlow * aSeed2.z);
      alpha = on * tw * (0.3 + 0.4 * aSeed2.w);`,
  });
  scene.add(mat.points);

  // Motes drifting in the water.
  const motes = glowPoints(ctx, bin, {
    count: 700,
    seed: 47,
    colour: "#9fd8e8",
    size: 0.025,
    maxPx: 3,
    uniforms: { uSpan: { value: 9 } },
    decl: "uniform float uSpan;",
    body: /* glsl */ `
      vec3 p = (aSeed.xyz - 0.5) * uSpan * 2.0;
      p += vec3(sin(uTime * 0.2 + aSeed2.x * 9.0), cos(uTime * 0.17 + aSeed2.y * 9.0), sin(uTime * 0.13 + aSeed2.z * 9.0)) * 0.4;
      pos = p;
      alpha = 0.25 * aSeed2.w;`,
  });
  scene.add(motes.points);

  // --- The camera --------------------------------------------------------------------------------------
  const neuron = type === "neuron";
  const c0: [number, number, number] = neuron ? [-2.2, -0.2, 0] : [0, 0, 0];
  const d0 = neuron ? 8.5 : type === "plant" ? 5 : 4.6;
  const shots: Shot[] = [
    { at: 0, d: d0, target: c0, az: 1.25, el: 0.3 },
    { at: 0.28, d: d0 * 0.9, target: c0, az: 1.55, el: 0.25 },
    {
      at: 0.5,
      d: d0 * (type === "plant" ? 2.1 : divides ? 1.5 : 1.3),
      target: [0, 0, 0],
      az: 1.85,
      el: 0.62,
    },
    { at: 0.8, d: colR * 2.1, target: [0, 0, 0], az: 2.1, el: 0.6 },
    { at: 1, d: matR * 1.35, target: [0, 0, 0], az: 2.35, el: 0.62 },
  ];
  const pose = flight(T, shots);
  const beats = storyBeats(ctx);
  const px = new T.Vector2();

  return {
    view: pose(0),
    beats,
    pose,
    update(time, _dt, p) {
      const pixels = pixelScale(ctx, px);
      const camD = camera.position.length();
      (back.uniforms.uTime as { value: number }).value = time;
      const on = ramp(p, 0.04, 0.3);
      // Neurons do not divide; for them, dividing means new neurons are made around them sooner.
      const split = divides && !neuron ? ramp(p, 0.26, 0.48) : 0;
      plate.visible = split > 0;
      plate.scale.set(1, 0.9 * Math.min(1, split * 1.15), 0.9 * Math.min(1, split * 1.15));
      plateMat.opacity = 0.12 + 0.2 * glow;
      rimMat.opacity = split < 1 ? 0.6 + 0.4 * glow : 0;
      for (const s of skins) {
        s.uniforms.uTime.value = time;
        s.uniforms.uSplit.value = split;
        s.uniforms.uGlow.value = glow * on;
        s.uniforms.uHalf.value = look.half * (1 + 0.7 * ramp(p, 0.46, 0.62));
      }
      org.uniforms.uTime.value = time;
      org.uniforms.uSplit.value = split;
      org.uniforms.uGlow.value = glow;
      org.uniforms.uOn.value = on;
      cellU.uOn.value = on;
      // The chromosome is pieced together first; the rest of the story runs on a whole one.
      dnaU.uDNA.value = 0.35 + 0.65 * ramp(p, 0, 0.22);
      for (const pts of [ribo, dna, flag, motes]) pts?.update(time, p, pixels);
      if (spikeU) {
        spikeU.uTime.value = time;
        spikeU.uRate.value = 0.25 + 0.75 * on;
      }
      // The colony doubles around the first cell, then the mat spreads beyond it.
      const grow = !divides
        ? ramp(p, 0.36, 0.8)
        : neuron
          ? ramp(p, 0.22, 0.7)
          : ramp(p, 0.44, 0.82);
      col.uniforms.uGrow.value = grow;
      col.uniforms.uTime.value = time;
      col.uniforms.uGlow.value = glow * on * 0.5;
      col.uniforms.uFog.value = camD * 3;
      (hearts.uniforms.uGrow as { value: number }).value = grow;
      hearts.update(time, p, pixels);
      wireU.uGrow.value = grow;
      wireU.uTime.value = time;
      matU.uMat.value = ramp(p, 0.7, 1);
      // The mat's edge: under the colony as it grows, if the colony is flat, then out to the rim.
      const start = matU.uHole.value ? matU.uHole.value : colR * grow;
      matU.uFront.value = start + (matR - start) * matU.uMat.value;
      matU.uTime.value = time;
      matU.uFog.value = camD * 1.6;
      mat.update(time, p, pixels);
      // Far off, the first cell's fine parts are too small to draw.
      hero.visible = camD < 120;
      mem.uniforms.uFog.value = 1e6;
    },
    dispose() {
      bin.dispose();
    },
  };
};

export default cell;
