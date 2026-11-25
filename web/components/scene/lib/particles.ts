/**
 * Many small things moving at once, drawn by the GPU: craft on circular orbits (stations,
 * collectors, the swarm) and streams of mass between two places (a mass driver, a mine's output).
 * Each point has its own threshold, so a share of them appears as a uniform rises: the swarm
 * fills in as it is built rather than fading in as a whole.
 */
import type * as THREE from "three";
import type { KindContext } from "../types.ts";
import { glowTexture, lin } from "./bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "./glsl.ts";

/** A seeded random stream, so every reader sees the same swarm. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const ORBIT_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec4 aOrbit;   // radius, inclination, node, phase
attribute vec2 aBorn;    // threshold (0..1) to appear, brightness jitter
uniform float uTime;
uniform float uBuilt;
uniform float uSpeed;
uniform float uSize;
uniform float uPixel;
uniform float uRef;      // radius at which uSpeed is the angular speed
varying float vAlpha;
varying float vGlint;
void main() {
  float r = aOrbit.x;
  float w = uSpeed * pow(max(uRef / r, 1e-6), 1.5);
  float th = aOrbit.w + uTime * w;
  vec3 p = vec3(cos(th) * r, 0.0, sin(th) * r);
  float ci = cos(aOrbit.y), si = sin(aOrbit.y);
  p = vec3(p.x, p.z * si, p.z * ci);
  float cn = cos(aOrbit.z), sn = sin(aOrbit.z);
  p = vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(aBorn.x, aBorn.x + 0.02, uBuilt);
  // A point smaller than a pixel is drawn at the minimum size, so it gives only its share of light:
  // thousands of far orbiters then glow faintly instead of piling into a white blot.
  float px = uPixel * uSize / max(-mv.z, 1e-6);
  vAlpha = on * clamp(px / 1.2, 0.0, 1.0);
  // A collector flashes as it turns its face to the viewer.
  vGlint = 0.55 + 0.45 * pow(max(0.5 + 0.5 * sin(th * 3.0 + aBorn.y * 40.0 + uTime * 0.7), 0.0), 6.0) * aBorn.y;
  // The clamp is on the size in pixels: far points stay visible, near ones stay points.
  gl_PointSize = clamp(px, 1.2, 6.0) * on;
  ${VERT_TAIL}
}`;

const POINT_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uDot;
uniform vec3 cColour;
uniform float uGain;
varying float vAlpha;
varying float vGlint;
void main() {
  float a = texture2D(uDot, gl_PointCoord).r * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(cColour * vGlint * uGain * a, a);
  ${FRAG_TAIL}
}`;

export interface Orbiters {
  points: THREE.Points;
  built: { value: number };
  gain: { value: number };
  update(time: number, pixelRatio: number, height: number): void;
  dispose(): void;
}

export interface OrbitOptions {
  count: number;
  rMin: number;
  rMax: number;
  /** Largest inclination, radians. 0 is a flat ring; PI/2 a full shell. */
  tilt: number;
  colour: string;
  /** Apparent size in scene units at distance 1, before the pixel clamp. */
  size: number;
  /** Angular speed at radius ref, radians a second. */
  speed: number;
  ref: number;
  seed: number;
  gain?: number;
  /** Bunch radii toward rMin: 1 even, higher packs them inward. */
  bias?: number;
}

export function makeOrbiters(ctx: KindContext, o: OrbitOptions): Orbiters {
  const T = ctx.three;
  const n = Math.max(1, Math.round(o.count * ctx.detail));
  const orbit = new Float32Array(n * 4);
  const born = new Float32Array(n * 2);
  const r = rng(o.seed);
  for (let i = 0; i < n; i++) {
    const u = r() ** (o.bias ?? 1);
    orbit[i * 4] = o.rMin + (o.rMax - o.rMin) * u;
    orbit[i * 4 + 1] = (r() * 2 - 1) * o.tilt;
    orbit[i * 4 + 2] = r() * Math.PI * 2;
    orbit[i * 4 + 3] = r() * Math.PI * 2;
    born[i * 2] = r() * 0.98;
    born[i * 2 + 1] = r();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aOrbit", new T.BufferAttribute(orbit, 4));
  geo.setAttribute("aBorn", new T.BufferAttribute(born, 2));
  geo.boundingSphere = new T.Sphere(new T.Vector3(), o.rMax * 1.1);
  const uniforms = {
    uTime: { value: 0 },
    uBuilt: { value: 0 },
    uSpeed: { value: o.speed },
    uRef: { value: o.ref },
    uSize: { value: o.size },
    uPixel: { value: 1 },
    uDot: { value: glowTexture(ctx) },
    cColour: { value: lin(ctx, o.colour, 1) },
    uGain: { value: o.gain ?? 1 },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: ORBIT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    built: uniforms.uBuilt,
    gain: uniforms.uGain,
    update(time, pixelRatio, height) {
      uniforms.uTime.value = time;
      uniforms.uPixel.value = pixelRatio * height * 0.5;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const STREAM_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aSeed;     // phase, sideways offset, vertical offset
uniform float uTime;
uniform float uRate;
uniform float uOn;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform vec3 uBend;       // the path bows toward uFrom + uTo / 2 + uBend
uniform float uWidth;
uniform float uSize;
uniform float uPixel;
varying float vAlpha;
varying float vGlint;
void main() {
  float s = fract(aSeed.x + uTime * uRate);
  vec3 mid = (uFrom + uTo) * 0.5 + uBend;
  vec3 p = mix(mix(uFrom, mid, s), mix(mid, uTo, s), s);
  vec3 dir = normalize(uTo - uFrom + 1e-6);
  vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + 1e-6);
  float spread = uWidth * sin(3.14159265 * s);
  p += side * aSeed.y * spread + vec3(0.0, aSeed.z * spread, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = uPixel * uSize / max(-mv.z, 1e-6);
  vAlpha = uOn * smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.9, 1.0, s)) * clamp(px, 0.0, 1.0);
  vGlint = 1.0;
  gl_PointSize = clamp(px, 1.0, 3.0);
  ${VERT_TAIL}
}`;

export interface Stream {
  points: THREE.Points;
  uniforms: {
    uOn: { value: number };
    uFrom: { value: THREE.Vector3 };
    uTo: { value: THREE.Vector3 };
    uBend: { value: THREE.Vector3 };
  };
  update(time: number, pixelRatio: number, height: number): void;
  dispose(): void;
}

export function makeStream(
  ctx: KindContext,
  o: { count: number; colour: string; size: number; rate: number; width: number; seed: number },
): Stream {
  const T = ctx.three;
  const n = Math.max(1, Math.round(o.count * ctx.detail));
  const seed = new Float32Array(n * 3);
  const r = rng(o.seed);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = r();
    seed[i * 3 + 1] = r() * 2 - 1;
    seed[i * 3 + 2] = (r() * 2 - 1) * 0.5;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aSeed", new T.BufferAttribute(seed, 3));
  const uniforms = {
    uTime: { value: 0 },
    uRate: { value: o.rate },
    uOn: { value: 0 },
    uFrom: { value: new T.Vector3() },
    uTo: { value: new T.Vector3(1, 0, 0) },
    uBend: { value: new T.Vector3() },
    uWidth: { value: o.width },
    uSize: { value: o.size },
    uPixel: { value: 1 },
    uDot: { value: glowTexture(ctx) },
    cColour: { value: lin(ctx, o.colour, 1) },
    uGain: { value: 1.2 },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: STREAM_VERT,
    fragmentShader: POINT_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    uniforms,
    update(time, pixelRatio, height) {
      uniforms.uTime.value = time;
      uniforms.uPixel.value = pixelRatio * height * 0.5;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** A circle in the XZ plane, as a faint line: an orbit. */
export function makeRing(
  ctx: KindContext,
  radius: number,
  colour: string,
  opacity: number,
): {
  line: THREE.LineLoop;
  material: THREE.ShaderMaterial;
  opacity: { value: number };
  dispose(): void;
} {
  const T = ctx.three;
  const n = 256;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * radius;
    pos[i * 3 + 2] = Math.sin(a) * radius;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const uOpacity = { value: opacity };
  const material = new T.ShaderMaterial({
    vertexShader: `${VERT_HEAD}\nvoid main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
    fragmentShader: `${FRAG_HEAD}\nuniform vec3 cColour; uniform float uOpacity; void main(){ gl_FragColor = vec4(cColour * uOpacity, uOpacity); ${FRAG_TAIL} }`,
    uniforms: { cColour: { value: lin(ctx, colour) }, uOpacity },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const line = new T.LineLoop(geo, material);
  return {
    line,
    material,
    opacity: uOpacity,
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
