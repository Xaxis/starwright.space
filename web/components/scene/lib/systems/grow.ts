/**
 * Many copies of one thing, appearing as they are built. Each copy of an InstancedMesh carries a
 * window (aGrow: when it starts, how long it takes) on a clock the kind sets (uBuilt); the vertex
 * shader grows it from the ground while the clock is inside its window, glows it in the accent
 * colour while it is being built, and switches its lights on once it is done. The GPU does all of
 * this, so a field of twenty thousand panels costs one draw call per part and no work per frame.
 *
 * Materials are three's standard ones (so they keep log depth, fog and the environment's
 * reflections), patched with onBeforeCompile; what differs between them sits in their defines, which
 * three folds into each program's cache key.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";

export interface GrowClock {
  uBuilt: { value: number };
  uTime: { value: number };
  /** The colour a copy glows while it is being built. */
  cBuild: { value: THREE.Color };
}

export function makeClock(ctx: KindContext): GrowClock {
  return {
    uBuilt: { value: 0 },
    uTime: { value: 0 },
    cBuild: { value: new ctx.three.Color(ctx.colour).multiplyScalar(1.5) },
  };
}

export interface Look {
  colour: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  /**
   * rise grows a copy up from the ground; pop scales it out from its base; print builds it layer
   * by layer from the ground, a glowing line at the layer being laid.
   */
  grow?: "rise" | "pop" | "print";
  /** The unit's height, metres, for print. */
  height?: number;
  /** Emissive only once the copy is finished (its lights come on). */
  lights?: boolean;
  /** How much the lights flicker, 0 to 1. */
  flicker?: number;
  /** Turning parts: rotor blades, fans. */
  spin?: { pivot: [number, number, number]; axis: "x" | "y" | "z"; speed: number };
  /** Gentle bobbing on water, metres. */
  bob?: number;
  /** How strongly a copy glows while it is being built. */
  buildGlow?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
}

const HEAD_V = /* glsl */ `
attribute vec2 aGrow;
attribute float aSeed;
uniform float uBuilt;
uniform float uTime;
varying float vBuilding;
varying float vLit;
varying float vSeed;
varying float vLocalY;
varying float vCut;
vec3 gSpin(vec3 v, float a) {
  float c = cos(a), s = sin(a);
#if defined(SPIN_X)
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
#elif defined(SPIN_Y)
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
#else
  return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
#endif
}
`;

const NORMAL_V = /* glsl */ `
vec3 objectNormal = vec3(normal);
float gOn = smoothstep(aGrow.x, aGrow.x + aGrow.y, uBuilt);
#ifdef GROW_SPIN
float gAng = uTime * SPIN_SPEED + aSeed * 6.2832;
objectNormal = gSpin(objectNormal, gAng);
#endif
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

const BEGIN_V = /* glsl */ `
vec3 transformed = vec3(position);
#ifdef GROW_SPIN
transformed = gSpin(transformed - SPIN_PIVOT, gAng) + SPIN_PIVOT;
#endif
vLocalY = transformed.y;
vCut = 1e6;
#if defined(GROW_RISE)
transformed.y *= gOn;
transformed.xz *= mix(0.85, 1.0, gOn) * step(0.0005, gOn);
#elif defined(GROW_PRINT)
transformed *= step(0.0005, gOn);
vCut = gOn > 0.999 ? 1e6 : gOn * GROW_PRINT * 1.02;
#else
transformed *= gOn * (1.0 + 0.18 * sin(gOn * 3.14159));
#endif
#ifdef GROW_BOB
#ifdef USE_INSTANCING
vec3 gAt = instanceMatrix[3].xyz;
#else
vec3 gAt = vec3(0.0);
#endif
transformed.y += sin(uTime * 0.9 + gAt.x * 0.07 + gAt.z * 0.05) * GROW_BOB;
#endif
vBuilding = gOn * (1.0 - gOn) * 4.0;
vLit = smoothstep(aGrow.x + aGrow.y, aGrow.x + aGrow.y * 1.6 + 1e-4, uBuilt);
vSeed = aSeed;
`;

const HEAD_F = /* glsl */ `
uniform float uTime;
uniform vec3 cBuild;
varying float vBuilding;
varying float vLit;
varying float vSeed;
varying float vLocalY;
varying float vCut;
`;

const CLIP_F = /* glsl */ `
#include <clipping_planes_fragment>
if (vLocalY > vCut) discard;
`;

const EMISSIVE_F = /* glsl */ `
#include <emissivemap_fragment>
#ifdef GROW_LIGHTS
totalEmissiveRadiance *= vLit * (1.0 - GROW_FLICKER * (0.5 + 0.5 * sin(uTime * (1.1 + vSeed * 2.3) + vSeed * 40.0)));
#endif
#ifdef GROW_PRINT
float gLayer = 1.0 - smoothstep(0.0, GROW_PRINT * 0.05 + 0.04, vCut - vLocalY);
totalEmissiveRadiance += cBuild * GROW_GLOW * (gLayer * 1.7 * step(vCut, 1e5) + vBuilding * 0.08);
#else
totalEmissiveRadiance += cBuild * vBuilding * GROW_GLOW;
#endif
`;

/** A standard material that grows per instance on the clock. */
export function growMaterial(
  ctx: KindContext,
  clock: GrowClock,
  look: Look,
): THREE.MeshStandardMaterial {
  const T = ctx.three;
  const mat = new T.MeshStandardMaterial({
    color: look.colour,
    metalness: look.metalness ?? 0.2,
    roughness: look.roughness ?? 0.6,
    emissive: look.emissive ?? "#000000",
    emissiveIntensity: look.emissiveIntensity ?? 1,
    map: look.map ?? null,
    emissiveMap: look.emissiveMap ?? null,
    transparent: look.transparent ?? false,
    opacity: look.opacity ?? 1,
    depthWrite: look.depthWrite ?? true,
    side: look.side ?? (look.grow === "print" ? T.DoubleSide : T.FrontSide),
  });
  const defines: Record<string, string> = {
    GROW_GLOW: (look.buildGlow ?? 1).toFixed(3),
    GROW_FLICKER: (look.flicker ?? 0.15).toFixed(3),
  };
  if ((look.grow ?? "rise") === "rise") defines.GROW_RISE = "";
  if (look.grow === "print") defines.GROW_PRINT = (look.height ?? 1).toFixed(3);
  if (look.lights) defines.GROW_LIGHTS = "";
  if (look.bob) defines.GROW_BOB = look.bob.toFixed(3);
  if (look.spin) {
    defines.GROW_SPIN = "";
    defines[`SPIN_${look.spin.axis.toUpperCase()}`] = "";
    defines.SPIN_SPEED = look.spin.speed.toFixed(4);
    defines.SPIN_PIVOT = `vec3(${look.spin.pivot.map((v) => v.toFixed(3)).join(",")})`;
  }
  mat.defines = defines;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBuilt = clock.uBuilt;
    shader.uniforms.uTime = clock.uTime;
    shader.uniforms.cBuild = clock.cBuild;
    shader.vertexShader = `${HEAD_V}\n${shader.vertexShader}`
      .replace("#include <beginnormal_vertex>", NORMAL_V)
      .replace("#include <begin_vertex>", BEGIN_V);
    shader.fragmentShader = `${HEAD_F}\n${shader.fragmentShader}`
      .replace("#include <emissivemap_fragment>", EMISSIVE_F)
      .replace("#include <clipping_planes_fragment>", CLIP_F);
  };
  mat.customProgramCacheKey = () => `grow:${JSON.stringify(defines)}`;
  return mat;
}

/** One part of a unit: its geometry (origin on the ground at the unit's centre) and its look. */
export interface Part {
  geo: THREE.BufferGeometry;
  look: string;
  /** Which set of matrices it uses: most parts stand with the unit; aimed parts (mirrors) tilt. */
  frame?: "base" | "aim";
}

export interface Crowd {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  dispose(): void;
}

/**
 * Instanced copies of a unit's parts. matrices: 16 floats per copy (and aim, if any part is aimed);
 * grow: 2 per copy (start, length on the clock); seed: 1 per copy, 0 to 1.
 */
export function makeCrowd(
  ctx: KindContext,
  parts: Part[],
  looks: Record<string, THREE.Material>,
  matrices: Float32Array,
  grow: Float32Array,
  seed: Float32Array,
  aim?: Float32Array,
): Crowd {
  const T = ctx.three;
  const n = seed.length;
  const group = new T.Group();
  const growAttr = new T.InstancedBufferAttribute(grow, 2);
  const seedAttr = new T.InstancedBufferAttribute(seed, 1);
  const meshes: THREE.InstancedMesh[] = [];
  for (const part of parts) {
    const mat = looks[part.look];
    if (!mat) continue;
    const geo = part.geo.clone();
    geo.setAttribute("aGrow", growAttr);
    geo.setAttribute("aSeed", seedAttr);
    const mesh = new T.InstancedMesh(geo, mat, n);
    const src = part.frame === "aim" && aim ? aim : matrices;
    (mesh.instanceMatrix.array as Float32Array).set(src.subarray(0, n * 16));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    group,
    meshes,
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    },
  };
}

/** A canvas texture, drawn once. */
export function canvasTexture(
  ctx: KindContext,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  srgb = true,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  const tex = new ctx.three.CanvasTexture(c);
  if (srgb) tex.colorSpace = ctx.three.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
