/**
 * An airless world being worked: the Moon, Mercury or an asteroid, from its NASA map (or none, for
 * an asteroid), with fine relief that appears up close and up to sixteen sites cut into it. A
 * site is a pit or strip mine (darker, terraced) with a glowing core where ore is smelted; its
 * size grows with its share built. The shader lights the world by the Sun and keeps the
 * terminator soft, as it is on a world without air.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { lin, map } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";

export const SITES = 16;

const VERT = /* glsl */ `
${VERT_HEAD}
uniform float uLumpy;
uniform vec4 uFlat;   // a direction (xyz) and angular radius (w) kept round, for a launch site
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
${NOISE}
void main() {
  vUv = uv;
  vObj = normalize(position);
  vec3 p = position;
  // An asteroid is a lumpy potato, not a ball.
  if (uLumpy > 0.0) {
    float k = fbm(vObj * 1.3 + 3.0) * 0.9 + vnoise(vObj * 5.0) * 0.18;
    float keep = uFlat.w > 0.0 ? smoothstep(uFlat.w, uFlat.w * 2.5, acos(clamp(dot(vObj, uFlat.xyz), -1.0, 1.0))) : 1.0;
    p *= 1.0 + uLumpy * (k - 0.5) * 1.6 * keep;
    p.x *= 1.0 + uLumpy * 0.5 * keep;
  }
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uTime;
uniform float uBump;
uniform float uGain;
uniform vec3 cTint;
uniform vec3 cHot;
uniform float uLumpy;
uniform vec4 uSite[${SITES}];
uniform vec4 uSiteHeat[${SITES}];
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
${NOISE}
// Bowl-shaped craters with raised rims, one per cell, at one scale.
float craters(vec3 p) {
  vec3 c = floor(p);
  float h = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 cell = c + vec3(float(x), float(y), float(z));
    vec3 o = hash33(cell);
    float r = 0.25 + 0.4 * o.x;
    float d = length(p - cell - o) / r;
    // A bowl rising smoothly into its rim, then falling away outside: continuous everywhere, so
    // the relief never shows a hard ring.
    if (o.y > 0.7) h += d < 1.0 ? mix((d * d - 1.0) * 0.6, 0.25, smoothstep(0.6, 1.0, d)) : 0.25 * exp(-(d - 1.0) * 6.0);
  }
  return h;
}
// A site: a terraced pit, darker, with a hot core and a rim that catches the light. The distance
// is the chord to the site's centre, which for these small angles is the angle itself; acos of an
// interpolated (so not quite unit) position cannot resolve anything under about two degrees.
void site(vec4 s, float heat, float k, vec3 o, inout vec3 alb, inout float glow) {
  if (s.w <= 0.0) return;
  float d = length(o - s.xyz);
  float inside = 1.0 - smoothstep(s.w * 0.8, s.w, d);
  if (inside <= 0.0) return;
  float ter = 0.55 + 0.45 * step(0.5, fract(d / s.w * 5.0 + 0.2));
  alb = mix(alb, alb * 0.5 * ter + vec3(0.02, 0.018, 0.016), inside * 0.85);
  float core = 1.0 - smoothstep(0.0, s.w * 0.45, d);
  glow += core * heat * (0.75 + 0.25 * sin(uTime * 2.0 + k * 1.7 + d * 80.0));
  alb += vec3(0.05) * smoothstep(s.w * 0.75, s.w * 0.95, d) * inside;
}
void main() {
  vec3 o = normalize(vObj);
  vec3 alb = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : cTint;
  alb *= uGain;
  // Relief: fine noise and craters, felt through the lighting only when close.
  float h = 0.0;
  if (uBump > 0.0) {
    h = fbm(o * 50.0) * 0.6 + craters(o * 90.0) * 0.35;
    alb *= 0.88 + 0.24 * vnoise(o * 400.0);
  }
  // A lumpy body's true surface normal comes from its displaced positions.
  vec3 N = uLumpy > 0.0 ? normalize(cross(dFdx(vWorld), dFdy(vWorld))) : normalize(vN);
  if (uBump > 0.0) {
    vec3 dpx = dFdx(vWorld);
    vec3 dpy = dFdy(vWorld);
    float hx = dFdx(h);
    float hy = dFdy(h);
    vec3 r1 = cross(dpy, N);
    vec3 r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    N = normalize(abs(det) * N - grad * uBump * 0.004);
  }
  // Sites: terraced pits, darker, with a hot core.
  float glow = 0.0;
  for (int i = 0; i < ${SITES}; i++) site(uSite[i], uSiteHeat[i].x, float(i), o, alb, glow);
  vec3 L = normalize(uSun - vWorld);
  float mu = dot(N, L);
  float lit = smoothstep(-0.04, 0.16, mu) * pow(clamp(mu, 0.0, 1.0), 0.6);
  vec3 c = alb * (lit * 1.25 + 0.012);
  c += cHot * glow * 2.4;
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export interface World {
  mesh: THREE.Mesh;
  /** Set site i: a unit direction (object space), its angular radius (radians, 0 hides it) and heat. */
  site(i: number, dir: THREE.Vector3, radius: number, heat: number): void;
  uniforms: { uBump: { value: number }; uTime: { value: number }; uSun: { value: THREE.Vector3 } };
  update(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

export function makeWorld(
  ctx: KindContext,
  o: {
    map?: "moon.jpg" | "mercury.jpg";
    radius: number;
    sun: THREE.Vector3;
    gain?: number;
    tint?: string;
    hot?: string;
    lumpy?: number;
    flat?: THREE.Vector4;
  },
): World {
  const T = ctx.three;
  const seg = ctx.detail < 1 ? 96 : 160;
  const geo = new T.SphereGeometry(o.radius, seg, seg / 2);
  const uniforms = {
    uMap: { value: o.map ? map(ctx, o.map) : null },
    uHasMap: { value: o.map ? 1 : 0 },
    uSun: { value: o.sun },
    uCam: { value: new T.Vector3() },
    uTime: { value: 0 },
    uBump: { value: 0 },
    uGain: { value: o.gain ?? 1 },
    uLumpy: { value: o.lumpy ?? 0 },
    uFlat: { value: o.flat ?? new T.Vector4() },
    cTint: { value: lin(ctx, o.tint ?? "#8a8178") },
    cHot: { value: lin(ctx, o.hot ?? "#ff7a2a") },
    uSite: { value: Array.from({ length: SITES }, () => new T.Vector4()) },
    uSiteHeat: { value: Array.from({ length: SITES }, () => new T.Vector4()) },
  };
  const mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  const mesh = new T.Mesh(geo, mat);
  return {
    mesh,
    uniforms,
    site(i, dir, radius, heat) {
      const v = uniforms.uSite.value[i];
      if (!v) return;
      v.set(dir.x, dir.y, dir.z, radius);
      uniforms.uSiteHeat.value[i]?.setX(heat);
    },
    update(time, camera) {
      uniforms.uTime.value = time;
      camera.getWorldPosition(uniforms.uCam.value);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
