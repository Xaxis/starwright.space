/**
 * The worlds every scene shares: Earth (day, night lights, clouds, air), the Sun, the Moon,
 * Mercury and the sky. Distances in scenes are in Earth radii unless a kind says otherwise.
 */
import type * as THREE from "three";
import type { KindContext } from "../types.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "./glsl.ts";

const cache = new Map<string, THREE.Texture>();

/** A map from public/maps/, loaded once per page and shared by every scene. */
export function map(ctx: KindContext, name: string): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const T = ctx.three;
  const tex = new T.TextureLoader().load(`/maps/${name}`, () => ctx.redraw());
  tex.colorSpace = name.includes("night") || name.includes("clouds") ? T.NoColorSpace : T.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(name, tex);
  return tex;
}

/** Linear-light colour from #rrggbb, scaled. */
export function lin(ctx: KindContext, hex: string, k = 1): THREE.Color {
  return new ctx.three.Color(hex).multiplyScalar(k);
}

const EARTH_VERT = /* glsl */ `
${VERT_HEAD}
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const EARTH_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uTime;
uniform float uSolar;   // share of the desert boxes covered in panels, 0 to 1
uniform float uLights;  // night lights' strength
uniform vec3 cPanel;
uniform vec3 cPower;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
${NOISE}
// The sunniest deserts, as longitude and latitude boxes (degrees): where panels go first.
float desert(vec2 ll) {
  float d = 0.0;
  d += step(-16.0, ll.x) * step(ll.x, 32.0) * step(15.0, ll.y) * step(ll.y, 31.0); // Sahara
  d += step(36.0, ll.x) * step(ll.x, 56.0) * step(17.0, ll.y) * step(ll.y, 30.0);  // Arabia
  d += step(118.0, ll.x) * step(ll.x, 140.0) * step(-30.0, ll.y) * step(ll.y, -19.0); // Australia
  d += step(-71.0, ll.x) * step(ll.x, -68.0) * step(-27.0, ll.y) * step(ll.y, -18.0); // Atacama
  d += step(-117.0, ll.x) * step(ll.x, -106.0) * step(31.0, ll.y) * step(ll.y, 37.0); // the US southwest
  d += step(90.0, ll.x) * step(ll.x, 110.0) * step(38.0, ll.y) * step(ll.y, 45.0);  // Gobi
  d += step(15.0, ll.x) * step(ll.x, 25.0) * step(-28.0, ll.y) * step(ll.y, -19.0); // Kalahari
  d += step(68.0, ll.x) * step(ll.x, 74.0) * step(24.0, ll.y) * step(ll.y, 29.0);   // Thar
  return clamp(d, 0.0, 1.0);
}
void main() {
  vec3 N = normalize(vN);
  vec3 L = normalize(uSun);
  vec3 V = normalize(uCam - vWorld);
  float mu = dot(N, L);
  float day = smoothstep(-0.12, 0.18, mu);
  vec3 albedo = texture2D(uDay, vUv).rgb;
  float cloud = texture2D(uClouds, vUv + vec2(uTime * 0.0006, 0.0)).r;
  vec2 ll = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
  // Panels: fields of dark glass that spread across the desert boxes as uSolar grows.
  float field = desert(ll) * step(1.0 - uSolar, vnoise(vObj * 90.0) * 0.6 + vnoise(vObj * 13.0) * 0.4);
  float land = step(0.06, albedo.r + albedo.g - albedo.b * 0.6);
  field *= land;
  albedo = mix(albedo, cPanel, field * 0.85);
  vec3 lit = albedo * (max(mu, 0.0) * 1.25 + 0.015);
  // Sun glint on water and on panels.
  vec3 H = normalize(L + V);
  float water = 1.0 - land;
  float spec = pow(max(dot(N, H), 0.0), 60.0) * (water * 0.35 + field * 1.4) * day;
  lit += vec3(1.0, 0.92, 0.75) * spec;
  // Clouds over everything, lit by the Sun.
  lit = mix(lit, vec3(1.0) * (max(mu, 0.0) * 1.1 + 0.01), cloud * 0.85);
  // Night: city lights, and the panel fields' delivered power as a warm glow at dusk.
  float night = 1.0 - day;
  vec3 lights = texture2D(uNight, vUv).rgb;
  lit += lights * vec3(1.0, 0.72, 0.38) * night * uLights * (1.0 - cloud * 0.6) * 1.6;
  lit += cPower * field * (0.25 + 0.75 * night) * (0.6 + 0.4 * sin(uTime * 1.5 + ll.x)) * 0.5;
  // The air at the limb.
  float rim = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
  lit += vec3(0.32, 0.55, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.3, 0.5, mu)) * 0.9;
  gl_FragColor = vec4(lit, 1.0);
  ${FRAG_TAIL}
}`;

const AIR_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 uSun;
uniform vec3 uCam;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vWorld);
  float edge = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 4.0);
  float lit = smoothstep(-0.35, 0.6, dot(N, normalize(uSun)));
  gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * edge * lit * 1.6, edge * lit);
  ${FRAG_TAIL}
}`;

export interface EarthOptions {
  /** World position of the Sun, for the light's direction. */
  sun: THREE.Vector3;
}

export interface Earth {
  group: THREE.Group;
  uniforms: {
    uSolar: { value: number };
    uLights: { value: number };
    uTime: { value: number };
    uCam: { value: THREE.Vector3 };
    uSun: { value: THREE.Vector3 };
  };
  /** Spin the globe and keep the shaders' camera and Sun current. */
  update(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** Earth at radius 1, its axis tilted, turning. */
export function makeEarth(ctx: KindContext, o: EarthOptions): Earth {
  const T = ctx.three;
  const seg = ctx.detail < 1 ? 64 : 128;
  const geo = new T.SphereGeometry(1, seg, seg / 2);
  const uniforms = {
    uDay: { value: map(ctx, "earth-day.jpg") },
    uNight: { value: map(ctx, "earth-night.jpg") },
    uClouds: { value: map(ctx, "earth-clouds.jpg") },
    uSun: { value: o.sun.clone() },
    uCam: { value: new T.Vector3() },
    uTime: { value: 0 },
    uSolar: { value: 0 },
    uLights: { value: 1 },
    cPanel: { value: lin(ctx, "#0c1630") },
    cPower: { value: lin(ctx, "#ffb347", 1.2) },
  };
  const mat = new T.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms });
  const globe = new T.Mesh(geo, mat);
  const airGeo = new T.SphereGeometry(1.025, 64, 32);
  const airMat = new T.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: AIR_FRAG,
    uniforms: { uSun: uniforms.uSun, uCam: uniforms.uCam },
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.BackSide,
  });
  const air = new T.Mesh(airGeo, airMat);
  const tilt = new T.Group();
  tilt.rotation.z = (23.44 * Math.PI) / 180;
  const spin = new T.Group();
  spin.add(globe);
  tilt.add(spin, air);
  const group = new T.Group();
  group.add(tilt);
  const w = new T.Vector3();
  return {
    group,
    uniforms,
    update(time, camera) {
      spin.rotation.y = time * 0.05;
      uniforms.uTime.value = time;
      camera.getWorldPosition(uniforms.uCam.value);
      group.getWorldPosition(w);
      uniforms.uSun.value.copy(o.sun).sub(w);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      airGeo.dispose();
      airMat.dispose();
    },
  };
}

const SUN_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uTime;
uniform float uDim;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
uniform vec3 uCam;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vWorld);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float gran = fbm(vObj * 9.0 + uTime * 0.05) * 0.6 + fbm(vObj * 31.0 - uTime * 0.08) * 0.4;
  float limb = 0.45 + 0.55 * pow(mu, 0.5);
  vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.86, 0.55), gran) * limb;
  gl_FragColor = vec4(c * (3.2 * (1.0 - uDim) + 0.25), 1.0);
  ${FRAG_TAIL}
}`;

const SUN_VERT = EARTH_VERT;

export interface Sun {
  group: THREE.Group;
  /** 0 bright, 1 the swarm has caught nearly all its light. */
  dim: { value: number };
  update(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** The Sun at a radius in scene units, with a glow that scales with it. */
export function makeSun(ctx: KindContext, radius: number): Sun {
  const T = ctx.three;
  const geo = new T.SphereGeometry(radius, 64, 32);
  const uniforms = { uTime: { value: 0 }, uDim: { value: 0 }, uCam: { value: new T.Vector3() } };
  const mat = new T.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms });
  const body = new T.Mesh(geo, mat);
  const glowTex = glowTexture(ctx);
  const glowMat = new T.SpriteMaterial({
    map: glowTex,
    color: lin(ctx, "#ffb46b", 1.4),
    blending: T.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const glow = new T.Sprite(glowMat);
  glow.scale.setScalar(radius * 9);
  const group = new T.Group();
  group.add(body, glow);
  return {
    group,
    dim: uniforms.uDim,
    update(time, camera) {
      uniforms.uTime.value = time;
      camera.getWorldPosition(uniforms.uCam.value);
      glowMat.opacity = 1 - 0.85 * uniforms.uDim.value;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      glowMat.dispose();
    },
  };
}

let glowTex: THREE.Texture | undefined;
/** A soft round falloff, for glows and point sprites. */
export function glowTexture(ctx: KindContext): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.12, "rgba(255,255,255,0.55)");
  r.addColorStop(0.35, "rgba(255,255,255,0.12)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = new ctx.three.CanvasTexture(c);
  return glowTex;
}

/** A textured, lit sphere: the Moon or Mercury. */
export function makeRock(
  ctx: KindContext,
  name: "moon.jpg" | "mercury.jpg",
  radius: number,
  sun: THREE.Vector3,
): { mesh: THREE.Mesh; update(camera: THREE.Camera): void; dispose(): void } {
  const T = ctx.three;
  const geo = new T.SphereGeometry(radius, 96, 48);
  const uniforms = { uMap: { value: map(ctx, name) }, uSun: { value: sun.clone() } };
  const mat = new T.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform sampler2D uMap;
      uniform vec3 uSun;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vWorld;
      void main() {
        vec3 c = texture2D(uMap, vUv).rgb;
        float mu = max(dot(normalize(vN), normalize(uSun - vWorld)), 0.0);
        gl_FragColor = vec4(c * (mu * 1.3 + 0.02), 1.0);
        ${FRAG_TAIL}
      }`,
    uniforms,
  });
  const mesh = new T.Mesh(geo, mat);
  return {
    mesh,
    update() {
      uniforms.uSun.value.copy(sun);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** The Milky Way and the stars, on a sphere far behind everything. */
export function makeSky(ctx: KindContext, radius: number): { mesh: THREE.Mesh; dispose(): void } {
  const T = ctx.three;
  const geo = new T.SphereGeometry(radius, 48, 24);
  const mat = new T.ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(uMap, vec2(1.0 - vUv.x, vUv.y)).rgb;
        gl_FragColor = vec4(c * c * 0.55, 1.0);
        ${FRAG_TAIL}
      }`,
    uniforms: { uMap: { value: map(ctx, "stars.jpg") } },
    side: T.BackSide,
    depthWrite: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
