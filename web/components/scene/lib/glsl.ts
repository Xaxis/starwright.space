/**
 * GLSL shared by the scenes. Every shader here writes logarithmic depth (the engine's renderer
 * uses it so a city's lights and the whole Sun share one depth buffer), so each vertex shader
 * includes VERT_HEAD and ends with VERT_TAIL, and each fragment shader the same with FRAG_*.
 *
 * House rule: every pow() and sqrt() base starts with max( or clamp(, so no driver sees a negative.
 */

export const VERT_HEAD = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
export const VERT_TAIL = /* glsl */ `
#include <logdepthbuf_vertex>
`;
export const FRAG_HEAD = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;
export const FRAG_TAIL = /* glsl */ `
#include <logdepthbuf_fragment>
`;

/** Hashes and value noise, cheap enough for every pixel. */
export const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;

/** Equirectangular map coordinates of a unit direction: longitude -180 at the left edge. */
export const EQUIRECT = /* glsl */ `
vec2 equirect(vec3 n) {
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  return vec2(lon / 6.28318530718 + 0.5, lat / 3.14159265359 + 0.5);
}
`;
