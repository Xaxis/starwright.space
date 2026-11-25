/**
 * Ground for the systems scenes, drawn procedurally in metres: dunes, a lagoon, farmland, a
 * glacier, grey regolith or a city's lit grid. One disc reaches from under the camera to far past
 * the horizon, its rings spaced in powers so it is fine close up and coarse far away. Inside the
 * built area it stays flat (things stand on y = 0); beyond it, hills or dunes rise. Detail fades by
 * each pixel's footprint, so ripples a metre apart vanish cleanly from a kilometre up.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { SKY_GLSL, type Sky } from "./sky.ts";

export type TerrainName = "desert" | "sea" | "plain" | "ice" | "regolith" | "city" | "floor";

const VERT = /* glsl */ `
${VERT_HEAD}
uniform float uFlat;
varying vec3 vWorld;
${NOISE}
float relief(vec2 p);
void main() {
  vec3 p = position;
  float r = length(p.xz);
  p.y += relief(p.xz) * smoothstep(max(uFlat * 1.5, 600.0), max(uFlat * 6.0, 4000.0), r);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}
float relief(vec2 p) {
#if defined(T_DESERT)
  return (vnoise(vec3(p / 900.0, 1.0)) * 70.0 + vnoise(vec3(p / 260.0, 2.0)) * 22.0);
#elif defined(T_PLAIN)
  return vnoise(vec3(p / 2400.0, 3.0)) * 140.0 + vnoise(vec3(p / 600.0, 4.0)) * 25.0;
#elif defined(T_REGOLITH)
  return vnoise(vec3(p / 3000.0, 5.0)) * 260.0 + vnoise(vec3(p / 700.0, 6.0)) * 50.0;
#elif defined(T_ICE)
  return vnoise(vec3(p / 5000.0, 7.0)) * 400.0 * smoothstep(8000.0, 30000.0, length(p));
#else
  return 0.0;
#endif
}`;

const FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 cLight;
uniform vec3 cFill;
uniform vec3 cAccent;
uniform vec3 uCam;
uniform float uTime;
uniform float uFlat;
uniform float fogNear;
uniform float fogFar;
varying vec3 vWorld;
${NOISE}
${SKY_GLSL}
// How much of a pattern with this period survives at this pixel's footprint.
float keep(float period, float foot) { return 1.0 - smoothstep(period * 0.25, period * 0.9, foot); }
float n2(vec2 p, float z) { return vnoise(vec3(p, z)); }

#if defined(T_DESERT)
float height(vec2 p, float foot) {
  float w = p.x / 150.0 + p.y / 420.0 + n2(p / 520.0, 1.0) * 3.0 + n2(p / 140.0, 6.0) * 0.6;
  float dune = pow(clamp(0.5 + 0.5 * sin(w * 6.2832), 0.0, 1.0), 2.2) * 1.6 * (0.3 + 0.7 * n2(p / 900.0, 7.0));
  float ridge = 1.0 - abs(2.0 * n2(p / vec2(260.0, 120.0), 8.0) - 1.0);
  dune += ridge * ridge * 3.5 + n2(p / 120.0, 2.0) * 2.0;
  float rip = sin((p.x * 0.8 + p.y * 0.35 + n2(p / 9.0, 3.0) * 4.0) * 4.2) * 0.05 * keep(1.5, foot);
  return dune + rip + n2(p / 1.7, 4.0) * 0.04 * keep(1.7, foot);
}
vec3 albedo(vec2 p, float h, float foot) {
  vec3 a = mix(vec3(0.36, 0.22, 0.13), vec3(0.56, 0.38, 0.23), smoothstep(0.5, 6.0, h));
  a *= 0.88 + 0.24 * n2(p / 40.0, 5.0);
  return a;
}
#elif defined(T_SEA)
float height(vec2 p, float foot) {
  float t = uTime;
  float k = keep(6.0, foot);
  float h = sin(dot(p, vec2(0.11, 0.05)) + t * 0.9) * 0.18;
  h += sin(dot(p, vec2(-0.07, 0.13)) + t * 1.1) * 0.14;
  h += sin(dot(p, vec2(0.31, -0.22)) + t * 1.7) * 0.06 * k;
  h += (n2(p / 3.0 + t * 0.15, 1.0) - 0.5) * 0.12 * keep(3.0, foot);
  h += n2(p / 60.0 + t * 0.02, 2.0) * 0.5;
  return h;
}
vec3 albedo(vec2 p, float h, float foot) {
  float r = length(p);
  float shallow = 1.0 - smoothstep(uFlat * 1.2, uFlat * 4.0 + 300.0, r + n2(p / 300.0, 3.0) * 400.0);
  vec3 deep = vec3(0.01, 0.06, 0.1);
  vec3 lagoon = vec3(0.04, 0.5, 0.48);
  vec3 a = mix(deep, lagoon, shallow);
  float coral = smoothstep(0.58, 0.7, n2(p / 22.0, 4.0) * 0.7 + n2(p / 5.0, 5.0) * 0.3) * shallow;
  a = mix(a, vec3(0.45, 0.24, 0.2), coral * 0.55);
  return a;
}
#elif defined(T_PLAIN)
float height(vec2 p, float foot) {
  return n2(p / 30.0, 1.0) * 0.6 + n2(p / 3.0, 2.0) * 0.15 * keep(3.0, foot);
}
vec3 albedo(vec2 p, float h, float foot) {
  vec2 q = p + vec2(n2(p / 500.0, 3.0), n2(p / 500.0, 4.0)) * 120.0;
  vec2 cell = floor(q / 240.0);
  float pick = hash13(vec3(cell, 7.0));
  vec3 a = mix(vec3(0.16, 0.24, 0.09), vec3(0.34, 0.31, 0.15), pick);
  a = mix(a, vec3(0.2, 0.16, 0.1), step(0.8, pick));
  a = mix(a, vec3(0.22, 0.27, 0.12), n2(p / 700.0, 8.0) * 0.6);
  // Crop rows, then hedges at each field's edge.
  vec2 f = fract(q / 240.0);
  float rows = 0.5 + 0.5 * sin((step(0.5, hash13(vec3(cell, 9.0))) > 0.5 ? q.x : q.y) * 1.3);
  a *= 0.86 + 0.18 * rows * keep(5.0, foot);
  float hedge = 1.0 - smoothstep(0.0, 0.025, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  a = mix(a, vec3(0.07, 0.11, 0.05), hedge * 0.8 * keep(20.0, foot));
  a *= 0.85 + 0.3 * n2(p / 18.0, 5.0);
  return a;
}
#elif defined(T_ICE)
float height(vec2 p, float foot) {
  float s = sin((p.x * 0.6 + n2(p / 14.0, 1.0) * 6.0) * 1.3) * 0.08 * keep(3.0, foot);
  return n2(p / 50.0, 2.0) * 1.2 + s;
}
vec3 albedo(vec2 p, float h, float foot) {
  vec3 a = mix(vec3(0.34, 0.41, 0.5), vec3(0.46, 0.52, 0.6), n2(p / 30.0, 3.0));
  // Crevasses: short parallel cracks across the flow, in bands where the ice stretches.
  vec2 q = p + vec2(n2(p / 90.0, 5.0), 0.0) * 30.0;
  float band = smoothstep(0.45, 0.7, n2(p / 400.0, 6.0));
  float lane = floor(q.x / 17.0);
  float seg = smoothstep(0.5, 0.62, n2(vec2(lane * 7.13, p.y / 28.0), 9.0));
  float cr = abs(fract(q.x / 17.0) - 0.5);
  float crack = (1.0 - smoothstep(0.0, 0.02 + foot / 17.0, cr)) * band * seg;
  a = mix(a, vec3(0.05, 0.16, 0.32), crack * 0.9 * keep(6.0, foot));
  return a;
}
#elif defined(T_REGOLITH)
// Craters at two sizes: a bowl with a raised rim, one per cell where the dice allow.
float crater(vec2 p, float size, float z) {
  vec2 c = floor(p / size);
  vec2 f = p / size - c;
  vec3 hsh = hash33(vec3(c, z));
  if (hsh.z < 0.72) return 0.0;
  vec2 o = 0.3 + hsh.xy * 0.4;
  float size1 = 0.06 + 0.26 * pow(fract(hsh.z * 13.7 + hsh.x * 3.1), 2.0);
  float r = length(f - o) / size1;
  float bowl = (r * r - 1.0) * 0.6 * step(r, 1.0);
  float rim = exp(-pow(max((r - 1.0) * 3.0, 0.0), 2.0)) * 0.35 * step(1.0, r);
  return (bowl + rim) * size * size1 * 0.5;
}
float height(vec2 p, float foot) {
  float h = crater(p, 120.0, 1.0) * keep(30.0, foot) + crater(p, 520.0, 2.0) + crater(p, 31.0, 3.0) * keep(8.0, foot);
  return h + n2(p / 40.0, 4.0) * 1.4 + n2(p / 3.0, 5.0) * 0.12 * keep(3.0, foot);
}
vec3 albedo(vec2 p, float h, float foot) {
  float g = 0.24 + 0.08 * n2(p / 200.0, 6.0) + 0.05 * n2(p / 11.0, 7.0);
  return vec3(g, g * 0.97, g * 0.93);
}
#elif defined(T_FLOOR)
// A dark floor with a faint grid in the accent: a workshop, a lab, the bottom of a dish.
float height(vec2 p, float foot) { return 0.0; }
vec3 albedo(vec2 p, float h, float foot) {
  return cGround * 2.5 * (0.8 + 0.4 * n2(p / 7.0, 1.0));
}
vec3 floorGlow(vec2 p, float foot) {
  vec2 g1 = abs(fract(p / 2.0 + 0.5) - 0.5) * 2.0;
  vec2 g2 = abs(fract(p / 20.0 + 0.5) - 0.5) * 20.0;
  float l1 = 1.0 - smoothstep(0.0, 0.025 + foot * 0.8, min(g1.x, g1.y));
  float l2 = 1.0 - smoothstep(0.0, 0.05 + foot * 0.8, min(g2.x, g2.y));
  return cAccent * (l1 * 0.04 * keep(2.0, foot) + l2 * 0.1 * keep(20.0, foot) + 0.004);
}
#else
// The city: blocks of dark roofs and lit windows between streets, with traffic.
float height(vec2 p, float foot) { return 0.0; }
float street(vec2 p, float period, float w) {
  vec2 f = abs(fract(p / period + 0.5) - 0.5) * period;
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.6, min(f.x, f.y));
}
vec3 albedo(vec2 p, float h, float foot) {
  float block = hash13(vec3(floor(p / 40.0), 1.0));
  vec3 a = vec3(0.05, 0.05, 0.06) * (0.7 + 0.6 * block);
  float s = max(street(p, 160.0, 14.0), street(p, 40.0, 6.0) * 0.8);
  a = mix(a, vec3(0.025, 0.025, 0.03), s);
  return a;
}
vec3 cityGlow(vec2 p, float foot) {
  vec3 warm = vec3(1.0, 0.66, 0.32);
  vec3 c = vec3(0.0);
  float streets = max(street(p, 160.0, 14.0), street(p, 40.0, 6.0));
  // Windows: small warm dots on the roofs, a share of them lit; far away, their average.
  vec2 w = floor(p / 5.0);
  float lit = step(0.86, hash13(vec3(w, 3.0))) * (1.0 - streets);
  float dot1 = 1.0 - smoothstep(0.1, 0.28, length(fract(p / 5.0) - 0.5));
  c += warm * lit * mix(0.02, dot1 * 0.5, keep(10.0, foot));
  // Lamps every 30 metres down both sides of the avenues, each with its pool of light.
  vec2 g = abs(fract(p / 160.0 + 0.5) - 0.5) * 160.0;
  vec2 along = abs(fract(p / 30.0 + 0.5) - 0.5) * 30.0;
  float dv = length(vec2(abs(g.x - 6.0), along.y));
  float dh = length(vec2(abs(g.y - 6.0), along.x));
  float d = min(dv, dh);
  c += warm * (exp(-d * d / 0.8) * 2.5 * keep(6.0, foot) + exp(-d * d / 40.0) * 0.18);
  c += warm * 0.012 * street(p, 40.0, 6.0);
  // Traffic: lights moving along the avenues, white one way and red the other.
  float major = street(p, 160.0, 14.0);
  vec2 f = fract(p / 160.0 + 0.5) - 0.5;
  float run = abs(f.x) < abs(f.y) ? p.y : p.x;
  float side = abs(f.x) < abs(f.y) ? sign(f.x) : sign(f.y);
  float car = pow(max(0.5 + 0.5 * sin(run * 0.21 - side * uTime * 5.0 + floor(p.x / 160.0) * 3.0), 0.0), 30.0);
  c += mix(vec3(1.0, 0.18, 0.1), vec3(1.0, 0.95, 0.85), step(0.0, side)) * car * major * 0.9 * keep(8.0, foot);
  return c;
}
#endif

void main() {
  vec2 p = vWorld.xz;
  float dist = length(uCam - vWorld);
  float foot = length(fwidth(p)) + 1e-3;
  float e = max(0.15, foot * 0.6);
  float h = height(p, foot);
  float hx = height(p + vec2(e, 0.0), foot);
  float hz = height(p + vec2(0.0, e), foot);
  vec3 N = normalize(vec3(h - hx, e, h - hz));
  // The vertex relief far out, as a broad tilt.
  vec3 dx = dFdx(vWorld);
  vec3 dz = dFdy(vWorld);
  vec3 geoN = normalize(cross(dz, dx));
  if (geoN.y < 0.0) geoN = -geoN;
  N = normalize(N + (geoN - vec3(0.0, 1.0, 0.0)) * 0.6);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCam - vWorld);
  vec3 a = albedo(p, h, foot);
  float mu = dot(N, L);
#if defined(T_SEA)
  // Water: the sky's colour by Fresnel, the Sun's glitter, the lagoon's colour beneath.
  vec3 R = reflect(-V, N);
  float fres = 0.04 + 0.96 * pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 5.0);
  vec3 skyc = skyColour(vec3(R.x, max(R.y, 0.0), R.z));
  vec3 c = a * (cFill * 1.6 + cLight * max(mu, 0.0) * 0.4);
  c = mix(c, skyc, fres * 0.85);
  c += cSun * pow(max(dot(R, L), 0.0), 600.0) * 18.0 * keep(2.0, foot * 0.5);
#else
  float wrap = clamp((mu + 0.25) / 1.25, 0.0, 1.0);
  vec3 c = a * (cLight * wrap + cFill);
#if defined(T_ICE)
  vec3 H = normalize(L + V);
  c += cLight * pow(max(dot(N, H), 0.0), 80.0) * 0.5;
  c += vec3(0.05, 0.12, 0.25) * (1.0 - wrap) * 0.6;
#endif
#if defined(T_REGOLITH)
  c = a * (cLight * max(mu, 0.0) * 1.1 + cFill);
#endif
#if defined(T_CITY)
  c += cityGlow(p, foot);
#endif
#if defined(T_FLOOR)
  c += floorGlow(p, foot);
#endif
#endif
  float fog = smoothstep(fogNear, fogFar, dist);
  vec3 away = vWorld - uCam;
  c = mix(c, skyColour(normalize(vec3(away.x, 0.0, away.z))), fog);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export interface Terrain {
  mesh: THREE.Mesh;
  update(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

/**
 * A ground disc. flat: the radius, in metres, inside which it stays level (the built area). The
 * scene's fog (from lightFromSky) is read each frame so the ground fades to the same horizon.
 */
export function makeTerrain(ctx: KindContext, name: TerrainName, sky: Sky, flat: number): Terrain {
  const T = ctx.three;
  // Rings from half a metre to a thousand kilometres, each a fixed ratio wider than the last.
  const rings = ctx.detail < 1 ? 90 : 130;
  const segs = ctx.detail < 1 ? 120 : 200;
  const r0 = 0.5;
  const q = 2e6 ** (1 / rings);
  const pos: number[] = [0, 0, 0];
  for (let k = 0; k < rings; k++) {
    const r = r0 * q ** k;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let k = 0; k < rings - 1; k++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + k * segs + s;
      const b = 1 + k * segs + ((s + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new T.Sphere(new T.Vector3(), 2e6);
  const p = sky.preset;
  const fog = ctx.scene.fog as THREE.Fog | null;
  const uniforms = {
    ...sky.uniforms,
    cLight: { value: new T.Color(p.sun).multiplyScalar(p.light * 0.42) },
    cFill: {
      value: new T.Color(p.zenith).lerp(new T.Color(p.anti), 0.6).multiplyScalar(p.fill * 0.9),
    },
    cAccent: { value: new T.Color(ctx.colour) },
    uCam: { value: new T.Vector3() },
    uTime: { value: 0 },
    uFlat: { value: flat },
    fogNear: { value: 1000 },
    fogFar: { value: 10000 },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    defines: { [`T_${name.toUpperCase()}`]: "" },
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return {
    mesh,
    update(time, camera) {
      uniforms.uTime.value = time;
      camera.getWorldPosition(uniforms.uCam.value);
      if (fog) {
        uniforms.fogNear.value = fog.near;
        uniforms.fogFar.value = fog.far;
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
