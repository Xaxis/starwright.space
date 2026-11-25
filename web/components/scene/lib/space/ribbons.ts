/**
 * Lines of light a few pixels wide whatever the zoom: power lines, beams, tethers, tracks and
 * trails. Each is a run of segments drawn as camera-facing quads in one draw call, with pulses
 * running along it and its own threshold, so lines appear one by one as a share grows. A
 * ribbon's ends may be moved every frame (a beam from a moving craft).
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { lin } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";

const VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aT;       // distance along the whole line at A and at B, 0 to 1
attribute vec3 aCorner;  // end (0 at A, 1 at B), side (-1 or 1), line's threshold
attribute float aSeed;
uniform vec2 uRes;
uniform float uWidth;
uniform float uBuilt;
uniform float uReveal;
varying float vAlong;
varying float vSide;
varying float vOn;
varying float vSeed;
void main() {
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec4 c = aCorner.x < 0.5 ? ca : cb;
  vec2 sa = ca.xy / max(abs(ca.w), 1e-6);
  vec2 sb = cb.xy / max(abs(cb.w), 1e-6);
  vec2 d = (sb - sa) * uRes;
  float l = length(d);
  vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  c.xy += nrm * aCorner.y * uWidth / uRes * c.w;
  gl_Position = c;
  vAlong = mix(aT.x, aT.y, aCorner.x);
  vSide = aCorner.y;
  vOn = smoothstep(aCorner.z, aCorner.z + 0.03, uBuilt);
  vSeed = aSeed;
  ${VERT_TAIL}
}`;

const FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uTime;
uniform float uOn;
uniform float uReveal;
uniform float uPulses;   // pulses along a line
uniform float uSpeed;    // their speed, lines a second
uniform float uBase;     // brightness between pulses
uniform vec3 cColour;
uniform vec3 cPulse;
uniform float uTravel;   // 1: each line is a trail behind a head that runs along it
uniform float uRate;     // heads a second along a line
uniform float uTrail;    // the trail's length, as a share of the line
uniform float uAccel;    // the head starts slow and speeds up
varying float vAlong;
varying float vSide;
varying float vOn;
varying float vSeed;
void main() {
  float core = exp(-vSide * vSide * 3.5);
  float shown = vOn * uOn * (1.0 - smoothstep(uReveal - 0.01, uReveal, vAlong));
  if (uTravel > 0.5) {
    float head = pow(fract(uTime * uRate + vSeed), uAccel);
    float behind = head - vAlong;
    shown *= step(0.0, behind) * pow(clamp(1.0 - behind / uTrail, 0.0, 1.0), 1.6);
  }
  if (shown * core < 0.003) discard;
  float wave = fract(vAlong * uPulses - uTime * uSpeed + vSeed * 7.13);
  float pulse = pow(clamp(1.0 - abs(wave - 0.5) * 2.0, 0.0, 1.0), 10.0);
  vec3 c = cColour * uBase + cPulse * pulse * 2.2;
  float a = core * shown;
  gl_FragColor = vec4(c * a, a);
  ${FRAG_TAIL}
}`;

export interface RibbonLine {
  /** Points along the line. */
  points: THREE.Vector3[];
  /** Share at which this line appears, 0 to 1. */
  born?: number;
  seed?: number;
}

export interface Ribbons {
  mesh: THREE.Mesh;
  /** Lines show as this passes their thresholds. */
  built: { value: number };
  on: { value: number };
  /** Share of each line drawn from its start, for lines that grow. */
  reveal: { value: number };
  width: { value: number };
  /** Move line i's points (same count as it was made with). */
  set(i: number, points: THREE.Vector3[]): void;
  update(time: number): void;
  dispose(): void;
}

export interface RibbonOptions {
  colour: string;
  pulse?: string;
  /** Half the line's width, in pixels. */
  width?: number;
  pulses?: number;
  speed?: number;
  base?: number;
  /** Draw each line as a trail behind a head running along it, from its seed's phase. */
  travel?: { rate: number; trail: number; accel?: number };
}

/** Where a travelling head is on a line at a time: its share of the way along. */
export function headAt(
  time: number,
  seed: number,
  travel: { rate: number; accel?: number },
): number {
  const x = time * travel.rate + seed;
  return (x - Math.floor(x)) ** (travel.accel ?? 1);
}

/** The point a share of the way along a polyline, by length. */
export function pointAlong(points: THREE.Vector3[], t: number, out: THREE.Vector3): THREE.Vector3 {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += (points[i] as THREE.Vector3).distanceTo(points[i - 1] as THREE.Vector3);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as THREE.Vector3;
    const b = points[i] as THREE.Vector3;
    const l = a.distanceTo(b);
    if (left <= l || i === points.length - 1)
      return out.copy(a).lerp(b, l > 0 ? Math.min(1, left / l) : 0);
    left -= l;
  }
  return out.copy(points[0] as THREE.Vector3);
}

export function makeRibbons(ctx: KindContext, lines: RibbonLine[], o: RibbonOptions): Ribbons {
  const T = ctx.three;
  const segs = lines.reduce((s, l) => s + Math.max(0, l.points.length - 1), 0);
  const A = new Float32Array(segs * 4 * 3);
  const B = new Float32Array(segs * 4 * 3);
  const TT = new Float32Array(segs * 4 * 2);
  const C = new Float32Array(segs * 4 * 3);
  const S = new Float32Array(segs * 4);
  const index: number[] = [];
  /** First segment of each line. */
  const start: number[] = [];
  let k = 0;
  const lengths = (pts: THREE.Vector3[]) => {
    const acc = [0];
    for (let i = 1; i < pts.length; i++)
      acc.push(
        (acc[i - 1] as number) + (pts[i] as THREE.Vector3).distanceTo(pts[i - 1] as THREE.Vector3),
      );
    const total = acc[acc.length - 1] || 1;
    return acc.map((x) => x / total);
  };
  const write = (seg: number, a: THREE.Vector3, b: THREE.Vector3, ta: number, tb: number) => {
    for (let v = 0; v < 4; v++) {
      const j = seg * 4 + v;
      A.set([a.x, a.y, a.z], j * 3);
      B.set([b.x, b.y, b.z], j * 3);
      TT.set([ta, tb], j * 2);
    }
  };
  lines.forEach((line, li) => {
    start.push(k);
    const t = lengths(line.points);
    for (let i = 0; i < line.points.length - 1; i++) {
      write(
        k,
        line.points[i] as THREE.Vector3,
        line.points[i + 1] as THREE.Vector3,
        t[i] as number,
        t[i + 1] as number,
      );
      const corners = [
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 1],
      ];
      corners.forEach(([e, s], v) => {
        const j = k * 4 + v;
        C.set([e as number, s as number, line.born ?? 0], j * 3);
        S[j] = line.seed ?? li * 0.137;
      });
      const b = k * 4;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      k++;
    }
  });
  const geo = new T.BufferGeometry();
  const aA = new T.BufferAttribute(A, 3);
  const aB = new T.BufferAttribute(B, 3);
  geo.setAttribute("position", aA);
  geo.setAttribute("aA", aA);
  geo.setAttribute("aB", aB);
  geo.setAttribute("aT", new T.BufferAttribute(TT, 2));
  geo.setAttribute("aCorner", new T.BufferAttribute(C, 3));
  geo.setAttribute("aSeed", new T.BufferAttribute(S, 1));
  geo.setIndex(index);
  const uniforms = {
    uTime: { value: 0 },
    uOn: { value: 1 },
    uBuilt: { value: 1 },
    uReveal: { value: 1.02 },
    uRes: { value: new T.Vector2(1, 1) },
    uWidth: { value: o.width ?? 1.5 },
    uPulses: { value: o.pulses ?? 3 },
    uSpeed: { value: o.speed ?? 0.4 },
    uBase: { value: o.base ?? 0.5 },
    cColour: { value: lin(ctx, o.colour) },
    cPulse: { value: lin(ctx, o.pulse ?? o.colour) },
    uTravel: { value: o.travel ? 1 : 0 },
    uRate: { value: o.travel?.rate ?? 0 },
    uTrail: { value: o.travel?.trail ?? 1 },
    uAccel: { value: o.travel?.accel ?? 1 },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const size = new T.Vector2();
  return {
    mesh,
    built: uniforms.uBuilt,
    on: uniforms.uOn,
    reveal: uniforms.uReveal,
    width: uniforms.uWidth,
    set(i, pts) {
      const t = lengths(pts);
      const s0 = start[i] as number;
      for (let j = 0; j < pts.length - 1; j++)
        write(
          s0 + j,
          pts[j] as THREE.Vector3,
          pts[j + 1] as THREE.Vector3,
          t[j] as number,
          t[j + 1] as number,
        );
      aA.needsUpdate = true;
      aB.needsUpdate = true;
      (geo.getAttribute("aT") as THREE.BufferAttribute).needsUpdate = true;
    },
    update(time) {
      uniforms.uTime.value = time;
      ctx.renderer.getDrawingBufferSize(size);
      // NDC spans 2 across the buffer, so dividing by half the buffer turns pixels into NDC.
      uniforms.uRes.value.set(size.x / 2, size.y / 2);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
