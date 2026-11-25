/**
 * GPU points for the space kinds, sized like meshes: a point's size is in scene units and shrinks
 * with distance, held between a minimum and maximum in pixels so a far swarm stays visible and a
 * near collector does not swamp the screen.
 *
 * - makeOrbiting: craft on circular orbits, each appearing when `built` passes its threshold.
 * - makeDots: things fixed in place (lights, mirrors, clouds), with the same thresholds.
 * - makeFlow: a stream of mass from one place to another, in packets when it comes from a driver.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { glowTexture, lin } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { rng } from "../particles.ts";

const SIZE = /* glsl */ `
uniform float uSize;
uniform float uPixel;
uniform float uMinPx;
uniform float uMaxPx;
float pointPx(vec4 mv, float k) {
  return clamp(uPixel * uSize * k / max(-mv.z, 1e-6), uMinPx, uMaxPx);
}
// A point drawn larger than it is (held at the minimum size) gives back the light it does not
// cover, so a far crowd of points reads as a haze rather than a white blob.
float pointFade(vec4 mv, float k) {
  float raw = uPixel * uSize * k / max(-mv.z, 1e-6);
  return clamp(raw / uMinPx, 0.12, 1.0);
}
`;

const FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uDot;
uniform float uGain;
varying vec3 vColour;
varying float vAlpha;
void main() {
  float a = texture2D(uDot, gl_PointCoord).r * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColour * uGain * a, a);
  ${FRAG_TAIL}
}`;

export interface PointSet {
  points: THREE.Points;
  /** Share built, 0 to 1: each point shows once this passes its own threshold. */
  built: { value: number };
  gain: { value: number };
  uniforms: Record<string, THREE.IUniform>;
  update(time: number, pixel: number): void;
  dispose(): void;
}

interface Common {
  colour: string;
  /** A second colour, mixed in by each point's own jitter. */
  colourB?: string;
  gain?: number;
  /** Size in scene units. */
  size: number;
  minPx?: number;
  maxPx?: number;
}

function material(
  ctx: KindContext,
  vert: string,
  o: Common,
  extra: Record<string, THREE.IUniform>,
): { mat: THREE.ShaderMaterial; uniforms: Record<string, THREE.IUniform> } {
  const T = ctx.three;
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uBuilt: { value: 1 },
    uSize: { value: o.size },
    uPixel: { value: 500 },
    uMinPx: { value: o.minPx ?? 1.5 },
    uMaxPx: { value: o.maxPx ?? 24 },
    uDot: { value: glowTexture(ctx) },
    cA: { value: lin(ctx, o.colour) },
    cB: { value: lin(ctx, o.colourB ?? o.colour) },
    uGain: { value: o.gain ?? 1 },
    ...extra,
  };
  const mat = new T.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  return { mat, uniforms };
}

function finish(
  ctx: KindContext,
  geo: THREE.BufferGeometry,
  mat: THREE.ShaderMaterial,
  uniforms: Record<string, THREE.IUniform>,
): PointSet {
  const points = new ctx.three.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    built: uniforms.uBuilt as { value: number },
    gain: uniforms.uGain as { value: number },
    uniforms,
    update(time, pixel) {
      (uniforms.uTime as { value: number }).value = time;
      (uniforms.uPixel as { value: number }).value = pixel;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const ORBIT_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec4 aOrbit;   // radius, inclination, node, phase
attribute vec2 aBorn;    // threshold to appear, jitter
uniform float uTime;
uniform float uBuilt;
uniform float uSpeed;
uniform float uRef;
uniform vec3 cA;
uniform vec3 cB;
uniform vec3 uGap;       // a direction kept clear (xyz), as a unit vector times the gap's cosine
uniform float uGlint;
varying vec3 vColour;
varying float vAlpha;
${SIZE}
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
  float on = smoothstep(aBorn.x, aBorn.x + 0.015, uBuilt);
  float gl = length(uGap);
  if (gl > 0.0) on *= 1.0 - smoothstep(gl - 0.015, gl, dot(normalize(p), uGap / gl));
  float glint = 1.0 + uGlint * pow(max(0.5 + 0.5 * sin(th * 3.0 + aBorn.y * 40.0 + uTime * 0.7), 0.0), 8.0);
  vColour = mix(cA, cB, aBorn.y) * glint;
  vAlpha = on * pointFade(mv, 1.0);
  gl_PointSize = pointPx(mv, 1.0) * on;
  ${VERT_TAIL}
}`;

export interface OrbitingOptions extends Common {
  count: number;
  rMin: number;
  rMax: number;
  /** Largest inclination, radians: 0 a flat ring, PI/2 a full shell. */
  tilt: number;
  /** Angular speed at radius ref, radians a second. */
  speed: number;
  ref: number;
  seed: number;
  /** Bunch radii toward rMin: 1 even, higher packs them inward. */
  bias?: number;
  /** A point's threshold from its orbit; by default random. */
  born?: (o: { r: number; inc: number; node: number; phase: number; u: number }) => number;
  glint?: number;
}

export function makeOrbiting(ctx: KindContext, o: OrbitingOptions): PointSet {
  const T = ctx.three;
  const n = Math.max(1, Math.round(o.count * ctx.detail));
  const orbit = new Float32Array(n * 4);
  const born = new Float32Array(n * 2);
  const r = rng(o.seed);
  for (let i = 0; i < n; i++) {
    const rad = o.rMin + (o.rMax - o.rMin) * r() ** (o.bias ?? 1);
    const inc = (r() * 2 - 1) * o.tilt;
    const node = r() * Math.PI * 2;
    const phase = r() * Math.PI * 2;
    orbit.set([rad, inc, node, phase], i * 4);
    const u = r();
    born[i * 2] = Math.min(0.985, o.born ? o.born({ r: rad, inc, node, phase, u }) : u * 0.985);
    born[i * 2 + 1] = r();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aOrbit", new T.BufferAttribute(orbit, 4));
  geo.setAttribute("aBorn", new T.BufferAttribute(born, 2));
  const { mat, uniforms } = material(ctx, ORBIT_VERT, o, {
    uSpeed: { value: o.speed },
    uRef: { value: o.ref },
    uGap: { value: new T.Vector3() },
    uGlint: { value: o.glint ?? 0.8 },
  });
  return finish(ctx, geo, mat, uniforms);
}

const DOT_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec2 aBorn;   // threshold, jitter
attribute float aScale;
uniform float uTime;
uniform float uBuilt;
uniform float uTwinkle;
uniform vec3 cA;
uniform vec3 cB;
uniform vec3 uNight;     // when set, the Sun's direction: points show only on the night side
varying vec3 vColour;
varying float vAlpha;
${SIZE}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(aBorn.x, aBorn.x + 0.02, uBuilt);
  if (dot(uNight, uNight) > 0.0) {
    vec3 n = normalize((modelMatrix * vec4(position, 1.0)).xyz - modelMatrix[3].xyz);
    on *= 1.0 - smoothstep(-0.12, 0.08, dot(n, normalize(uNight)));
  }
  float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.0 + aBorn.y * 3.0) + aBorn.y * 60.0));
  vColour = mix(cA, cB, aBorn.y) * tw;
  vAlpha = on * pointFade(mv, aScale);
  gl_PointSize = pointPx(mv, aScale) * on;
  ${VERT_TAIL}
}`;

export interface DotsOptions extends Common {
  positions: ArrayLike<number>;
  /** Threshold for each point; random when left out. */
  born?: ArrayLike<number>;
  scales?: ArrayLike<number>;
  twinkle?: number;
  seed?: number;
  /** Show only on the night side of the sphere the points sit on (its centre is their origin). */
  night?: THREE.Vector3;
}

export function makeDots(ctx: KindContext, o: DotsOptions): PointSet {
  const T = ctx.three;
  const n = Math.floor(o.positions.length / 3);
  const r = rng(o.seed ?? 5);
  const born = new Float32Array(n * 2);
  const scale = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    born[i * 2] = o.born ? (o.born[i] as number) : r() * 0.98;
    born[i * 2 + 1] = r();
    scale[i] = o.scales ? (o.scales[i] as number) : 1;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(Float32Array.from(o.positions), 3));
  geo.setAttribute("aBorn", new T.BufferAttribute(born, 2));
  geo.setAttribute("aScale", new T.BufferAttribute(scale, 1));
  const { mat, uniforms } = material(ctx, DOT_VERT, o, {
    uTwinkle: { value: o.twinkle ?? 0.25 },
    uNight: { value: o.night ?? new T.Vector3() },
  });
  return finish(ctx, geo, mat, uniforms);
}

const FLOW_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aSeed;     // phase, sideways, up
uniform float uTime;
uniform float uRate;
uniform float uOn;
uniform float uLen;       // share of the path drawn, 0 to 1
uniform vec3 uFrom;
uniform vec3 uTo;
uniform vec3 uBend;
uniform float uWidth;
uniform float uFan;       // 0: the stream swells mid-way; 1: it spreads as it goes
uniform float uAccel;     // 1 even; higher starts slow and speeds up, as on a driver
uniform float uPackets;   // 0 a smooth stream; n bunches it into n packets in flight
uniform vec3 cA;
uniform vec3 cB;
varying vec3 vColour;
varying float vAlpha;
${SIZE}
void main() {
  float ph = aSeed.x;
  if (uPackets > 0.5) ph = floor(ph * uPackets) / uPackets + fract(ph * 97.0) * 0.012;
  float s0 = fract(ph + uTime * uRate);
  float s = pow(s0, uAccel);
  vec3 mid = (uFrom + uTo) * 0.5 + uBend;
  vec3 p = mix(mix(uFrom, mid, s), mix(mid, uTo, s), s);
  vec3 dir = normalize(uTo - uFrom + 1e-6);
  vec3 ref = abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(dir, ref));
  vec3 up = cross(side, dir);
  float spread = uWidth * mix(sin(3.14159265 * s), s, uFan);
  p += side * aSeed.y * spread + up * aSeed.z * spread;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float a = uOn * smoothstep(0.0, 0.03, s0) * (1.0 - smoothstep(0.82, 1.0, s0));
  a *= 1.0 - smoothstep(uLen - 0.05, uLen, s);
  vColour = mix(cA, cB, s);
  vAlpha = a * pointFade(mv, 1.0);
  gl_PointSize = pointPx(mv, 1.0) * step(0.004, a);
  ${VERT_TAIL}
}`;

export interface FlowOptions extends Common {
  count: number;
  rate: number;
  width: number;
  seed: number;
  fan?: number;
  accel?: number;
  packets?: number;
}

export interface Flow extends PointSet {
  from: THREE.Vector3;
  to: THREE.Vector3;
  bend: THREE.Vector3;
  on: { value: number };
  len: { value: number };
}

export function makeFlow(ctx: KindContext, o: FlowOptions): Flow {
  const T = ctx.three;
  const n = Math.max(1, Math.round(o.count * ctx.detail));
  const seed = new Float32Array(n * 3);
  const r = rng(o.seed);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = r();
    // A soft core: most mass near the stream's axis.
    const a = r() * Math.PI * 2;
    const k = r() ** 1.5;
    seed[i * 3 + 1] = Math.cos(a) * k;
    seed[i * 3 + 2] = Math.sin(a) * k;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aSeed", new T.BufferAttribute(seed, 3));
  const from = new T.Vector3();
  const to = new T.Vector3(1, 0, 0);
  const bend = new T.Vector3();
  const { mat, uniforms } = material(ctx, FLOW_VERT, o, {
    uRate: { value: o.rate },
    uOn: { value: 0 },
    uLen: { value: 1.05 },
    uFrom: { value: from },
    uTo: { value: to },
    uBend: { value: bend },
    uWidth: { value: o.width },
    uFan: { value: o.fan ?? 0 },
    uAccel: { value: o.accel ?? 1 },
    uPackets: { value: o.packets ?? 0 },
  });
  const set = finish(ctx, geo, mat, uniforms);
  return {
    ...set,
    from,
    to,
    bend,
    on: uniforms.uOn as { value: number },
    len: uniforms.uLen as { value: number },
  };
}
