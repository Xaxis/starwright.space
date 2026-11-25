/**
 * Living cells for the cell kind: a membrane that can wobble and pinch in two, organelles that
 * stream round inside it, ribosomes, a chromosome, flagella, and a neuron's branching neurites.
 * Every moving part is placed on the GPU from a shared description of the cell's shape, so the
 * membrane, what is inside it and what sticks out of it divide together.
 *
 * Shapes, about 2.5 across: 0 a rod-shaped microbe, 1 a boxy plant cell, 2 a soft animal cell,
 * 3 an egg-shaped alga, 4 a neuron's body.
 */
import type * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { KindContext } from "../../types.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Bin, LIGHT, lin, onSphere, rng } from "./common.ts";

export type CellType = "microbe" | "plant" | "animal" | "algae" | "neuron";
export const SHAPE: Record<CellType, number> = {
  microbe: 0,
  plant: 1,
  animal: 2,
  algae: 3,
  neuron: 4,
};

/** The shape and its division, in GLSL; CELL is defined as the shape number. Needs uTime, uHalf
 * (how far each daughter moves from the middle) and uWob declared, and NOISE. */
export const CELL_FUNCS = /* glsl */ `
vec3 baseShape(vec3 n) {
#if CELL == 0
  return vec3(n.x * 0.46 + 0.8 * clamp(n.x * 6.0, -1.0, 1.0), n.y * 0.46, n.z * 0.46);
#elif CELL == 1
  return sign(n) * pow(max(abs(n), vec3(1e-4)), vec3(0.4)) * vec3(1.45, 0.92, 0.92);
#elif CELL == 2
  return n * 1.05;
#elif CELL == 3
  return n * vec3(0.95, 0.8, 0.8) * vec3(1.0, 1.0 - 0.12 * n.x, 1.0 - 0.12 * n.x);
#else
  return n * 0.55;
#endif
}
/** A point of the cell for a direction from its centre, wobbling, pinched in two by split. */
vec3 cellPoint(vec3 n, float split, float phase) {
  vec3 b = baseShape(n) * (1.0 + uWob * (vnoise(n * 2.2 + uTime * 0.25 + phase * 9.0) - 0.5));
#if CELL == 1
  // A walled cell does not pinch: a new wall grows across its middle instead.
  return b;
#else
  float sg = clamp(n.x * 7.0, -1.0, 1.0);
  vec3 p = b;
  p.x = b.x * mix(1.0, 0.6, split) + sg * split * uHalf;
  p.yz = b.yz * mix(1.0, sqrt(abs(sg)), split) * mix(1.0, 0.86, split);
  return p;
#endif
}
/** Where something inside the cell goes as it divides: toward the half it is in, or its side. */
vec3 inside(vec3 c, float split, float side) {
  float sg = side != 0.0 ? side : clamp(c.x * 40.0, -1.0, 1.0);
#if CELL == 1
  return vec3(c.x * mix(1.0, 0.7, split) + sg * split * uHalf * 0.45, c.yz);
#else
  return vec3(c.x * mix(1.0, 0.6, split) + sg * split * uHalf, c.yz * mix(1.0, 0.9, split));
#endif
}
`;

export const CELL = /* glsl */ `
uniform float uTime;
uniform float uHalf;
uniform float uWob;
${CELL_FUNCS}
`;

/** The same base shapes on the CPU, for placing organelles. */
export function baseShape(shape: number, n: [number, number, number]): [number, number, number] {
  const [x, y, z] = n;
  const sgn = (v: number) => (v < 0 ? -1 : 1);
  switch (shape) {
    case 0:
      return [x * 0.46 + 0.8 * Math.max(-1, Math.min(1, x * 6)), y * 0.46, z * 0.46];
    case 1:
      return [
        sgn(x) * Math.abs(x) ** 0.4 * 1.45,
        sgn(y) * Math.abs(y) ** 0.4 * 0.92,
        sgn(z) * Math.abs(z) ** 0.4 * 0.92,
      ];
    case 2:
      return [x * 1.05, y * 1.05, z * 1.05];
    case 3:
      return [x * 0.95, y * 0.8 * (1 - 0.12 * x), z * 0.8 * (1 - 0.12 * x)];
    default:
      return [x * 0.55, y * 0.55, z * 0.55];
  }
}

/** A point inside the cell, depth 0 (centre) to 1 (membrane). */
export function interior(
  shape: number,
  r: () => number,
  d0: number,
  d1: number,
): [number, number, number] {
  const n = onSphere(r);
  const b = baseShape(shape, n);
  const k = d0 + (d1 - d0) * Math.cbrt(r());
  return [b[0] * k, b[1] * k, b[2] * k];
}

const MEMBRANE_VERT = /* glsl */ `
${VERT_HEAD}
${NOISE}
${CELL}
uniform float uSplit;
uniform float uGrow;
uniform vec3 uScale;
#ifdef USE_INSTANCING
attribute vec4 aCell;
#endif
varying vec3 vW;
varying vec3 vN;
varying float vOn;
void main() {
  float split = uSplit;
  float phase = 0.0;
  float on = 1.0;
  #ifdef USE_INSTANCING
  // A colony: each cell appears as the colony grows past its birth, some caught mid-division.
  phase = aCell.y;
  split = aCell.z;
  on = smoothstep(aCell.x, aCell.x + 0.04, uGrow);
  #endif
  vec3 n = normalize(position);
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  vec3 p = cellPoint(n, split, phase) * uScale;
  vec3 pa = cellPoint(normalize(n + t1 * 0.02), split, phase) * uScale;
  vec3 pb = cellPoint(normalize(n + t2 * 0.02), split, phase) * uScale;
  vec3 N = normalize(cross(pa - p, pb - p));
  if (dot(N, n) < 0.0) N = -N;
  #ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
  p *= on;
  #else
  mat4 m = modelMatrix;
  #endif
  vec4 w = m * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * N);
  vOn = on;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const MEMBRANE_FRAG = /* glsl */ `
${FRAG_HEAD}
${NOISE}
uniform vec3 cMem;
uniform vec3 cAccent;
uniform float uGlow;
uniform float uFill;
uniform float uBright;
uniform float uFog;
uniform float uTime;
varying vec3 vW;
varying vec3 vN;
varying float vOn;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float mu = abs(dot(normalize(vN), V));
  float rim = pow(clamp(1.0 - mu, 0.0, 1.0), 2.6);
  // The membrane's lipids catch the light in patches that drift.
  float patchy = 0.75 + 0.5 * vnoise(vW * 6.0 + uTime * 0.2);
  vec3 c = (cMem * (uFill + 0.85 * rim * patchy) + cAccent * uGlow * (0.05 + 0.3 * rim)) * uBright;
  float d = length(cameraPosition - vW);
  c *= exp(-d / uFog) * vOn;
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export interface MembraneOptions {
  shape: number;
  colour: string;
  scale?: [number, number, number];
  fill?: number;
  /** Scales the whole skin's light, for crowds of cells overlapping. */
  bright?: number;
  wobble: number;
  half: number;
  /** Instances for a colony: each with its birth, phase, split and size. */
  instances?: { m: THREE.Matrix4; born: number; phase: number; split: number }[];
  segments?: [number, number];
}

export interface Membrane {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uSplit: { value: number };
    uGrow: { value: number };
    uHalf: { value: number };
    uGlow: { value: number };
    uFog: { value: number };
  };
}

/** A cell's membrane (or a colony of them): a glassy skin, bright where it turns from the eye. */
export function makeMembrane(
  ctx: KindContext,
  bin: Bin,
  accent: THREE.Color,
  o: MembraneOptions,
): Membrane {
  const T = ctx.three;
  const [ws, hs] = o.segments ?? (ctx.detail < 0.5 ? [48, 32] : [72, 48]);
  const geo = bin.add(new T.SphereGeometry(1, ws, hs));
  const uniforms = {
    uTime: { value: 0 },
    uSplit: { value: 0 },
    uGrow: { value: 0 },
    uHalf: { value: o.half },
    uWob: { value: o.wobble },
    uScale: { value: new T.Vector3(...(o.scale ?? [1, 1, 1])) },
    cMem: { value: lin(ctx, o.colour) },
    cAccent: { value: accent },
    uGlow: { value: 0 },
    uFill: { value: o.fill ?? 0.05 },
    uBright: { value: o.bright ?? 1 },
    uFog: { value: 1e6 },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: MEMBRANE_VERT,
      fragmentShader: MEMBRANE_FRAG,
      defines: { CELL: o.shape },
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  let mesh: THREE.Mesh;
  if (o.instances) {
    const list = o.instances;
    const im = bin.add(new T.InstancedMesh(geo, mat, list.length));
    const attr = new Float32Array(list.length * 4);
    list.forEach((s, i) => {
      im.setMatrixAt(i, s.m);
      attr.set([s.born, s.phase, s.split, 1], i * 4);
    });
    geo.setAttribute("aCell", new T.InstancedBufferAttribute(attr, 4));
    mesh = im;
  } else mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** Organelle kinds: their colours, in this order. */
export const PALETTE = [
  "#8f74ff", // 0 nucleus
  "#d2b8ff", // 1 nucleolus
  "#ff8a4c", // 2 mitochondrion
  "#3fcf6a", // 3 chloroplast
  "#ffd66b", // 4 vesicle
  "#dfe4f0", // 5 granule
  "#6fb4ff", // 6 vacuole
  "#9bf0ff", // 7 pyrenoid or carboxysome
  "#ff4a2a", // 8 eyespot
  "#ffb0d0", // 9 Golgi
];

export interface Organelle {
  kind: number;
  centre: [number, number, number];
  scale: [number, number, number];
  /** Rotation as a quaternion. */
  q: [number, number, number, number];
  /** When it lights as the cell's new genes switch on, 0 to 1. */
  born: number;
  /** -1 or 1 for a copy that goes to that daughter; 0 to go with the half it is in. */
  side: number;
}

const ORG_VERT = /* glsl */ `
${VERT_HEAD}
${NOISE}
${CELL}
attribute vec3 aC;
attribute vec3 aS;
attribute vec4 aQ;
attribute vec4 aK;
uniform float uSplit;
uniform float uStream;
uniform vec3 uExtent;
varying vec3 vW;
varying vec3 vN;
varying vec3 vLoc;
varying float vKind;
varying float vBorn;
vec3 rot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
void main() {
  // Cytoplasm streams: everything drifts round the cell on an ellipse that fits its shape.
  vec3 c = aC / uExtent;
  float a = uTime * uStream * (0.6 + 0.8 * fract(aK.z * 7.3));
  float ca = cos(a);
  float sa = sin(a);
  c = vec3(c.x * ca - c.z * sa, c.y, c.x * sa + c.z * ca) * uExtent;
  c += 0.02 * sin(uTime * 2.7 + aK.z * 40.0 + vec3(0.0, 2.1, 4.2));
  float show = aK.w > 0.5 ? step(0.02, uSplit) : 1.0;
  c = inside(c, uSplit, aK.w);
  vec3 loc = position * aS;
  vec3 p = c + rot(aQ, loc) * show;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * rot(aQ, normal / aS));
  vLoc = position;
  vKind = aK.x;
  vBorn = aK.y;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const ORG_FRAG = /* glsl */ `
${FRAG_HEAD}
${NOISE}
${LIGHT}
uniform vec3 cPal[10];
uniform vec3 cAccent;
uniform float uGlow;
uniform float uOn;
uniform float uTime;
varying vec3 vW;
varying vec3 vN;
varying vec3 vLoc;
varying float vKind;
varying float vBorn;
void main() {
  int k = int(vKind + 0.5);
  vec3 base = cPal[k];
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float emit = 0.12;
  if (k == 2) base *= 0.65 + 0.45 * step(0.0, sin(vLoc.x * 22.0)); // cristae
  if (k == 3) base *= 0.6 + 0.5 * step(0.3, sin(vLoc.y * 18.0 + vLoc.x * 2.0)); // grana
  if (k == 0) base *= 0.7 + 0.5 * vnoise(vLoc * 7.0 + uTime * 0.1); // chromatin
  if (k == 8 || k == 7) emit = 0.6;
  vec3 c = lit(base, N, V, base * 0.6) + base * emit;
  // Designed genes switching on, one pathway after another: the parts that carry them glow.
  float on = smoothstep(vBorn, vBorn + 0.08, uOn);
  c += cAccent * on * uGlow * (0.35 + 0.5 * pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.0));
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export interface Organelles {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uSplit: { value: number };
    uGlow: { value: number };
    uOn: { value: number };
  };
}

export function makeOrganelles(
  ctx: KindContext,
  bin: Bin,
  accent: THREE.Color,
  shape: number,
  list: Organelle[],
  o: { half: { value: number }; stream: number; extent: [number, number, number] },
): Organelles {
  const T = ctx.three;
  const ball = bin.add(new T.IcosahedronGeometry(1, ctx.detail < 0.5 ? 2 : 3));
  const geo = bin.add(new T.InstancedBufferGeometry());
  geo.index = ball.index;
  geo.setAttribute("position", ball.getAttribute("position"));
  geo.setAttribute("normal", ball.getAttribute("normal"));
  const n = list.length;
  const C = new Float32Array(n * 3);
  const S = new Float32Array(n * 3);
  const Q = new Float32Array(n * 4);
  const K = new Float32Array(n * 4);
  list.forEach((g, i) => {
    C.set(g.centre, i * 3);
    S.set(g.scale, i * 3);
    Q.set(g.q, i * 4);
    K.set([g.kind, g.born, (i * 0.618) % 1, g.side], i * 4);
  });
  geo.setAttribute("aC", new T.InstancedBufferAttribute(C, 3));
  geo.setAttribute("aS", new T.InstancedBufferAttribute(S, 3));
  geo.setAttribute("aQ", new T.InstancedBufferAttribute(Q, 4));
  geo.setAttribute("aK", new T.InstancedBufferAttribute(K, 4));
  geo.instanceCount = n;
  const uniforms = {
    uTime: { value: 0 },
    uSplit: { value: 0 },
    uHalf: o.half,
    uWob: { value: 0 },
    uStream: { value: o.stream },
    uExtent: { value: new T.Vector3(...o.extent) },
    cPal: { value: PALETTE.map((c) => lin(ctx, c)) },
    cAccent: { value: accent },
    uGlow: { value: 0 },
    uOn: { value: 0 },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: ORG_VERT,
      fragmentShader: ORG_FRAG,
      defines: { CELL: shape },
      uniforms,
    }),
  );
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** A random rotation, as a quaternion. */
export function randomQ(r: () => number): [number, number, number, number] {
  const u1 = r();
  const u2 = r() * Math.PI * 2;
  const u3 = r() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/** A neuron's dendrites and axon as tubes, each vertex knowing its distance from the cell body. */
export function neurites(
  T: typeof THREE,
  seed: number,
): { geometry: THREE.BufferGeometry; axonEnd: THREE.Vector3; terminals: THREE.Vector3[] } {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const terminals: THREE.Vector3[] = [];
  const tube = (pts: THREE.Vector3[], r0: number, r1: number, d0: number, axon: number) => {
    const curve = new T.CatmullRomCurve3(pts);
    const len = curve.getLength();
    const segs = Math.max(6, Math.round(len * 14));
    const g = new T.TubeGeometry(curve, segs, 1, 6, false);
    // Taper: scale each ring toward its far end.
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    const dist = new Float32Array(pos.count * 2);
    const centre = new T.Vector3();
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      curve.getPointAt(Math.min(1, t), centre);
      v.fromBufferAttribute(pos, i)
        .sub(centre)
        .multiplyScalar(r0 + (r1 - r0) * t);
      pos.setXYZ(i, centre.x + v.x, centre.y + v.y, centre.z + v.z);
      dist[i * 2] = d0 + t * len;
      dist[i * 2 + 1] = axon;
    }
    g.setAttribute("aDist", new T.BufferAttribute(dist, 2));
    g.deleteAttribute("uv");
    g.computeVertexNormals();
    parts.push(g);
    return len;
  };
  const grow = (
    from: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    rad: number,
    d0: number,
    depth: number,
  ) => {
    const pts = [from.clone()];
    const p = from.clone();
    const d = dir.clone();
    for (let i = 0; i < 4; i++) {
      const [a, b, c] = onSphere(r);
      d.add(new T.Vector3(a, b, c).multiplyScalar(0.35)).normalize();
      p.addScaledVector(d, len / 4);
      pts.push(p.clone());
    }
    const l = tube(pts, rad, rad * 0.55, d0, 0);
    if (depth > 0)
      for (let k = 0; k < 2; k++) {
        const [a, b, c] = onSphere(r);
        const nd = d
          .clone()
          .add(new T.Vector3(a, b, c).multiplyScalar(0.7))
          .normalize();
        grow(p, nd, len * 0.65, rad * 0.55, d0 + l, depth - 1);
      }
  };
  // Dendrites: from the body's far side, branching twice.
  for (let k = 0; k < 6; k++) {
    const [a, b, c] = onSphere(r);
    const dir = new T.Vector3(Math.abs(a) * 0.6 + 0.4, b, c).normalize();
    grow(dir.clone().multiplyScalar(0.5), dir, 1.2 + r() * 0.5, 0.07, 0, 2);
  }
  // The axon: a long, gently curving line to the left, ending in a spray of terminals.
  const axon: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    axon.push(
      new T.Vector3(-0.5 - t * 7, Math.sin(t * 3) * 0.4 - t * 0.6, Math.sin(t * 2 + 1) * 0.5),
    );
  }
  const axLen = tube(axon, 0.05, 0.04, 0, 1);
  // Myelin wraps the axon in sheaths, with bare nodes between them where the signal jumps.
  const axCurve = new T.CatmullRomCurve3(axon);
  for (let k = 0; k < 8; k++) {
    const t0 = 0.05 + k * 0.115;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) pts.push(axCurve.getPointAt(Math.min(1, t0 + (i / 5) * 0.095)));
    tube(pts, 0.095, 0.095, t0 * axLen, 2);
  }
  const end = axon[axon.length - 1] as THREE.Vector3;
  for (let k = 0; k < 5; k++) {
    const [a, b, c] = onSphere(r);
    const dir = new T.Vector3(-1, b * 0.8, c * 0.8)
      .add(new T.Vector3(a, 0, 0).multiplyScalar(0.3))
      .normalize();
    const pts = [end.clone()];
    const p = end.clone();
    for (let i = 0; i < 3; i++) {
      p.addScaledVector(dir, 0.25);
      dir.add(new T.Vector3(...onSphere(r)).multiplyScalar(0.3)).normalize();
      pts.push(p.clone());
    }
    tube(pts, 0.03, 0.02, axLen, 1);
    terminals.push(p.clone());
  }
  const geometry = mergeGeometries(parts) as THREE.BufferGeometry;
  for (const g of parts) g.dispose();
  return { geometry, axonEnd: end.clone(), terminals };
}
