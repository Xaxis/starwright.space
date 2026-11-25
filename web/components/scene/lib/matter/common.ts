/**
 * What the matter kinds (reactor, lattice, cell) share: the story's beats spaced evenly, a camera
 * that flies between shots keyed to progress, GPU points moved by a GLSL snippet, one lighting
 * model, a backdrop, and a bin that disposes everything a scene made.
 */
import type * as THREE from "three";
import type { Beat, KindContext, Params, View } from "../../types.ts";
import { glowTexture, lin } from "../bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { rng } from "../particles.ts";

export { lin, rng };

/** 0 before a, 1 after b, smooth between. */
export const ramp = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A share from params (a number, or a model value already filled in), clamped to 0..1. */
export function share(v: Params[string] | undefined, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** The page's beats, spaced evenly along the story. */
export function storyBeats(ctx: KindContext): Beat[] {
  const raw = (ctx.data as { beats?: Omit<Beat, "at">[] } | undefined)?.beats ?? [];
  return raw.map((b, i) => ({ ...b, at: raw.length > 1 ? i / (raw.length - 1) : 0 }));
}

/** Everything a scene makes that holds GPU memory, freed together. */
export class Bin {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose() {
    for (const x of this.items) x.dispose();
    this.items.length = 0;
  }
}

/** A camera position on the story: distance, target, azimuth and elevation, at a progress. */
export interface Shot {
  at: number;
  d: number;
  target: [number, number, number];
  az: number;
  el: number;
}

/** A camera that eases from shot to shot, distance in powers of ten so a pull back feels even. */
export function flight(T: typeof THREE, shots: Shot[]): (p: number) => View {
  const target = new T.Vector3();
  const tb = new T.Vector3();
  return (p) => {
    let i = 0;
    while (i < shots.length - 2 && p > (shots[i + 1] as Shot).at) i++;
    const a = shots[i] as Shot;
    const b = (shots[i + 1] ?? a) as Shot;
    const k = b.at > a.at ? ramp(p, a.at, b.at) : 0;
    const d = Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k);
    target.set(...a.target).lerp(tb.set(...b.target), k);
    const az = a.az + (b.az - a.az) * k;
    const el = a.el + (b.el - a.el) * k;
    const x = target.x + Math.cos(el) * Math.cos(az) * d;
    const y = target.y + Math.sin(el) * d;
    const z = target.z + Math.cos(el) * Math.sin(az) * d;
    return {
      position: [x, y, z],
      target: [target.x, target.y, target.z],
      near: d * 0.3,
      far: d * 3,
    };
  };
}

/** A key light from the upper left, a cool fill from behind, a highlight and a coloured rim. */
export const LIGHT = /* glsl */ `
vec3 lit(vec3 base, vec3 N, vec3 V, vec3 rim) {
  vec3 L1 = normalize(vec3(-0.45, 0.8, 0.55));
  vec3 L2 = normalize(vec3(0.7, -0.25, -0.6));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  vec3 H = normalize(L1 + V);
  float sp = pow(max(dot(N, H), 0.0), 48.0);
  float fr = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);
  return base * (0.07 + 0.9 * d1 + 0.22 * d2) + vec3(0.9, 0.95, 1.0) * sp * 0.5 + rim * fr;
}
`;

/** Pixels per world unit at distance 1, for point sizes: the renderer's height over the view's span. */
export function pixelScale(ctx: KindContext, size: THREE.Vector2): number {
  ctx.renderer.getSize(size);
  const fov = (ctx.camera.fov * Math.PI) / 180;
  return (ctx.renderer.getPixelRatio() * size.y) / (2 * Math.tan(fov / 2));
}

export interface PointsOptions {
  /** Points at full detail; scaled by ctx.detail unless attributes are given. */
  count: number;
  seed: number;
  /** GLSL declarations: extra uniforms, attributes and functions. */
  decl?: string;
  /**
   * GLSL that sets vec3 pos, float alpha, vec3 col and float size (a multiple of the base size)
   * from vec4 aSeed and vec4 aSeed2 (randoms, 0 to 1), uTime and uProgress.
   */
  body: string;
  uniforms?: Record<string, THREE.IUniform>;
  attributes?: Record<string, { array: Float32Array; size: number }>;
  colour: string;
  /** World diameter of a point. */
  size: number;
  maxPx?: number;
  additive?: boolean;
}

export interface Points {
  points: THREE.Points;
  uniforms: Record<string, THREE.IUniform>;
  update(time: number, progress: number, pixels: number): void;
}

/** Glowing points, each placed every frame by the caller's GLSL, so motion costs the CPU nothing. */
export function glowPoints(ctx: KindContext, bin: Bin, o: PointsOptions): Points {
  const T = ctx.three;
  const first = o.attributes ? Object.values(o.attributes)[0] : undefined;
  const n = first
    ? first.array.length / first.size
    : Math.max(8, Math.round(o.count * Math.max(0.15, ctx.detail)));
  const r = rng(o.seed);
  const s1 = new Float32Array(n * 4);
  const s2 = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) {
    s1[i] = r();
    s2[i] = r();
  }
  const geo = bin.add(new T.BufferGeometry());
  geo.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aSeed", new T.BufferAttribute(s1, 4));
  geo.setAttribute("aSeed2", new T.BufferAttribute(s2, 4));
  for (const [name, a] of Object.entries(o.attributes ?? {}))
    geo.setAttribute(name, new T.BufferAttribute(a.array, a.size));
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPixel: { value: 1 },
    uSize: { value: o.size },
    uMaxPx: { value: o.maxPx ?? 24 },
    uDot: { value: glowTexture(ctx) },
    cColour: { value: lin(ctx, o.colour) },
    ...o.uniforms,
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        ${NOISE}
        attribute vec4 aSeed;
        attribute vec4 aSeed2;
        uniform float uTime;
        uniform float uProgress;
        uniform float uPixel;
        uniform float uSize;
        uniform float uMaxPx;
        uniform vec3 cColour;
        ${o.decl ?? ""}
        varying float vAlpha;
        varying vec3 vCol;
        void main() {
          vec3 pos = vec3(0.0);
          float alpha = 1.0;
          vec3 col = cColour;
          float size = 1.0;
          ${o.body}
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = uPixel * uSize * size / max(-mv.z, 1e-5);
          // A point smaller than a pixel keeps its light by dimming rather than vanishing.
          vAlpha = alpha * clamp(px / 1.5, 0.15, 1.0);
          vCol = col;
          gl_PointSize = alpha > 0.002 ? clamp(px, 1.5, uMaxPx) : 0.0;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform sampler2D uDot;
        varying float vAlpha;
        varying vec3 vCol;
        void main() {
          float a = texture2D(uDot, gl_PointCoord).r * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol * a, a);
          ${FRAG_TAIL}
        }`,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: o.additive === false ? T.NormalBlending : T.AdditiveBlending,
    }),
  );
  const points = new T.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    uniforms,
    update(time, progress, pixels) {
      (uniforms.uTime as THREE.IUniform).value = time;
      (uniforms.uProgress as THREE.IUniform).value = progress;
      (uniforms.uPixel as THREE.IUniform).value = pixels;
    },
  };
}

/**
 * The space behind a scene: a gradient on the view direction with a faint coloured haze, drawn
 * first on a triangle that covers the screen, so it turns with the camera and never clips.
 */
export function makeBackdrop(
  ctx: KindContext,
  bin: Bin,
  o: { top: string; bottom: string; haze: string; amount: number },
): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const T = ctx.three;
  const geo = bin.add(new T.BufferGeometry());
  geo.setAttribute(
    "position",
    new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const uniforms = {
    uTime: { value: 0 },
    cTop: { value: lin(ctx, o.top) },
    cBottom: { value: lin(ctx, o.bottom) },
    cHaze: { value: lin(ctx, o.haze) },
    uAmount: { value: o.amount },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vDir;
        void main() {
          vec4 v = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
          vDir = (inverse(viewMatrix) * vec4(v.xyz / v.w, 0.0)).xyz;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        ${NOISE}
        uniform float uTime;
        uniform vec3 cTop;
        uniform vec3 cBottom;
        uniform vec3 cHaze;
        uniform float uAmount;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = mix(cBottom, cTop, smoothstep(-0.6, 0.8, d.y));
          float h = vnoise(d * 2.2 + vec3(0.0, uTime * 0.01, 0.0)) * 0.6 + vnoise(d * 5.1) * 0.4;
          c += cHaze * pow(max(h - 0.3, 0.0), 2.0) * uAmount;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

/** A seeded point on the unit sphere. */
export function onSphere(r: () => number): [number, number, number] {
  const z = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [Math.cos(a) * s, z, Math.sin(a) * s];
}

/** A sky to mirror: dark above, a pale band at the horizon, and the key light. */
export const ENV = /* glsl */ `
vec3 env(vec3 r) {
  vec3 c = mix(vec3(0.015, 0.02, 0.035), vec3(0.09, 0.11, 0.16), smoothstep(-0.3, 0.5, r.y));
  c += vec3(0.22, 0.26, 0.34) * (1.0 - smoothstep(0.0, 0.12, abs(r.y - 0.04)));
  c += vec3(1.0, 0.88, 0.7) * pow(max(dot(r, normalize(vec3(-0.45, 0.8, 0.55))), 0.0), 90.0) * 6.0;
  return c;
}
`;

export interface SolidOptions {
  colour: string;
  rim?: string;
  /** How mirror-like, 0 to about 1.5. */
  gloss?: number;
  /** A wedge cut away for a look inside, as angles round y in radians (atan of z over x). */
  wedge?: [number, number];
  /** Seams of panels or tiles, per unit length; 0 for none. */
  panel?: number;
  /** Light the machine's own heat throws on it from its centre: a shared uniform and colour. */
  heat?: { value: number };
  heatColour?: string;
  emit?: string;
}

/**
 * A lit, solid surface for machines and buildings: the key light, a mirrored sky, panel seams, a
 * cutaway wedge, and the glow of whatever burns at the origin falling on the faces that see it.
 * Works on plain and instanced meshes.
 */
export function solid(ctx: KindContext, bin: Bin, o: SolidOptions): THREE.ShaderMaterial {
  const T = ctx.three;
  return bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          #ifdef USE_INSTANCING
          mat4 m = modelMatrix * instanceMatrix;
          #else
          mat4 m = modelMatrix;
          #endif
          vec4 w = m * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(m) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        ${LIGHT}
        ${ENV}
        uniform vec3 cBase;
        uniform vec3 cRim;
        uniform vec3 cHeat;
        uniform vec3 cEmit;
        uniform float uHeat;
        uniform float uGloss;
        uniform float uPanel;
        uniform vec2 uWedge;
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          if (uWedge.y > uWedge.x) {
            float a = atan(vW.z, vW.x);
            if (a > uWedge.x && a < uWedge.y) discard;
          }
          vec3 N = normalize(vN);
          bool inside = !gl_FrontFacing;
          if (inside) N = -N;
          vec3 V = normalize(cameraPosition - vW);
          vec3 base = cBase;
          if (uPanel > 0.0) {
            vec3 g = abs(fract(vW * uPanel) - 0.5);
            base *= 1.0 - 0.35 * smoothstep(0.46, 0.5, max(max(g.x, g.y), g.z));
          }
          vec3 c = lit(base, N, V, cRim);
          float fres = 0.04 + 0.96 * pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 5.0);
          c += env(reflect(-V, N)) * fres * uGloss;
          float d = length(vW);
          c += cHeat * uHeat * max(dot(N, -vW / max(d, 1e-4)), 0.0) / (1.0 + d * d * 1.5) * (inside ? 1.6 : 1.0);
          c += cEmit;
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: {
        cBase: { value: lin(ctx, o.colour) },
        cRim: { value: lin(ctx, o.rim ?? "#000000") },
        cHeat: { value: lin(ctx, o.heatColour ?? "#000000") },
        cEmit: { value: lin(ctx, o.emit ?? "#000000") },
        uHeat: o.heat ?? { value: 0 },
        uGloss: { value: o.gloss ?? 0.5 },
        uPanel: { value: o.panel ?? 0 },
        uWedge: { value: new T.Vector2(...(o.wedge ?? [0, 0])) },
      },
      side: T.DoubleSide,
    }),
  );
}

/** A closed surface from a function of two angles (round the tube, round the ring), with uvs. */
export function surface(
  T: typeof THREE,
  f: (u: number, v: number) => [number, number, number],
  nu: number,
  nv: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      const v = (j / nv) * Math.PI * 2;
      pos.push(...f(u, v));
      uv.push(i / nu, j / nv);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thick ring wall (a vessel's layer) with a wedge left open, its cut faces closed. */
export function annulus(
  T: typeof THREE,
  rIn: number,
  rOut: number,
  y0: number,
  y1: number,
  open: [number, number],
  segments = 64,
): THREE.BufferGeometry {
  // Lathe a closed profile over the part of the circle that stays, then cap the two cut faces.
  const pts = [
    new T.Vector2(Math.max(rIn, 1e-3), y0),
    new T.Vector2(rOut, y0),
    new T.Vector2(rOut, y1),
    new T.Vector2(Math.max(rIn, 1e-3), y1),
    new T.Vector2(Math.max(rIn, 1e-3), y0),
  ];
  // Lathe angles run from +z toward +x; our wedge is in atan(z, x) terms.
  const keep0 = open[1];
  const keepLen = Math.PI * 2 - (open[1] - open[0]);
  const lathe = new T.LatheGeometry(
    pts,
    segments,
    Math.PI / 2 - keep0 - keepLen,
    keepLen,
  ).toNonIndexed();
  const caps: number[] = [];
  for (const a of [open[0], open[1]]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const p = (r: number, y: number) => [r * c, y, r * s];
    const q = [p(rIn, y0), p(rOut, y0), p(rOut, y1), p(rIn, y1)];
    caps.push(...(q[0] as number[]), ...(q[1] as number[]), ...(q[2] as number[]));
    caps.push(...(q[0] as number[]), ...(q[2] as number[]), ...(q[3] as number[]));
  }
  const all = new Float32Array(lathe.getAttribute("position").array.length + caps.length);
  all.set(lathe.getAttribute("position").array as Float32Array, 0);
  all.set(caps, lathe.getAttribute("position").array.length);
  lathe.dispose();
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(all, 3));
  g.computeVertexNormals();
  return g;
}
