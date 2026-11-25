/**
 * The skin of a rotating habitat, drawn twice from one geometry: the hull outside (panelled metal
 * and window strips, lit by the Sun) and the land inside (fields, forest, water and towns under
 * daylight from the windows). Both share a cutaway, a window opened toward the reader so the
 * inside shows, and a build mask, so the hull grows section by section along the story.
 *
 * Shapes, each spinning about its own y axis:
 * 0 cylinder (CylinderGeometry, open): three land strips and three window strips;
 * 1 torus (TorusGeometry turned flat): land on the floor of the tube, windows overhead;
 * 2 sphere (SphereGeometry): a land band round the equator, windows at the poles;
 * 3 floor (a disc on the ground, under a dome): all land.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { lin } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";

export type ShellShape = 0 | 1 | 2 | 3;

const VERT = /* glsl */ `
${VERT_HEAD}
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vPos = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const COMMON = /* glsl */ `
uniform float uShape;
uniform vec3 uCut;      // the cut's direction, in the shell's own frame
uniform float uCutCos;  // the cut's half-width, as a cosine (above 1: no cut)
uniform float uCutLen;  // how far along the axis the cut runs (cylinder)
uniform float uBuilt;   // share of the shell built
uniform float uSize;    // half-length (cylinder), ring radius (torus) or radius (sphere)
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;
float cutEdge(vec3 p) {
  if (uCutCos > 1.0) return -1.0;
  if (uShape < 0.5) {
    float a = dot(normalize(p.xz), normalize(uCut.xz)) - uCutCos;
    float b = uCutLen - abs(p.y);
    return min(a * 3.0, b / uSize);
  }
  if (uShape < 1.5) {
    float a = dot(normalize(p.xz), normalize(uCut.xz)) - uCutCos;
    return min(a * 3.0, p.y + 0.01);
  }
  if (uShape < 2.5) return (dot(normalize(p), normalize(uCut)) - uCutCos) * 3.0;
  return -1.0;
}
// How far inside the built part this point is, in the shell's units (large once it is whole).
float buildEdge(vec3 p) {
  if (uBuilt > 0.999) return 1e3;
  if (uShape < 0.5) return uSize * uBuilt - abs(p.y);
  if (uShape < 1.5) return (uBuilt - (atan(p.z, p.x) / 6.2831853 + 0.5)) * 6.2831853 * uSize;
  if (uShape < 2.5) return (1.5708 * uBuilt - abs(asin(clamp(p.y / max(length(p), 1e-6), -1.0, 1.0)))) * uSize;
  return 1e3;
}
bool unbuilt(vec3 p) {
  if (uShape < 0.5) return abs(p.y) > uSize * uBuilt + 1e-4;
  if (uShape < 1.5) return atan(p.z, p.x) / 6.2831853 + 0.5 > uBuilt;
  if (uShape < 2.5) return abs(asin(clamp(p.y / max(length(p), 1e-6), -1.0, 1.0))) > 1.5708 * uBuilt;
  return false;
}
// 1 where this point of the skin is a window, 0 where it is land.
float windowAt(vec2 uv, vec3 p) {
  if (uShape < 0.5) return step(0.5, fract(uv.x * 3.0));
  if (uShape < 1.5) return step(0.15, min(uv.y, 1.0 - uv.y));
  if (uShape < 2.5) return step(0.62, abs(asin(clamp(p.y / max(length(p), 1e-6), -1.0, 1.0))) / 1.5708);
  return 0.0;
}
`;

const OUTER = /* glsl */ `
${FRAG_HEAD}
${COMMON}
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uLights;
uniform float uTime;
uniform vec3 cAccent;
${NOISE}
void main() {
  if (unbuilt(vPos)) discard;
  float edge = cutEdge(vPos);
  if (edge > 0.0) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(uSun);
  vec3 V = normalize(uCam - vW);
  float mu = max(dot(N, L), 0.0);
  vec2 g = vUv * vec2(160.0, 64.0);
  vec2 gf = fract(g);
  float seam = max(step(0.96, gf.x), step(0.95, gf.y));
  vec3 base = vec3(0.16, 0.165, 0.175) * (0.85 + 0.25 * hash13(vec3(floor(g), 1.0)));
  base *= 1.0 - seam * 0.35;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.35 * step(0.0, dot(N, L));
  vec3 c = base * (mu * 1.2 + 0.03) + vec3(1.0, 0.95, 0.85) * spec;
  float win = windowAt(vUv, vPos);
  // Glass: black space in it, the Sun's glint, and the warm land light leaking out.
  vec3 glass = vec3(0.006, 0.01, 0.02) + vec3(1.0, 0.85, 0.6) * 0.05 * (0.4 + uLights);
  glass += vec3(0.7, 0.8, 1.0) * pow(max(dot(N, H), 0.0), 200.0) * 2.5;
  c = mix(c, glass, win);
  // The cut's rim, lit in the record's colour.
  c += cAccent * smoothstep(-0.03, 0.0, edge) * 1.4;
  // The construction front: a seam of welding light where the next section goes on.
  float be = buildEdge(vPos);
  float front = 1.0 - smoothstep(0.0, 0.02, be);
  float spark = step(0.93, hash13(vec3(floor(vUv * vec2(300.0, 120.0)), floor(uTime * 6.0))));
  c += (cAccent * 0.7 + vec3(1.0, 0.9, 0.7) * spark * 1.2) * front;
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

const INNER = /* glsl */ `
${FRAG_HEAD}
${COMMON}
uniform float uGreen;
uniform float uLights;
uniform float uTime;
uniform float uScale;   // cells across the land
${NOISE}
void main() {
  if (unbuilt(vPos)) discard;
  if (cutEdge(vPos) > 0.0) discard;
  float win = windowAt(vUv, vPos);
  // Land coordinates, about the same size of cell on every shape.
  vec2 q;
  if (uShape < 0.5) q = vec2(fract(vUv.x * 3.0) * 2.0 * uScale * 0.5, vUv.y * uScale * 3.0);
  else if (uShape < 1.5) q = vec2(vUv.x * uScale * 8.0, vUv.y * uScale * 0.6);
  else if (uShape < 2.5) q = vec2(vUv.x * uScale * 3.0, vUv.y * uScale * 1.5);
  else q = vUv * uScale;
  vec3 qp = vec3(q, uShape * 7.0);
  // Greening spreads in patches: each place has its own share at which it turns green.
  float turn = fbm(qp * 0.35 + 11.0);
  float grown = smoothstep(turn - 0.04, turn + 0.04, uGreen * 1.1);
  // Woods and lakes follow the lie of the land; a river winds along the length.
  float wood = smoothstep(0.52, 0.58, fbm(qp * 0.45 + 3.0));
  float lakeN = fbm(qp * 0.3 + 21.0);
  float along = uShape < 0.5 ? q.x : q.y;
  float across = uShape < 0.5 ? q.y : q.x;
  float river = 1.0 - smoothstep(0.08, 0.16, abs(along - uScale * 0.5 - 1.6 * sin(across * 0.21) - 0.8 * vnoise(qp * 0.2)));
  if (uShape > 0.5) river = 0.0;
  float water = max(smoothstep(0.28, 0.25, lakeN), river);
  // Fields: small strips of crops, each its own shade.
  vec2 fq = q * vec2(2.4, 1.2);
  vec2 cell = floor(fq);
  vec2 f = fract(fq);
  float h1 = hash13(vec3(cell, 3.0));
  float hedge = 1.0 - step(0.06, f.x) * step(f.x, 0.94) * step(0.08, f.y) * step(f.y, 0.92);
  vec3 crop = h1 < 0.3 ? vec3(0.08, 0.15, 0.035) : h1 < 0.55 ? vec3(0.13, 0.15, 0.05) : h1 < 0.75 ? vec3(0.05, 0.11, 0.035) : vec3(0.16, 0.13, 0.06);
  crop *= 0.85 + 0.2 * step(0.5, fract(f.y * 6.0));
  crop = mix(crop, vec3(0.03, 0.07, 0.025), hedge * 0.6);
  vec3 forest = vec3(0.018, 0.055, 0.022) * (0.75 + 0.5 * vnoise(qp * 6.0));
  vec3 land = mix(crop, forest, wood);
  vec3 bare = vec3(0.1, 0.09, 0.08) * (0.85 + 0.3 * vnoise(qp * 3.0));
  vec3 c = mix(bare, land, grown);
  c = mix(c, vec3(0.008, 0.03, 0.06) + vec3(0.02, 0.04, 0.05) * vnoise(qp * 4.0), water * smoothstep(0.1, 0.4, uGreen));
  // Towns: tight clusters of roofs that light up at night.
  float townN = smoothstep(0.66, 0.7, vnoise(qp * 0.6 + 40.0)) * (1.0 - water);
  vec2 rq = floor(q * 6.0);
  float roof = step(0.45, hash13(vec3(rq, 2.0))) * townN;
  c = mix(c, vec3(0.2, 0.18, 0.16) * (0.7 + 0.5 * hash13(vec3(rq, 4.0))), roof * step(0.01, uLights));
  // Daylight through the windows, and cloud shadows drifting over it.
  float cloud = smoothstep(0.64, 0.8, fbm(qp * 0.3 + vec3(uTime * 0.03, 0.0, 0.0)));
  float shade = smoothstep(0.64, 0.8, fbm(qp * 0.3 + vec3(uTime * 0.03 - 0.4, 0.3, 0.0)));
  c *= 1.7 * (1.0 - 0.35 * shade);
  c += vec3(1.0, 0.75, 0.42) * roof * uLights * step(0.6, hash13(vec3(rq, 5.0))) * 1.6;
  c = mix(c, vec3(0.75, 0.78, 0.82), cloud * 0.4 * step(0.05, uGreen));
  // Windows seen from inside: space, through fine mullions.
  vec2 m = fract(vUv * vec2(60.0, 20.0));
  float mull = max(step(0.95, m.x), step(0.97, m.y));
  vec3 sky = vec3(0.004, 0.007, 0.016) + vec3(0.12, 0.15, 0.2) * mull;
  c = mix(c, sky, win);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

export interface Shell {
  outer: THREE.Mesh;
  inner: THREE.Mesh;
  uniforms: {
    uBuilt: { value: number };
    uGreen: { value: number };
    uLights: { value: number };
    uTime: { value: number };
    uCut: { value: THREE.Vector3 };
    uCutCos: { value: number };
    uCutLen: { value: number };
    uSun: { value: THREE.Vector3 };
    uCam: { value: THREE.Vector3 };
  };
  /** Turn a world direction into the shell's frame for the cut, and keep the camera current. */
  aim(cutWorld: THREE.Vector3, camera: THREE.Camera): void;
  dispose(): void;
}

export function makeShell(
  ctx: KindContext,
  geo: THREE.BufferGeometry,
  shape: ShellShape,
  o: { size: number; scale: number; sun: THREE.Vector3 },
): Shell {
  const T = ctx.three;
  const uniforms = {
    uShape: { value: shape },
    uCut: { value: new T.Vector3(0, 0, 1) },
    uCutCos: { value: 2 },
    uCutLen: { value: o.size },
    uBuilt: { value: 1 },
    uSize: { value: o.size },
    uSun: { value: o.sun },
    uCam: { value: new T.Vector3() },
    uLights: { value: 0 },
    uGreen: { value: 0 },
    uTime: { value: 0 },
    uScale: { value: o.scale },
    cAccent: { value: lin(ctx, ctx.colour) },
  };
  const outerMat = new T.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: OUTER,
    uniforms,
    side: T.FrontSide,
  });
  const innerMat = new T.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: INNER,
    uniforms,
    side: T.BackSide,
  });
  const outer = new T.Mesh(geo, outerMat);
  const inner = new T.Mesh(geo, innerMat);
  const q = new T.Quaternion();
  return {
    outer,
    inner,
    uniforms,
    aim(cutWorld, camera) {
      outer.getWorldQuaternion(q).invert();
      uniforms.uCut.value.copy(cutWorld).applyQuaternion(q);
      camera.getWorldPosition(uniforms.uCam.value);
    },
    dispose() {
      geo.dispose();
      outerMat.dispose();
      innerMat.dispose();
    },
  };
}
