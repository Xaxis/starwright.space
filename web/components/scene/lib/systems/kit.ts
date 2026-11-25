/**
 * Small pieces the systems kinds (field, network, replicator, compute) share: easing, the story's
 * beats spaced evenly, a camera on a sphere around a target, and prefix sums that give the centre
 * and spread of the first k of a set of points, so a camera can frame a growing crowd.
 */
import type { Beat, KindContext, View } from "../../types.ts";

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 before a, 1 after b, smooth between. */
export const ramp = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Between two distances that may be powers of ten apart, evenly in their logarithm. */
export const logMix = (a: number, b: number, t: number) =>
  Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

/** The story the page passed, spaced evenly from 0 to 1. */
export function storyBeats(ctx: KindContext): Beat[] {
  const raw = (ctx.data as { beats?: Omit<Beat, "at">[] } | undefined)?.beats ?? [];
  return raw.map((b, i) => ({ ...b, at: raw.length > 1 ? i / (raw.length - 1) : 0 }));
}

export type V3 = [number, number, number];

/**
 * A camera d from the target, at an azimuth (radians from +x toward +z) and an elevation above
 * the horizontal. The reader may zoom between near and far shares of d.
 */
export function orbitView(
  target: V3,
  d: number,
  az: number,
  el: number,
  near = 0.25,
  far = 4,
): View {
  const c = Math.cos(el);
  return {
    position: [
      target[0] + d * c * Math.cos(az),
      target[1] + d * Math.sin(el),
      target[2] + d * c * Math.sin(az),
    ],
    target,
    near: d * near,
    far: d * far,
  };
}

/** A whole number with thousands separators: 1,024. */
export const grouped = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * The centre and spread of the first k points of a list (x, y, z triples), for any k, from prefix
 * sums built once.
 */
export function crowd(xyz: Float32Array | number[]): (k: number) => { centre: V3; radius: number } {
  const n = Math.floor(xyz.length / 3);
  const sx = new Float64Array(n + 1);
  const sy = new Float64Array(n + 1);
  const sz = new Float64Array(n + 1);
  const sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const x = xyz[i * 3] as number;
    const y = xyz[i * 3 + 1] as number;
    const z = xyz[i * 3 + 2] as number;
    sx[i + 1] = (sx[i] as number) + x;
    sy[i + 1] = (sy[i] as number) + y;
    sz[i + 1] = (sz[i] as number) + z;
    sq[i + 1] = (sq[i] as number) + x * x + y * y + z * z;
  }
  return (kf: number) => {
    const k = Math.max(1, Math.min(n, Math.round(kf)));
    const cx = (sx[k] as number) / k;
    const cy = (sy[k] as number) / k;
    const cz = (sz[k] as number) / k;
    const ms = (sq[k] as number) / k - (cx * cx + cy * cy + cz * cz);
    return { centre: [cx, cy, cz], radius: Math.sqrt(Math.max(0, ms)) };
  };
}

/** The camera's distance from what it looks at: the engine sets near to 0.002 of it. */
export const viewDistance = (camera: { near: number }) => camera.near * 500;
