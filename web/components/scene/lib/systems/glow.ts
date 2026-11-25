/**
 * Light the systems scenes are made of, drawn by the GPU: points that switch on as a clock passes
 * them (a field's status lights, a network's nodes), particles flowing along arcs (parts on their
 * way to a new copy, packets on a link) and lines whose pulses run along them (links, beams,
 * lineage). Each point keeps a minimum size in pixels, so a light a metre across still glows from
 * a kilometre up, and each is additive, so the bloom pass turns crowds of them into a haze.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { glowTexture } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import type { GrowClock } from "./grow.ts";

const DOT_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uDot;
varying vec3 vColour;
varying float vAlpha;
void main() {
  float a = texture2D(uDot, gl_PointCoord).r * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColour * a, a);
  ${FRAG_TAIL}
}`;

const LIGHTS_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec2 aGrow;
attribute vec3 aColour;
attribute float aSeed;
uniform float uBuilt;
uniform float uTime;
uniform float uSize;
uniform float uPixel;
uniform float uMin;
uniform float uMax;
uniform float uTwinkle;
uniform float uGain;
varying vec3 vColour;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(aGrow.x + aGrow.y * 0.6, aGrow.x + aGrow.y * 1.4 + 1e-4, uBuilt);
  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 2.5) + aSeed * 61.0));
  vAlpha = on;
  vColour = aColour * tw * uGain;
  gl_PointSize = clamp(uPixel * uSize / max(-mv.z, 1e-6), uMin, uMax) * step(0.001, on);
  ${VERT_TAIL}
}`;

export interface Glows {
  points: THREE.Points;
  uniforms: {
    uGain: { value: number };
    uSize: { value: number };
    uMin: { value: number };
    uMax: { value: number };
  };
  /** Pixel scale for sizes: call each frame with the canvas height in device pixels. */
  update(pixelHeight: number): void;
  dispose(): void;
}

export interface GlowOptions {
  /** x, y, z per point. */
  position: Float32Array;
  /** start, length per point, on the clock. */
  grow: Float32Array;
  /** r, g, b per point (linear, may exceed 1), or one colour for all. */
  colour: Float32Array | THREE.Color;
  /** Size in scene units at distance 1, and the pixel clamp. */
  size: number;
  min?: number;
  max?: number;
  twinkle?: number;
  gain?: number;
}

export function makeGlows(ctx: KindContext, clock: GrowClock, o: GlowOptions): Glows {
  const T = ctx.three;
  const n = Math.floor(o.position.length / 3);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(o.position, 3));
  geo.setAttribute("aGrow", new T.BufferAttribute(o.grow, 2));
  let colour: Float32Array;
  if (o.colour instanceof Float32Array) colour = o.colour;
  else {
    colour = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colour[i * 3] = o.colour.r;
      colour[i * 3 + 1] = o.colour.g;
      colour[i * 3 + 2] = o.colour.b;
    }
  }
  geo.setAttribute("aColour", new T.BufferAttribute(colour, 3));
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = (((i * 0.6180339887) % 1) + (i % 7) * 0.13) % 1;
  geo.setAttribute("aSeed", new T.BufferAttribute(seed, 1));
  const uniforms = {
    uBuilt: clock.uBuilt,
    uTime: clock.uTime,
    uSize: { value: o.size },
    uPixel: { value: 1 },
    uMin: { value: o.min ?? 1.5 },
    uMax: { value: o.max ?? 40 },
    uTwinkle: { value: o.twinkle ?? 0.3 },
    uGain: { value: o.gain ?? 1 },
    uDot: { value: glowTexture(ctx) },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: LIGHTS_VERT,
    fragmentShader: DOT_FRAG,
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
    update(h) {
      uniforms.uPixel.value = h * 0.5;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * The path every flow and link follows, in GLSL: a quadratic arc from a to b that bows by lift (up
 * for ARC_UP; outward from the origin for ARC_SPHERE, where a and b sit on a sphere around it).
 */
const PATH = /* glsl */ `
vec3 pathAt(vec3 a, vec3 b, float lift, float s) {
#if defined(ARC_SPHERE)
  float ra = length(a);
  float rb = length(b);
  vec3 d = normalize(mix(a, b, s) + 1e-6);
  return d * (mix(ra, rb, s) + lift * 4.0 * s * (1.0 - s));
#else
  vec3 mid = (a + b) * 0.5 + vec3(0.0, lift, 0.0);
  return mix(mix(a, mid, s), mix(mid, b, s), s);
#endif
}
`;

const FLOW_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aFlow;    // lift, phase, speed, size
attribute vec2 aWindow;  // the clock's window while this particle runs
attribute vec3 aColour;
uniform float uClock;
uniform float uTime;
uniform float uRate;
uniform float uPixel;
uniform float uMin;
uniform float uMax;
varying vec3 vColour;
varying float vAlpha;
${PATH}
void main() {
  float s = fract(aFlow.y + uTime * uRate * aFlow.z);
  vec3 p = pathAt(aFrom, aTo, aFlow.x, s);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float w0 = smoothstep(aWindow.x, aWindow.x + (aWindow.y - aWindow.x) * 0.12 + 1e-4, uClock);
  float w1 = 1.0 - smoothstep(aWindow.y - (aWindow.y - aWindow.x) * 0.12 - 1e-4, aWindow.y, uClock);
  float live = w0 * w1;
  vAlpha = live * smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.85, 1.0, s));
  vColour = aColour;
  gl_PointSize = clamp(uPixel * aFlow.w / max(-mv.z, 1e-6), uMin, uMax) * step(0.001, live);
  ${VERT_TAIL}
}`;

export interface FlowSpec {
  from: Float32Array;
  to: Float32Array;
  /** lift, phase (0 to 1), speed (a multiple of the rate), size (scene units at distance 1). */
  flow: Float32Array;
  window: Float32Array;
  colour: Float32Array;
}

export interface Flow {
  points: THREE.Points;
  uniforms: {
    uClock: { value: number };
    uRate: { value: number };
    uMin: { value: number };
    uMax: { value: number };
  };
  update(time: number, pixelHeight: number): void;
  dispose(): void;
}

/** Particles along arcs, each running while uClock is inside its window. */
export function makeFlow(
  ctx: KindContext,
  f: FlowSpec,
  o: { rate: number; sphere?: boolean; min?: number; max?: number },
): Flow {
  const T = ctx.three;
  const n = Math.floor(f.from.length / 3);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aFrom", new T.BufferAttribute(f.from, 3));
  geo.setAttribute("aTo", new T.BufferAttribute(f.to, 3));
  geo.setAttribute("aFlow", new T.BufferAttribute(f.flow, 4));
  geo.setAttribute("aWindow", new T.BufferAttribute(f.window, 2));
  geo.setAttribute("aColour", new T.BufferAttribute(f.colour, 3));
  const uniforms = {
    uClock: { value: 0 },
    uTime: { value: 0 },
    uRate: { value: o.rate },
    uPixel: { value: 1 },
    uMin: { value: o.min ?? 1.2 },
    uMax: { value: o.max ?? 24 },
    uDot: { value: glowTexture(ctx) },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: FLOW_VERT,
    fragmentShader: DOT_FRAG,
    uniforms,
    defines: o.sphere ? { ARC_SPHERE: "" } : {},
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    uniforms,
    update(time, h) {
      uniforms.uTime.value = time;
      uniforms.uPixel.value = h * 0.5;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const LINK_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aLink;   // lift, along (0 to 1), seed, weight
attribute vec2 aBorn;   // start on the clock, time to draw
uniform float uClock;
varying float vAlong;
varying float vDrawn;
varying float vSeed;
varying float vWeight;
${PATH}
void main() {
  vec3 p = pathAt(aFrom, aTo, aLink.x, aLink.y);
  vAlong = aLink.y;
  vDrawn = clamp((uClock - aBorn.x) / max(aBorn.y, 1e-4), 0.0, 1.0);
  vSeed = aLink.z;
  vWeight = aLink.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  ${VERT_TAIL}
}`;

const LINK_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uTime;
uniform float uPulses;
uniform float uSpeed;
uniform float uGain;
uniform vec3 cLine;
uniform vec3 cPulse;
varying float vAlong;
varying float vDrawn;
varying float vSeed;
varying float vWeight;
void main() {
  if (vAlong > vDrawn) discard;
  // The drawing tip glows; pulses run along a finished link.
  float tip = smoothstep(vDrawn - 0.12, vDrawn, vAlong) * step(vDrawn, 0.999);
  float ph = vAlong * 2.0 - uTime * uSpeed * (0.6 + vSeed) + vSeed * 17.0;
  float pulse = pow(max(0.5 + 0.5 * sin(ph * 6.2832), 0.0), 14.0) * uPulses * step(0.5, fract(vSeed * 7.3) + uPulses * 0.6);
  vec3 c = cLine * (0.35 + 0.65 * vWeight) + cPulse * (pulse * 2.6 + tip * 2.0);
  float a = (0.25 + 0.75 * vWeight) * uGain;
  gl_FragColor = vec4(c * a, a);
  ${FRAG_TAIL}
}`;

export interface LinkSpec {
  from: Float32Array;
  to: Float32Array;
  /** lift, seed (0 to 1), weight (0 to 1) per link. */
  link: Float32Array;
  /** start, time to draw, per link, on the clock. */
  born: Float32Array;
  /** Segments per link. */
  segments: Uint8Array | number[];
}

export interface Links {
  lines: THREE.LineSegments;
  uniforms: {
    uClock: { value: number };
    uPulses: { value: number };
    uSpeed: { value: number };
    uGain: { value: number };
    cLine: { value: THREE.Color };
    cPulse: { value: THREE.Color };
  };
  update(time: number): void;
  dispose(): void;
}

/** Links as arcs that draw themselves when the clock reaches them, then carry pulses. */
export function makeLinks(
  ctx: KindContext,
  l: LinkSpec,
  o: {
    line: THREE.Color;
    pulse: THREE.Color;
    pulses: number;
    speed?: number;
    gain?: number;
    sphere?: boolean;
  },
): Links {
  const T = ctx.three;
  const n = l.segments.length;
  let verts = 0;
  for (let i = 0; i < n; i++) verts += (l.segments[i] as number) * 2;
  const from = new Float32Array(verts * 3);
  const to = new Float32Array(verts * 3);
  const link = new Float32Array(verts * 4);
  const born = new Float32Array(verts * 2);
  let v = 0;
  for (let i = 0; i < n; i++) {
    const segs = l.segments[i] as number;
    for (let s = 0; s < segs; s++) {
      for (const t of [s / segs, (s + 1) / segs]) {
        from.set(l.from.subarray(i * 3, i * 3 + 3), v * 3);
        to.set(l.to.subarray(i * 3, i * 3 + 3), v * 3);
        link[v * 4] = l.link[i * 3] as number;
        link[v * 4 + 1] = t;
        link[v * 4 + 2] = l.link[i * 3 + 1] as number;
        link[v * 4 + 3] = l.link[i * 3 + 2] as number;
        born[v * 2] = l.born[i * 2] as number;
        born[v * 2 + 1] = l.born[i * 2 + 1] as number;
        v++;
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(verts * 3), 3));
  geo.setAttribute("aFrom", new T.BufferAttribute(from, 3));
  geo.setAttribute("aTo", new T.BufferAttribute(to, 3));
  geo.setAttribute("aLink", new T.BufferAttribute(link, 4));
  geo.setAttribute("aBorn", new T.BufferAttribute(born, 2));
  const uniforms = {
    uClock: { value: 0 },
    uTime: { value: 0 },
    uPulses: { value: o.pulses },
    uSpeed: { value: o.speed ?? 0.4 },
    uGain: { value: o.gain ?? 1 },
    cLine: { value: o.line },
    cPulse: { value: o.pulse },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: LINK_VERT,
    fragmentShader: LINK_FRAG,
    uniforms,
    defines: o.sphere ? { ARC_SPHERE: "" } : {},
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const lines = new T.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return {
    lines,
    uniforms,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
