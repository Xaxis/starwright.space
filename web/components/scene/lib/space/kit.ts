/**
 * Small tools the space kinds share: reading params, spacing the story's beats, easing, a camera
 * that flies a list of shots along the story, the star sky kept behind everything, and placing
 * things on a sphere.
 */
import type * as THREE from "three";
import type { Beat, KindContext, View } from "../../types.ts";
import { makeSky } from "../bodies.ts";

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, smooth between. */
export const ramp = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};

/** A share param, 0 to 1; "{id}" values arrive already replaced by numbers. */
export function share(ctx: KindContext, key: string, fallback: number): number {
  const v = ctx.params[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? clamp01(n) : fallback;
}

export function num(
  ctx: KindContext,
  key: string,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const v = ctx.params[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function flag(ctx: KindContext, key: string, fallback: boolean): boolean {
  const v = ctx.params[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export function choice<T extends string>(
  ctx: KindContext,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const v = ctx.params[key];
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** The page's beats, evenly spaced along the story. */
export function storyBeats(ctx: KindContext): Beat[] {
  const raw = (ctx.data as { beats?: Omit<Beat, "at">[] } | undefined)?.beats ?? [];
  return raw.map((b, i) => ({ ...b, at: raw.length > 1 ? i / (raw.length - 1) : 0 }));
}

/**
 * Growth from the first real unit to the end state: a share that starts at `first` and reaches 1
 * at the end of the story, quickening as it goes, as a fleet does.
 */
export const grow = (p: number, first: number) => first + (1 - first) * clamp01(p) ** 1.7;

/** One camera position along the story: distance from the target, azimuth and elevation (radians). */
export interface Shot {
  at: number;
  d: number;
  az: number;
  el: number;
  target: [number, number, number];
}

/**
 * A camera that rests on each shot and glides between them: distance eases in log space so a
 * pull back from a close-up to the whole system feels even. `frame` may turn the result (a camera
 * that rides with a turning planet).
 */
export function shotPath(
  T: typeof THREE,
  shots: Shot[],
  frame?: (pos: THREE.Vector3, target: THREE.Vector3) => void,
): (p: number) => View {
  const pos = new T.Vector3();
  const tgt = new T.Vector3();
  const tb = new T.Vector3();
  const sorted = [...shots].sort((a, b) => a.at - b.at);
  return (p) => {
    let i = 0;
    while (i < sorted.length - 2 && p > (sorted[i + 1] as Shot).at) i++;
    const A = sorted[i] as Shot;
    const B = sorted[Math.min(i + 1, sorted.length - 1)] as Shot;
    const k = B.at > A.at ? ramp(p, A.at, B.at) : 0;
    const d = Math.exp(mix(Math.log(A.d), Math.log(B.d), k));
    const az = mix(A.az, B.az, k);
    const el = mix(A.el, B.el, k);
    tgt.set(...A.target).lerp(tb.set(...B.target), k);
    pos
      .set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
      .multiplyScalar(d)
      .add(tgt);
    frame?.(pos, tgt);
    return {
      position: [pos.x, pos.y, pos.z],
      target: [tgt.x, tgt.y, tgt.z],
      near: d * 0.25,
      far: d * 6,
    };
  };
}

/** The stars, added to the scene (makeSky keeps them on the camera and inside its far plane). */
export function makeBackdrop(ctx: KindContext): { dispose(): void } {
  const sky = makeSky(ctx, 1);
  ctx.scene.add(sky.mesh);
  return sky;
}

/** A unit direction from longitude and latitude (degrees), matching the equirectangular maps. */
export function ll(T: typeof THREE, lon: number, lat: number, r = 1): THREE.Vector3 {
  const a = (lon * Math.PI) / 180;
  const b = (lat * Math.PI) / 180;
  return new T.Vector3(
    Math.cos(b) * Math.cos(a) * r,
    Math.sin(b) * r,
    -Math.cos(b) * Math.sin(a) * r,
  );
}

/** A matrix that stands an object on a sphere: its +y along `normal`, turned by `heading`. */
export function standOn(
  T: typeof THREE,
  normal: THREE.Vector3,
  radius: number,
  heading: number,
  scale: number | THREE.Vector3,
  out = new T.Matrix4(),
): THREE.Matrix4 {
  const n = normal.clone().normalize();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), n);
  q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), heading));
  const s = typeof scale === "number" ? new T.Vector3(scale, scale, scale) : scale;
  return out.compose(n.multiplyScalar(radius), q, s);
}

/** Pixels per scene unit at distance 1, for sizing points the way meshes are sized. */
export function pixelScale(ctx: KindContext, size: THREE.Vector2): number {
  ctx.renderer.getSize(size);
  const fov = (ctx.camera.fov * Math.PI) / 180;
  return (size.y * ctx.renderer.getPixelRatio()) / (2 * Math.tan(fov / 2));
}

/** Directional sunlight and a faint fill, for the kinds' lit meshes. */
export function addSunlight(
  ctx: KindContext,
  dir: THREE.Vector3,
  strength = 3,
  fill = 0.12,
): { sun: THREE.DirectionalLight; fill: THREE.HemisphereLight } {
  const T = ctx.three;
  const sun = new T.DirectionalLight("#fff4e0", strength);
  sun.position.copy(dir).normalize().multiplyScalar(10);
  const hemi = new T.HemisphereLight("#9fb6ff", "#20140c", fill);
  ctx.scene.add(sun, sun.target, hemi);
  return { sun, fill: hemi };
}

/**
 * Keep a far body (the Sun seen from Mercury, the Earth from the Moon) inside the camera's far
 * plane: it moves in along its direction and shrinks in step, so its apparent size stays true.
 */
export function farAway(
  ctx: KindContext,
  obj: THREE.Object3D,
  dir: THREE.Vector3,
  dist: number,
  scale = 1,
): () => void {
  const d0 = dir.clone().normalize();
  return () => {
    const d = Math.min(dist, ctx.camera.far * 0.4);
    obj.position.copy(d0).multiplyScalar(d);
    obj.scale.setScalar((scale * d) / dist);
  };
}
