/**
 * A sky for scenes on the ground, at the blue hour: deep blue overhead, the Sun's glow low on one
 * side, the pink band and the dusky blue of Earth's shadow on the other, and stars where the air is
 * thin or the night dark. It follows the camera, and it lights the scene: a blurred copy of it is
 * the environment that glass and metal reflect, its colours set the sunlight and the fill, and the
 * ground fades into its horizon in every direction (the same GLSL colours both), so there is no seam.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { makeEarth, map } from "../bodies.ts";
import { EQUIRECT, FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../glsl.ts";

export interface SkyPreset {
  zenith: string;
  /** The horizon below the Sun, and opposite it. */
  sunward: string;
  anti: string;
  /** The pink band above the horizon opposite the Sun. */
  belt: string;
  /** Below the horizon, where the dome shows past the ground's edge. */
  ground: string;
  sun: string;
  /** The Sun's direction: azimuth (radians from +x toward +z) and elevation. */
  sunAz: number;
  sunEl: number;
  /** How strong the Sun's glow is in the air, 0 on an airless world. */
  glow: number;
  stars: number;
  /** Strength of direct sunlight and of the sky's fill. */
  light: number;
  fill: number;
  /** Fog distance as a multiple of the camera's distance, and its floor in metres. */
  fog: number;
  fogMin: number;
}

/** Blue-hour skies for each setting; the Sun sits behind the usual camera, so glass reflects it. */
export const SKIES: Record<string, SkyPreset> = {
  desert: {
    zenith: "#061230",
    sunward: "#ff9455",
    anti: "#4a4566",
    belt: "#b07088",
    ground: "#120e14",
    sun: "#ffb27a",
    sunAz: 1.75,
    sunEl: 0.06,
    glow: 1,
    stars: 0.35,
    light: 1.9,
    fill: 1.0,
    fog: 26,
    fogMin: 5000,
  },
  sea: {
    zenith: "#071a40",
    sunward: "#ffa066",
    anti: "#3f4f74",
    belt: "#b0789a",
    ground: "#06121c",
    sun: "#ffc08a",
    sunAz: 1.75,
    sunEl: 0.08,
    glow: 1,
    stars: 0.25,
    light: 2.0,
    fill: 1.0,
    fog: 26,
    fogMin: 5000,
  },
  plain: {
    zenith: "#081634",
    sunward: "#ffa260",
    anti: "#4b4a6a",
    belt: "#a87390",
    ground: "#10120e",
    sun: "#ffbb80",
    sunAz: 1.75,
    sunEl: 0.07,
    glow: 0.9,
    stars: 0.3,
    light: 1.9,
    fill: 1.0,
    fog: 24,
    fogMin: 5000,
  },
  ice: {
    zenith: "#0a1838",
    sunward: "#ffae84",
    anti: "#5a6a92",
    belt: "#c08aa8",
    ground: "#1a2230",
    sun: "#ffcfae",
    sunAz: 1.75,
    sunEl: 0.05,
    glow: 0.9,
    stars: 0.4,
    light: 1.7,
    fill: 1.1,
    fog: 28,
    fogMin: 6000,
  },
  regolith: {
    zenith: "#000000",
    sunward: "#06070b",
    anti: "#030305",
    belt: "#030305",
    ground: "#010102",
    sun: "#fff6ea",
    sunAz: 1.9,
    sunEl: 0.2,
    glow: 0,
    stars: 1,
    light: 2.3,
    fill: 0.15,
    fog: 90,
    fogMin: 12000,
  },
  city: {
    zenith: "#03050d",
    sunward: "#3a2a3a",
    anti: "#2a2236",
    belt: "#3a2838",
    ground: "#0c0a10",
    sun: "#9fb2ff",
    sunAz: 1.9,
    sunEl: 0.5,
    glow: 0.15,
    stars: 0.35,
    light: 0.45,
    fill: 0.6,
    fog: 22,
    fogMin: 4000,
  },
  void: {
    zenith: "#04060c",
    sunward: "#1a2030",
    anti: "#121725",
    belt: "#141a28",
    ground: "#07080c",
    sun: "#c8d4ff",
    sunAz: 1.9,
    sunEl: 0.7,
    glow: 0.2,
    stars: 0,
    light: 1.6,
    fill: 0.9,
    fog: 9,
    fogMin: 60,
  },
  medium: {
    zenith: "#021216",
    sunward: "#0b3a40",
    anti: "#072a30",
    belt: "#08303a",
    ground: "#031417",
    sun: "#bff6ff",
    sunAz: 1.9,
    sunEl: 1.1,
    glow: 0.3,
    stars: 0,
    light: 1.4,
    fill: 1.0,
    fog: 7,
    fogMin: 20,
  },
  night: {
    zenith: "#02040c",
    sunward: "#262036",
    anti: "#1c1a2c",
    belt: "#241c30",
    ground: "#0a0a10",
    sun: "#9fb4ff",
    sunAz: 1.9,
    sunEl: 0.6,
    glow: 0.1,
    stars: 0.8,
    light: 0.4,
    fill: 0.5,
    fog: 30,
    fogMin: 6000,
  },
};

/** The sky's colour in a direction; the dome and the ground's haze both call it. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 cZenith;
uniform vec3 cSunward;
uniform vec3 cAnti;
uniform vec3 cBelt;
uniform vec3 cGround;
uniform vec3 cSun;
uniform vec3 uSunDir;
uniform float uGlow;
vec3 horizonAt(vec3 d) {
  vec2 a = normalize(d.xz + 1e-6);
  vec2 s = normalize(uSunDir.xz + 1e-6);
  float toward = 0.5 + 0.5 * dot(a, s);
  return mix(cAnti, cSunward, pow(toward, 2.2));
}
vec3 skyColour(vec3 d) {
  float h = d.y;
  vec3 hor = horizonAt(d);
  vec2 a = normalize(d.xz + 1e-6);
  vec2 s = normalize(uSunDir.xz + 1e-6);
  float away = clamp(-dot(a, s), 0.0, 1.0);
  vec3 c = mix(hor, cZenith, pow(clamp(h * 2.2, 0.0, 1.0), 0.55));
  // The belt of Venus: a pink band a few degrees up, opposite the Sun.
  c = mix(c, cBelt, away * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.08, 0.3, h)) * 0.75);
  float sd = max(dot(d, uSunDir), 0.0);
  c += cSun * uGlow * (pow(sd, 16.0) * 0.8 + pow(sd, 4.0) * 0.25) * (1.0 - smoothstep(0.0, 0.6, h) * 0.6);
  c = mix(c, cGround, smoothstep(0.0, -0.06, h));
  return c;
}
`;

export interface Sky {
  mesh: THREE.Mesh;
  preset: SkyPreset;
  /** Unit vector toward the Sun. */
  sunDir: THREE.Vector3;
  /** The uniforms SKY_GLSL reads, to share with other materials. */
  uniforms: Record<string, { value: unknown }>;
  /** Keep the dome around the camera, sized to sit inside the far plane. */
  update(camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

const SKY_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uStars;
uniform sampler2D uStarMap;
varying vec3 vDir;
${SKY_GLSL}
${EQUIRECT}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyColour(d);
  float sd = max(dot(d, uSunDir), 0.0);
  c += cSun * smoothstep(0.9996, 0.99985, sd) * 30.0;
  vec3 st = texture2D(uStarMap, equirect(d)).rgb;
  c += st * st * uStars * smoothstep(0.02, 0.35, d.y);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

const SKY_VERT = /* glsl */ `
${VERT_HEAD}
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_TAIL}
}`;

export function makeGroundSky(ctx: KindContext, preset: SkyPreset): Sky {
  const T = ctx.three;
  const sunDir = new T.Vector3(
    Math.cos(preset.sunEl) * Math.cos(preset.sunAz),
    Math.sin(preset.sunEl),
    Math.cos(preset.sunEl) * Math.sin(preset.sunAz),
  );
  const geo = new T.SphereGeometry(1, 48, 24);
  const uniforms = {
    cZenith: { value: new T.Color(preset.zenith) },
    cSunward: { value: new T.Color(preset.sunward) },
    cAnti: { value: new T.Color(preset.anti) },
    cBelt: { value: new T.Color(preset.belt) },
    cGround: { value: new T.Color(preset.ground) },
    cSun: { value: new T.Color(preset.sun) },
    uSunDir: { value: sunDir },
    uGlow: { value: preset.glow },
  };
  const mat = new T.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      ...uniforms,
      uStars: { value: preset.stars },
      uStarMap: { value: map(ctx, "stars.jpg") },
    },
    side: T.BackSide,
    depthWrite: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    preset,
    sunDir,
    uniforms,
    update(camera) {
      mesh.position.copy(camera.position);
      // The engine sets near to 0.002 of the camera's distance and far to a million times near.
      mesh.scale.setScalar(camera.near * 3e5);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export interface Lighting {
  sun: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  fog: THREE.Fog;
  /** Fog that keeps the horizon soft at any height. */
  update(distance: number): void;
  dispose(): void;
}

/**
 * Sunlight, sky fill and fog from a sky, added to the kind's scene. The environment map is the sky
 * itself, blurred: what panels, mirrors and metal reflect.
 */
export function lightFromSky(ctx: KindContext, sky: Sky): Lighting {
  const T = ctx.three;
  const p = sky.preset;
  const sun = new T.DirectionalLight(p.sun, p.light);
  sun.position.copy(sky.sunDir).multiplyScalar(100);
  ctx.scene.add(sun);
  const hor = new T.Color(p.anti).lerp(new T.Color(p.sunward), 0.35);
  const fill = new T.HemisphereLight(new T.Color(p.zenith).lerp(hor, 0.6), p.ground, p.fill * 0.6);
  ctx.scene.add(fill);
  // Standard materials fog to one colour: the horizon the camera usually faces, opposite the Sun.
  const fog = new T.Fog(new T.Color(p.anti).lerp(new T.Color(p.sunward), 0.15), 1000, 10000);
  ctx.scene.fog = fog;
  let env: THREE.WebGLRenderTarget | undefined;
  try {
    const envScene = new T.Scene();
    const dome = new T.Mesh(sky.mesh.geometry, sky.mesh.material);
    dome.scale.setScalar(50);
    envScene.add(dome);
    const pmrem = new T.PMREMGenerator(ctx.renderer);
    env = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    pmrem.dispose();
    ctx.scene.environment = env.texture;
    ctx.scene.environmentIntensity = 0.6;
  } catch {
    env = undefined;
  }
  return {
    sun,
    fill,
    fog,
    update(distance) {
      fog.far = Math.max(p.fogMin, distance * p.fog);
      fog.near = fog.far * 0.1;
    },
    dispose() {
      env?.dispose();
      ctx.scene.environment = null;
      ctx.scene.fog = null;
    },
  };
}

/**
 * Earth hanging in an airless sky, about two degrees across as it is from the Moon, lit from the
 * sky's Sun. It rides with the camera like the dome, so it stays at its place in the sky.
 */
export function makeSkyEarth(
  ctx: KindContext,
  sky: Sky,
  az: number,
  el: number,
): {
  group: THREE.Group;
  update(time: number, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
} {
  const T = ctx.three;
  const earth = makeEarth(ctx, { sun: sky.sunDir.clone().multiplyScalar(1e12) });
  const dir = new T.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  return {
    group: earth.group,
    update(time, camera) {
      const d = camera.near * 1e5;
      earth.group.position.copy(camera.position).addScaledVector(dir, d);
      earth.group.scale.setScalar(d * 0.0166);
      earth.update(time, camera);
      earth.uniforms.uSun.value.copy(sky.sunDir).multiplyScalar(1e12);
    },
    dispose() {
      earth.dispose();
    },
  };
}
