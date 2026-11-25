/**
 * A material from its atoms up. The story starts close on a few atoms flying in and locking into
 * the structure's real lattice (graphene's honeycomb, a rolled nanotube, the diamond cubic, a
 * close-packed metal, perovskite's octahedra, a silicate network, polymer chains, a cross-beta
 * protein fibre, hexagonal ice), then pulls back as the crystal grows into something you could hold
 * (a sheet, a cable, a film, a block, its grains and their boundaries showing), and ends over many
 * of them: the material made at scale. Defects show as missing atoms glowing red, atoms knocked off
 * their sites and brighter grain boundaries.
 *
 * Units are bond lengths. Progress: assembly to 0.32, the macroscopic object to 0.6, many to 1.
 */
import type * as THREE from "three";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import {
  Bin,
  ENV,
  flight,
  glowPoints,
  LIGHT,
  lin,
  makeBackdrop,
  pixelScale,
  ramp,
  rng,
  type Shot,
  share,
  storyBeats,
} from "../lib/matter/common.ts";
import { type Crystal, makeCrystal, type Structure } from "../lib/matter/crystals.ts";
import type { Kind } from "../types.ts";

const STRUCTURES: Structure[] = [
  "nanotube",
  "graphene",
  "diamond",
  "metal",
  "perovskite",
  "silicate",
  "polymer",
  "protein",
  "ice",
];

/** How each material looks once it is big enough to hold. */
const LOOK: Record<
  Structure,
  {
    base: string;
    shape: "plane" | "box" | "hex" | "rod";
    h: number;
    grain: number;
    stretch: [number, number, number];
    /** How mirror-like the surface is, and how much thin-film colour it shows. */
    gloss: number;
    iris: number;
    /** The finish: 0 polished, 1 brushed metal, 2 gem, 3 glass or ice, 4 fibre. */
    mat: 0 | 1 | 2 | 3 | 4;
  }
> = {
  graphene: {
    base: "#2a3142",
    shape: "plane",
    h: 0,
    grain: 0.16,
    stretch: [1, 1, 1],
    gloss: 0.9,
    iris: 0.15,
    mat: 0,
  },
  nanotube: {
    base: "#3a404c",
    shape: "rod",
    h: 0,
    grain: 0.1,
    stretch: [0.08, 1, 1],
    gloss: 0.6,
    iris: 0,
    mat: 4,
  },
  diamond: {
    base: "#a9d2ff",
    shape: "box",
    h: 0.1,
    grain: 0.22,
    stretch: [1, 1, 1],
    gloss: 1.2,
    iris: 0,
    mat: 2,
  },
  metal: {
    base: "#aeb6c4",
    shape: "box",
    h: 0.28,
    grain: 0.12,
    stretch: [1, 1, 1],
    gloss: 1.0,
    iris: 0,
    mat: 1,
  },
  perovskite: {
    base: "#2b2140",
    shape: "box",
    h: 0.05,
    grain: 0.1,
    stretch: [1, 1, 1],
    gloss: 0.9,
    iris: 0.35,
    mat: 0,
  },
  silicate: {
    base: "#9fb9bd",
    shape: "box",
    h: 0.3,
    grain: 0.14,
    stretch: [1, 1, 1],
    gloss: 0.5,
    iris: 0,
    mat: 3,
  },
  polymer: {
    base: "#e4e0d6",
    shape: "rod",
    h: 0,
    grain: 0.1,
    stretch: [0.06, 1, 1],
    gloss: 0.4,
    iris: 0,
    mat: 4,
  },
  protein: {
    base: "#e9d3a0",
    shape: "rod",
    h: 0,
    grain: 0.1,
    stretch: [0.06, 1, 1],
    gloss: 0.6,
    iris: 0,
    mat: 4,
  },
  ice: {
    base: "#cfe6ff",
    shape: "hex",
    h: 0.42,
    grain: 0.2,
    stretch: [1, 0.6, 1],
    gloss: 1.0,
    iris: 0,
    mat: 3,
  },
};

/** Where each atom is this frame: flying in, landing, or jiggling on its site. Shared by atoms,
 * bonds and octahedra so they move as one. */
const PLACE = /* glsl */ `
uniform float uTime;
uniform float uBuilt;
uniform float uWindow;
uniform float uJiggle;
uniform float uRipple;
float ripple(vec2 xz, float t) {
  return sin(xz.x * 0.33 + t * 0.7) * cos(xz.y * 0.29 - t * 0.5) + 0.5 * sin((xz.x + xz.y) * 0.61 + t * 1.1);
}
vec3 place(vec3 site, vec3 from, float born, float seed, out float f) {
  f = (born - uBuilt) / uWindow;
  float k = clamp(f, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = site + from * e;
  p += vec3(sin(seed * 40.0 + uTime * 1.3), cos(seed * 31.0 + uTime * 1.1), sin(seed * 17.0 + uTime * 0.9)) * e * 0.8;
  vec3 h = hash33(site * 7.31 + 3.1);
  p += vec3(sin(uTime * 9.0 + h.x * 6.2832), sin(uTime * 8.3 + h.y * 6.2832), sin(uTime * 10.1 + h.z * 6.2832)) * uJiggle;
  p.y += uRipple * ripple(site.xz, uTime);
  return p;
}
`;

const ATOM_VERT = /* glsl */ `
${VERT_HEAD}
${NOISE}
${PLACE}
attribute vec3 aSite;
attribute vec3 aFrom;
attribute vec4 aInfo;
uniform vec3 cEl[6];
uniform float uRad[6];
uniform float uShow;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vHot;
varying float vDefect;
void main() {
  float f;
  vec3 c = place(aSite, aFrom, aInfo.x, aInfo.w, f);
  int e = int(aInfo.y + 0.5);
  float vis = 1.0 - smoothstep(0.55, 1.0, f);
  float vac = step(0.5, aInfo.z) * step(aInfo.z, 1.5);
  float rad = uRad[e] * mix(1.0, 0.6, vac) * vis * uShow;
  vec4 w = modelMatrix * vec4(c + position * rad, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = cEl[e];
  // An atom glows in flight, flashes as it lands, then cools.
  vHot = f > 0.0 ? 0.3 : exp(f * 9.0) * 0.8;
  vDefect = aInfo.z;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const ATOM_FRAG = /* glsl */ `
${FRAG_HEAD}
${LIGHT}
uniform vec3 cAccent;
uniform vec3 cDefect;
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vHot;
varying float vDefect;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 c = lit(vCol, N, V, cAccent * 0.6);
  c += cAccent * vHot * 0.9;
  if (vDefect > 0.5 && vDefect < 1.5) c = cDefect * (1.6 + 0.6 * sin(uTime * 4.0));
  else if (vDefect > 1.5) c = mix(c, cDefect * 1.4, 0.55);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

const BOND_VERT = /* glsl */ `
${VERT_HEAD}
${NOISE}
${PLACE}
attribute vec3 aA;
attribute vec3 aFA;
attribute vec3 aB;
attribute vec3 aFB;
attribute vec4 aInfo;
attribute vec2 aSeeds;
uniform float uShow;
varying vec3 vN;
varying vec3 vW;
varying float vAlong;
varying float vType;
varying float vHot;
void main() {
  float fa;
  float fb;
  vec3 A = place(aA, aFA, aInfo.x, aSeeds.x, fa);
  vec3 B = place(aB, aFB, aInfo.y, aSeeds.y, fb);
  float type = aInfo.z;
  float f = max(fa, fb);
  // Chain bonds hold while the chain flies; lattice bonds form once both atoms have landed.
  float vis = type > 0.5 && type < 1.5 ? 1.0 - smoothstep(0.55, 1.0, f) : 1.0 - smoothstep(-0.3, 0.0, f);
  float r = (type > 1.5 ? 0.04 : 0.075) * vis * uShow;
  vec3 d = B - A;
  float len = length(d);
  vec3 t = d / max(len, 1e-5);
  vec3 up = abs(t.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 bx = normalize(cross(up, t));
  vec3 bz = cross(t, bx);
  vec3 p = A + bx * position.x * r + t * position.y * len + bz * position.z * r;
  vN = normalize(bx * normal.x + bz * normal.z);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vAlong = position.y * len;
  vType = type;
  vHot = f <= 0.0 ? exp(f * 8.0) : 0.6;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const BOND_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 cAccent;
uniform vec3 cChain;
uniform float uGlow;
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying float vAlong;
varying float vType;
varying float vHot;
void main() {
  if (vType > 1.5 && fract(vAlong * 3.5) > 0.5) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float core = pow(clamp(abs(dot(N, V)), 0.0, 1.0), 0.7);
  vec3 base = vType > 0.5 && vType < 1.5 ? cChain : cAccent;
  float pulse = 0.8 + 0.2 * sin(vW.x * 0.6 + vW.z * 0.45 - uTime * 3.0);
  vec3 c = base * uGlow * pulse * (0.35 + 0.75 * core) + cAccent * vHot * 1.4;
  if (vType > 1.5) c = cAccent * (1.2 + 0.6 * pulse);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

const OCTA_VERT = /* glsl */ `
${VERT_HEAD}
${NOISE}
${PLACE}
attribute vec3 aSite;
attribute vec3 aFrom;
attribute vec4 aInfo;
uniform float uShow;
varying vec3 vN;
varying vec3 vW;
varying float vVis;
void main() {
  float f;
  vec3 c = place(aSite, aFrom, aInfo.x, aInfo.w, f);
  float vis = (1.0 - smoothstep(-0.4, 0.0, f)) * uShow;
  vec4 w = modelMatrix * vec4(c + position * 0.98 * vis, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vVis = vis;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const OCTA_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 cOcta;
varying vec3 vN;
varying vec3 vW;
varying float vVis;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), 2.0);
  gl_FragColor = vec4(cOcta * (0.1 + 0.7 * fr) * vVis, 1.0);
  ${FRAG_TAIL}
}`;

const MACRO_VERT = /* glsl */ `
${VERT_HEAD}
attribute vec3 aGrow;
attribute vec3 aOrigin;
attribute float aMaxR;
uniform float uGrow;
uniform float uMany;
uniform float uTime;
uniform float uWave;
uniform float uSeed;
varying vec3 vW;
varying vec3 vN;
varying float vR;
varying float vFront;
varying float vG;
void main() {
  float u = aGrow.x < 0.5 ? uGrow : uMany;
  float g = clamp((u - aGrow.y) / aGrow.z, 0.0, 1.0);
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #ifdef SHEET
  // The sheet flutters, still at the atoms in its middle.
  w.y += uWave * sin(w.x * 0.012 + uTime * 0.4) * sin(w.z * 0.01 - uTime * 0.3);
  #endif
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vW = w.xyz;
  #ifdef AXIAL
  vR = abs(w.x - aOrigin.x);
  #else
  vR = length(w.xyz - aOrigin);
  #endif
  // The first object starts as a seed under the atoms, so they sit on their own crystal.
  float seed = aGrow.x < 0.5 ? uSeed : 0.0;
  vFront = max(g * aMaxR, seed);
  vG = seed > 0.0 ? max(g, 0.001) : g;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

const MACRO_FRAG = /* glsl */ `
${FRAG_HEAD}
${NOISE}
${LIGHT}
${ENV}
// A studio round the material: the dark sky, plus a broad soft panel overhead and a strip light
// behind, so polished faces have something bright to mirror.
vec3 studio(vec3 r) {
  vec3 c = env(r);
  c += vec3(0.85, 0.9, 1.0) * smoothstep(0.86, 0.93, dot(r, normalize(vec3(0.2, 0.55, -0.8))));
  c += vec3(0.5, 0.55, 0.7) * smoothstep(0.95, 0.975, dot(r, normalize(vec3(-0.75, 0.35, 0.55))));
  return c;
}
uniform vec3 cBase;
uniform vec3 cAccent;
uniform vec3 cFog;
uniform float uDefects;
uniform float uShow;
uniform float uHole;
uniform float uFringe;
uniform float uGrain;
uniform vec3 uStretch;
uniform float uFog;
uniform float uFrontW;
uniform float uGloss;
uniform float uIris;
uniform float uGrid;
uniform float uTime;
varying vec3 vW;
varying vec3 vN;
varying float vR;
varying float vFront;
varying float vG;
void main() {
  if (vR > vFront || vG <= 0.0) discard;
  if (uHole > 0.0 && length(vW.xz) < uHole && abs(vW.y) < 3.0) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  // Grains: cells around scattered seeds, each its own crystal, boundaries between them.
  vec3 gp = vW * uStretch / uGrain;
  vec3 ip = floor(gp);
  float d1 = 8.0;
  float d2 = 8.0;
  vec3 id = ip;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++)
      for (int k = -1; k <= 1; k++) {
        vec3 c = ip + vec3(float(i), float(j), float(k));
        float d = length(gp - c - hash33(c));
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = c;
        } else if (d < d2) {
          d2 = d;
        }
      }
  float edge = d2 - d1;
  float ew = fwidth(edge);
  float boundary = (1.0 - smoothstep(0.0, 0.015 + ew * 1.2, edge)) * (1.0 - smoothstep(0.08, 0.35, ew));
  // Lattice fringes, as an electron microscope sees them, turned to each grain's own angle.
  vec3 h = hash33(id + 7.0);
  float ang = h.x * 6.2832;
  vec3 q = vW / uFringe;
  q = vec3(cos(ang) * q.x - sin(ang) * q.z, q.y, sin(ang) * q.x + cos(ang) * q.z);
  float fr = cos(q.x * 6.2832) + cos((0.5 * q.x + 0.866 * q.z) * 6.2832) + cos((-0.5 * q.x + 0.866 * q.z) * 6.2832);
  float fringe = smoothstep(0.8, 2.6, fr) * (1.0 - smoothstep(0.12, 0.45, length(fwidth(q)))) * step(0.5, abs(N.y));
  vec3 base = cBase * (0.9 + 0.2 * h.y);
  vec3 c = lit(base, N, V, cAccent * 0.35);
  // Each grain sits at its own slight angle, so a polished face catches the light grain by grain.
#if MAT == 1
  vec3 Ng = normalize(N + (h - 0.5) * 0.3);
#elif MAT == 2
  vec3 Ng = normalize(N + (h - 0.5) * 0.4);
#else
  vec3 Ng = normalize(N + (h - 0.5) * 0.06);
#endif
  // A polished surface: the sky and the key light mirrored in it, stronger at a grazing angle.
  float fres = 0.04 + 0.96 * pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 5.0);
#if MAT == 1
  // Brushed metal: the polish runs in lines, and the reflection takes the metal's colour.
  vec3 brush = (vec3(0.0, vnoise(vW * vec3(0.4, 30.0, 30.0)), vnoise(vW * vec3(0.4, 30.0, 31.0) + 4.0)) - 0.5) * (1.0 - smoothstep(0.02, 0.08, fwidth(vW.y * 30.0) * 0.03));
  vec3 Nb = normalize(Ng + 0.12 * brush);
  c = lit(base * 0.2, N, V, vec3(0.0)) + studio(reflect(-V, Nb)) * base * (0.8 + 0.5 * fres);
#elif MAT == 2
  // A gem: little colour of its own, mostly reflection, and fire where a facet catches the light.
  c = base * 0.07 + studio(reflect(-V, Ng)) * mix(base, vec3(1.0), 0.6) * (0.35 + 0.65 * fres) * 1.3;
  vec3 cellP = floor(vW * 6.0);
  float spark = step(0.988, hash13(cellP + floor(uTime * 2.0 + hash13(cellP) * 9.0)));
  c += (0.5 + 0.5 * cos(6.2832 * (hash13(cellP + 3.0) + vec3(0.0, 0.33, 0.67)))) * spark * 1.6;
#elif MAT == 3
  // Glass or ice: dark where it is seen through, bright at the rim, a cool tint.
  float mu = abs(dot(N, V));
  c = base * (0.1 + 0.05 * N.y) + studio(reflect(-V, Ng)) * (0.15 + 0.85 * fres) + base * 0.4 * pow(1.0 - mu, 2.0);
#elif MAT == 4
  // A fibre: a sheen running along it, as silk and carbon show.
  vec3 H = normalize(normalize(vec3(0.5, 0.8, 0.3)) + V);
  float th = H.x;
  float sheen = pow(sqrt(max(1.0 - th * th, 0.0)), 50.0);
  c = lit(base * 0.55, N, V, cAccent * 0.2) + base * sheen * 0.8 + studio(reflect(-V, N)) * fres * 0.5;
#else
  c += studio(reflect(-V, Ng)) * fres * uGloss;
#endif
  // Thin films shimmer with interference colours as the angle changes.
  c += uIris * (0.5 + 0.5 * cos(6.2832 * (abs(dot(N, V)) * 1.2 + vec3(0.0, 0.33, 0.67)))) * 0.1;
  c += cAccent * fringe * 0.1;
  // A film made into panels: the grid of cells and the wires between them.
  if (uGrid > 0.0 && N.y > 0.3) {
    vec2 gq = abs(fract(vW.xz / uGrid) - 0.5);
    float gw = fwidth(vW.x / uGrid) * 1.5 + 0.01;
    c = mix(c, vec3(0.42, 0.46, 0.55), smoothstep(0.5 - gw, 0.5, max(gq.x, gq.y)) * 0.7);
  }
  // Grain boundaries etched dark; where the crystal is flawed they glow, more with more defects.
  c = mix(c, c * 0.45, boundary) + cAccent * boundary * 1.4 * uDefects;
  // The growing edge glows.
  c += cAccent * smoothstep(vFront - uFrontW, vFront, vR) * step(vG, 0.995) * 0.9;
  float dist = length(cameraPosition - vW);
  c = mix(c, cFog, 1.0 - exp(-dist / uFog));
  gl_FragColor = vec4(c, uShow);
  ${FRAG_TAIL}
}`;

interface Inst {
  pos: [number, number, number];
  scale: [number, number, number];
  rotX: number;
  rotY: number;
  stage: 0 | 1;
  born: number;
  span: number;
  origin: [number, number, number];
  maxR: number;
}

const lattice: Kind = (ctx) => {
  const T = ctx.three;
  const bin = new Bin();
  const { scene, camera } = ctx;
  const structure = (
    STRUCTURES.includes(ctx.params.structure as Structure) ? ctx.params.structure : "graphene"
  ) as Structure;
  const defects = share(ctx.params.defects, 0.05);
  const xtal: Crystal = makeCrystal(structure, ctx.detail, defects);
  const look = LOOK[structure];
  const accent = lin(ctx, ctx.colour);
  const rand = rng(7);

  const back = makeBackdrop(ctx, bin, {
    top: "#0b1020",
    bottom: "#020306",
    haze: ctx.colour,
    amount: 0.05,
  });
  scene.add(back.mesh);

  // --- Atoms -------------------------------------------------------------------------------------
  const ball = bin.add(new T.IcosahedronGeometry(1, ctx.detail < 0.5 ? 1 : 2));
  const atomGeo = bin.add(new T.InstancedBufferGeometry());
  atomGeo.index = ball.index;
  atomGeo.setAttribute("position", ball.getAttribute("position"));
  atomGeo.setAttribute("normal", ball.getAttribute("normal"));
  atomGeo.setAttribute("aSite", new T.InstancedBufferAttribute(xtal.site, 3));
  atomGeo.setAttribute("aFrom", new T.InstancedBufferAttribute(xtal.from, 3));
  atomGeo.setAttribute("aInfo", new T.InstancedBufferAttribute(xtal.info, 4));
  atomGeo.instanceCount = xtal.n;
  const els = [...xtal.elements];
  while (els.length < 6) els.push(els[0] as Crystal["elements"][number]);
  const place = {
    uTime: { value: 0 },
    uBuilt: { value: 0 },
    uWindow: { value: xtal.window },
    uJiggle: { value: xtal.jiggle },
    uRipple: { value: xtal.ripple },
    uShow: { value: 1 },
  };
  const atomMat = bin.add(
    new T.ShaderMaterial({
      vertexShader: ATOM_VERT,
      fragmentShader: ATOM_FRAG,
      uniforms: {
        ...place,
        cEl: { value: els.map((e) => lin(ctx, e.colour)) },
        uRad: { value: els.map((e) => e.radius) },
        cAccent: { value: accent },
        cDefect: { value: lin(ctx, "#ff4a2e") },
      },
    }),
  );
  const atoms = new T.Mesh(atomGeo, atomMat);
  atoms.frustumCulled = false;
  scene.add(atoms);

  // --- Bonds -------------------------------------------------------------------------------------
  const nb = xtal.bonds.length / 3;
  const tube = bin.add(new T.CylinderGeometry(1, 1, 1, 6, 1, true));
  tube.translate(0, 0.5, 0);
  const bondGeo = bin.add(new T.InstancedBufferGeometry());
  bondGeo.index = tube.index;
  bondGeo.setAttribute("position", tube.getAttribute("position"));
  bondGeo.setAttribute("normal", tube.getAttribute("normal"));
  const bA = new Float32Array(nb * 3);
  const bFA = new Float32Array(nb * 3);
  const bB = new Float32Array(nb * 3);
  const bFB = new Float32Array(nb * 3);
  const bInfo = new Float32Array(nb * 4);
  const bSeeds = new Float32Array(nb * 2);
  for (let k = 0; k < nb; k++) {
    const i = xtal.bonds[k * 3] as number;
    const j = xtal.bonds[k * 3 + 1] as number;
    for (let c = 0; c < 3; c++) {
      bA[k * 3 + c] = xtal.site[i * 3 + c] as number;
      bFA[k * 3 + c] = xtal.from[i * 3 + c] as number;
      bB[k * 3 + c] = xtal.site[j * 3 + c] as number;
      bFB[k * 3 + c] = xtal.from[j * 3 + c] as number;
    }
    bInfo[k * 4] = xtal.info[i * 4] as number;
    bInfo[k * 4 + 1] = xtal.info[j * 4] as number;
    bInfo[k * 4 + 2] = xtal.bonds[k * 3 + 2] as number;
    bSeeds[k * 2] = xtal.info[i * 4 + 3] as number;
    bSeeds[k * 2 + 1] = xtal.info[j * 4 + 3] as number;
  }
  bondGeo.setAttribute("aA", new T.InstancedBufferAttribute(bA, 3));
  bondGeo.setAttribute("aFA", new T.InstancedBufferAttribute(bFA, 3));
  bondGeo.setAttribute("aB", new T.InstancedBufferAttribute(bB, 3));
  bondGeo.setAttribute("aFB", new T.InstancedBufferAttribute(bFB, 3));
  bondGeo.setAttribute("aInfo", new T.InstancedBufferAttribute(bInfo, 4));
  bondGeo.setAttribute("aSeeds", new T.InstancedBufferAttribute(bSeeds, 2));
  bondGeo.instanceCount = nb;
  const bondMat = bin.add(
    new T.ShaderMaterial({
      vertexShader: BOND_VERT,
      fragmentShader: BOND_FRAG,
      uniforms: {
        ...place,
        cAccent: { value: accent },
        cChain: { value: lin(ctx, "#c8d2e6") },
        uGlow: { value: xtal.form === "strand" ? 0.6 : 0.9 },
      },
    }),
  );
  const bonds = new T.Mesh(bondGeo, bondMat);
  bonds.frustumCulled = false;
  bonds.visible = nb > 0;
  scene.add(bonds);

  // --- Octahedra (perovskite) ----------------------------------------------------------------------
  let octa: THREE.Mesh | undefined;
  if (xtal.octa.length) {
    const shape = bin.add(new T.OctahedronGeometry(1, 0));
    const og = bin.add(new T.InstancedBufferGeometry());
    og.setAttribute("position", shape.getAttribute("position"));
    og.setAttribute("normal", shape.getAttribute("normal"));
    const os = new Float32Array(xtal.octa.length * 3);
    const of = new Float32Array(xtal.octa.length * 3);
    const oi = new Float32Array(xtal.octa.length * 4);
    xtal.octa.forEach((a, k) => {
      for (let c = 0; c < 3; c++) {
        os[k * 3 + c] = xtal.site[a * 3 + c] as number;
        of[k * 3 + c] = xtal.from[a * 3 + c] as number;
      }
      for (let c = 0; c < 4; c++) oi[k * 4 + c] = xtal.info[a * 4 + c] as number;
    });
    og.setAttribute("aSite", new T.InstancedBufferAttribute(os, 3));
    og.setAttribute("aFrom", new T.InstancedBufferAttribute(of, 3));
    og.setAttribute("aInfo", new T.InstancedBufferAttribute(oi, 4));
    og.instanceCount = xtal.octa.length;
    const om = bin.add(
      new T.ShaderMaterial({
        vertexShader: OCTA_VERT,
        fragmentShader: OCTA_FRAG,
        uniforms: {
          ...place,
          cOcta: { value: lin(ctx, "#8a6bff", 0.55).add(accent.clone().multiplyScalar(0.25)) },
        },
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    );
    octa = new T.Mesh(og, om);
    octa.frustumCulled = false;
    scene.add(octa);
  }

  // --- Feedstock drifting to the growth front ------------------------------------------------------
  const front = new T.Vector3(...xtal.source);
  const feed = glowPoints(ctx, bin, {
    count: 900,
    seed: 3,
    colour: ctx.colour,
    size: 0.25,
    maxPx: 6,
    uniforms: {
      uFront: { value: front },
      uFeed: { value: 1 },
      uSpread: { value: Math.max(6, xtal.radius * 0.7) },
    },
    decl: "uniform vec3 uFront; uniform float uFeed; uniform float uSpread;",
    body: /* glsl */ `
      float ph = fract(aSeed.x + uTime * 0.22);
      vec3 dir = normalize(aSeed2.xyz * 2.0 - 1.0 + 1e-3);
      dir.y = abs(dir.y) * 0.8 + 0.2;
      vec3 start = uFront + normalize(dir) * uSpread * (0.4 + aSeed.y);
      pos = mix(start, uFront, ph * ph);
      pos += vec3(sin(uTime * 1.7 + aSeed.z * 30.0), cos(uTime * 1.3 + aSeed.w * 30.0), sin(uTime * 1.1 + aSeed.y * 20.0)) * 0.5 * (1.0 - ph);
      alpha = sin(3.14159 * ph) * uFeed * 0.3;
      size = 0.4 + aSeed.w * 0.8;`,
  });
  scene.add(feed.points);

  // The tip that sets each atom (diamond) and the hot catalyst a nanotube grows from.
  let tip: THREE.Group | undefined;
  if (structure === "diamond") {
    tip = new T.Group();
    const coneGeo = bin.add(new T.ConeGeometry(0.9, 5, 24, 1, true));
    coneGeo.rotateX(Math.PI);
    coneGeo.translate(0, 2.5, 0);
    const coneMat = bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vN; varying vec3 vW; varying float vY;\nvoid main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: `${FRAG_HEAD}\n${LIGHT}\nuniform vec3 cAccent; varying vec3 vN; varying vec3 vW; varying float vY;\nvoid main(){ vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N; vec3 c = lit(vec3(0.35,0.37,0.42), N, normalize(cameraPosition - vW), cAccent * 0.8); c += cAccent * exp(-vY * 2.5) * 2.0; gl_FragColor = vec4(c, 1.0); ${FRAG_TAIL} }`,
        uniforms: { cAccent: { value: accent } },
        side: T.DoubleSide,
      }),
    );
    tip.add(new T.Mesh(coneGeo, coneMat));
    scene.add(tip);
  }
  let catalyst: THREE.Mesh | undefined;
  if (structure === "nanotube") {
    const g = bin.add(new T.IcosahedronGeometry(xtal.fibre * 0.85, 2));
    const m = bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vN; varying vec3 vW;\nvoid main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: `${FRAG_HEAD}\n${LIGHT}\nvarying vec3 vN; varying vec3 vW;\nvoid main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); vec3 c = lit(vec3(0.5,0.42,0.36), N, V, vec3(1.0,0.5,0.2)); c += vec3(1.0,0.45,0.15) * (0.12 + 0.6 * pow(clamp(1.0 - dot(N,V),0.0,1.0),2.0)); gl_FragColor = vec4(c, 1.0); ${FRAG_TAIL} }`,
      }),
    );
    catalyst = new T.Mesh(g, m);
    scene.add(catalyst);
  }

  // The free electrons in a metal, drifting through the lattice.
  let sea: ReturnType<typeof glowPoints> | undefined;
  if (structure === "metal") {
    sea = glowPoints(ctx, bin, {
      count: 1400,
      seed: 5,
      colour: ctx.colour,
      size: 0.28,
      maxPx: 8,
      uniforms: { uR: { value: xtal.radius }, uOn: { value: 0 } },
      decl: "uniform float uR; uniform float uOn;",
      body: /* glsl */ `
        vec3 b = (aSeed.xyz * 2.0 - 1.0) * uR;
        pos = b + vec3(sin(uTime * 2.0 + aSeed2.x * 40.0), sin(uTime * 1.7 + aSeed2.y * 40.0), sin(uTime * 2.3 + aSeed2.z * 40.0)) * 0.7;
        float inside = step(abs(b.x) + abs(b.y) + abs(b.z), uR * 1.6);
        alpha = uOn * inside * (0.35 + 0.65 * pow(max(sin(uTime * 3.0 + aSeed2.w * 30.0), 0.0), 4.0));`,
    });
    scene.add(sea.points);
  }

  // --- The macroscopic object, then many -----------------------------------------------------------
  const R = xtal.radius;
  const insts: Inst[] = [];
  let macroCentre: [number, number, number] = [0, 0, 0];
  let macroSpan = 1;
  let manySpan = 1;
  // For a cable, a view of its end, where its fibres show in section.
  let endView: { d: number; target: [number, number, number] } | undefined;
  // For blocks and panels, the floor of the yard they are laid out in.
  let floorY: number | undefined;
  let geom: THREE.BufferGeometry;
  if (look.shape === "plane") {
    geom = bin.add(new T.PlaneGeometry(1, 1, 48, 48));
    geom.rotateX(-Math.PI / 2);
    const S = 26 * R;
    const G = 3 + Math.round(2 * ctx.detail);
    insts.push({
      pos: [0, 0, 0],
      scale: [S, 1, S],
      rotX: 0,
      rotY: 0,
      stage: 0,
      born: 0,
      span: 1,
      origin: [0, 0, 0],
      maxR: S * 0.75,
    });
    for (let i = -G; i <= G; i++)
      for (let j = -G; j <= G; j++) {
        if (!i && !j) continue;
        const pos: [number, number, number] = [
          i * 1.03 * S,
          (rand() - 0.5) * S * 0.04,
          j * 1.03 * S,
        ];
        const born = ((Math.abs(i) + Math.abs(j)) / (2 * G)) * 0.6 + rand() * 0.25;
        insts.push({
          pos,
          scale: [S, 1, S],
          rotX: 0,
          rotY: 0,
          stage: 1,
          born,
          span: 0.3,
          origin: pos,
          maxR: S * 0.75,
        });
      }
    macroSpan = S;
    manySpan = (2 * G + 1) * 1.03 * S;
  } else if (look.shape === "rod") {
    geom = bin.add(new T.CylinderGeometry(1, 1, 1, 14, 1, false));
    geom.rotateZ(Math.PI / 2);
    geom.translate(-0.5, 0, 0);
    const rf = xtal.fibre + 0.3;
    const Lm = 90 * rf;
    const x0 = -xtal.length / 2;
    const rings = ctx.detail < 0.5 ? 2 : 3;
    const hexRing = (ring: number): [number, number][] => {
      if (!ring) return [[0, 0]];
      const out: [number, number][] = [];
      for (let s = 0; s < 6; s++) {
        const a0 = (s * Math.PI) / 3;
        const a1 = ((s + 1) * Math.PI) / 3;
        for (let k = 0; k < ring; k++) {
          const t = k / ring;
          out.push([
            ring * (Math.cos(a0) * (1 - t) + Math.cos(a1) * t),
            ring * (Math.sin(a0) * (1 - t) + Math.sin(a1) * t),
          ]);
        }
      }
      return out;
    };
    const cableR = (rings + 0.6) * 2.1 * rf;
    endView = { d: cableR * 9, target: [x0 - cableR * 3, 0, 0] };
    for (let cr = 0; cr <= 2; cr++)
      for (const [cy, cz] of hexRing(cr)) {
        const stage: 0 | 1 = cr === 0 ? 0 : 1;
        const cBorn = cr === 0 ? 0 : (cr - 1) * 0.35 + rand() * 0.3;
        for (let ring = 0; ring <= rings; ring++)
          for (const [y, z] of hexRing(ring)) {
            const py = cy * cableR * 2.1 + y * 2.1 * rf;
            const pz = cz * cableR * 2.1 + z * 2.1 * rf;
            const len = Lm * (0.92 + rand() * 0.08);
            insts.push({
              pos: [x0, py, pz],
              scale: [len, rf, rf],
              rotX: 0,
              rotY: 0,
              stage,
              born: stage === 0 ? (ring / (rings + 1)) * 0.5 + rand() * 0.15 : cBorn,
              span: stage === 0 ? 0.45 : 0.35,
              origin: [x0, py, pz],
              maxR: len,
            });
          }
      }
    macroCentre = [x0 - Lm * 0.45, 0, 0];
    macroSpan = Lm * 0.75;
    manySpan = Lm * 1.05;
  } else {
    const S = 22 * R;
    const h = look.h * S;
    geom =
      look.shape === "hex"
        ? bin.add(new T.CylinderGeometry(0.5, 0.5, 1, 6, 1, false))
        : bin.add(new T.BoxGeometry(1, 1, 1));
    const film = xtal.form === "film";
    const top = xtal.base;
    insts.push({
      pos: [0, top - h / 2, 0],
      scale: [S, h, S],
      rotX: 0,
      rotY: 0,
      stage: 0,
      born: 0,
      span: 1,
      origin: [0, top, 0],
      maxR: S * 0.9,
    });
    const G = 3 + Math.round(2 * ctx.detail);
    const gap = film ? 1.12 : 1.3;
    for (let i = -G; i <= G; i++)
      for (let j = -G; j <= G; j++) {
        if (!i && !j) continue;
        const born = ((Math.abs(i) + Math.abs(j)) / (2 * G)) * 0.6 + rand() * 0.25;
        // Panels in rows (a film), or stacks of blocks in a yard, each laid as it was made.
        const layers = film ? 1 : 1 + Math.floor(rand() * 3.5);
        const yaw = film ? 0 : (rand() - 0.5) * 0.5;
        const k0 = film ? 1 : 0.85 + rand() * 0.15;
        for (let k = 0; k < layers; k++) {
          const pos: [number, number, number] = [
            i * gap * S,
            top - h / 2 + (film ? S * 0.25 : k * h * 1.04),
            j * gap * S * (film ? 1.1 : 1),
          ];
          insts.push({
            pos,
            scale: [S * k0, h, S * k0],
            rotX: film ? -0.5 : 0,
            rotY: yaw + (k % 2) * 0.08,
            stage: 1,
            born: born + k * 0.06,
            span: 0.3,
            origin: [pos[0], pos[1] + h / 2, pos[2]],
            maxR: S * 0.9,
          });
        }
      }
    macroCentre = [0, top - h / 2, 0];
    floorY = top - h - 0.002 * S;
    macroSpan = S;
    manySpan = (2 * G + 1) * gap * S;
  }
  const macroU = {
    uGrow: { value: 0 },
    uMany: { value: 0 },
    uTime: { value: 0 },
    uWave: { value: look.shape === "plane" ? macroSpan * 0.02 : 0 },
    uSeed: { value: look.shape === "box" || look.shape === "hex" ? R * 1.25 : 0 },
    cBase: { value: lin(ctx, look.base) },
    cAccent: { value: accent },
    cFog: { value: lin(ctx, "#05070d") },
    uDefects: { value: defects },
    uShow: { value: 0 },
    uHole: { value: 0 },
    uFringe: { value: 1.1 },
    uGrid: { value: xtal.form === "film" ? macroSpan / 8 : 0 },
    uGrain: { value: macroSpan * look.grain },
    uStretch: { value: new T.Vector3(...look.stretch) },
    uFog: { value: 1000 },
    uFrontW: { value: macroSpan * 0.008 },
    uGloss: { value: look.gloss },
    uIris: { value: look.iris },
  };
  const macroMat = bin.add(
    new T.ShaderMaterial({
      vertexShader: MACRO_VERT,
      fragmentShader: MACRO_FRAG,
      defines: {
        MAT: look.mat,
        ...(look.shape === "rod" ? { AXIAL: 1 } : look.shape === "plane" ? { SHEET: 1 } : {}),
      },
      uniforms: macroU,
      side: T.DoubleSide,
    }),
  );
  const macro = new T.InstancedMesh(geom, macroMat, insts.length);
  const grow = new Float32Array(insts.length * 3);
  const origin = new Float32Array(insts.length * 3);
  const maxR = new Float32Array(insts.length);
  const dummy = new T.Object3D();
  insts.forEach((s, i) => {
    dummy.position.set(...s.pos);
    dummy.rotation.set(s.rotX, s.rotY, 0, "YXZ");
    dummy.scale.set(...s.scale);
    dummy.updateMatrix();
    macro.setMatrixAt(i, dummy.matrix);
    grow.set([s.stage, s.born, s.span], i * 3);
    origin.set(s.origin, i * 3);
    maxR[i] = s.maxR;
  });
  geom.setAttribute("aGrow", new T.InstancedBufferAttribute(grow, 3));
  geom.setAttribute("aOrigin", new T.InstancedBufferAttribute(origin, 3));
  geom.setAttribute("aMaxR", new T.InstancedBufferAttribute(maxR, 1));
  macro.frustumCulled = false;
  scene.add(macro);
  // The yard's floor, dark and faintly ruled, arriving with the many.
  const floorU = { uMany: macroU.uMany, uFog: macroU.uFog, uStep: { value: macroSpan * 1.25 } };
  if (floorY !== undefined) {
    const floor = new T.Mesh(
      bin.add(new T.PlaneGeometry(1, 1)),
      bin.add(
        new T.ShaderMaterial({
          vertexShader: `${VERT_HEAD}\nvarying vec3 vW;\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
          fragmentShader: /* glsl */ `
            ${FRAG_HEAD}
            uniform float uMany;
            uniform float uFog;
            uniform float uStep;
            varying vec3 vW;
            void main() {
              vec2 q = abs(fract(vW.xz / uStep + 0.5) - 0.5);
              float w = fwidth(vW.x / uStep) * 1.5 + 0.004;
              float line = smoothstep(w, 0.0, min(q.x, q.y));
              vec3 c = vec3(0.022, 0.026, 0.034) + vec3(0.05, 0.06, 0.08) * line;
              float d = length(cameraPosition - vW);
              c = mix(c, vec3(0.012, 0.014, 0.022), 1.0 - exp(-d / uFog));
              gl_FragColor = vec4(c, uMany);
              ${FRAG_TAIL}
            }`,
          uniforms: floorU,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.scale.setScalar(manySpan * 6);
    floor.renderOrder = -1;
    scene.add(floor);
  }

  // --- The camera's path ---------------------------------------------------------------------------
  const strand = look.shape === "rod";
  const dc = strand ? Math.max(R * 1.5, xtal.fibre * 6) : R * 2.6;
  // A nanotube grows along its axis: the camera follows its growing end.
  const along = structure === "nanotube";
  const top = structure === "ice" || structure === "graphene";
  const near: [number, number, number] = along ? [-xtal.length * 0.22, 0, 0] : [0, 0, 0];
  const far: [number, number, number] = along ? [xtal.length * 0.12, 0, 0] : [0, 0, 0];
  const shots: Shot[] = [
    { at: 0, d: dc, target: near, az: strand ? 1.15 : 0.75, el: strand ? 0.3 : top ? 1.15 : 0.55 },
    {
      at: 0.3,
      d: dc * 1.15,
      target: far,
      az: strand ? 1.45 : 1.25,
      el: strand ? 0.4 : top ? 0.95 : 0.6,
    },
    endView
      ? { at: 0.6, d: endView.d, target: endView.target, az: 0.62, el: 0.3 }
      : { at: 0.6, d: macroSpan * 1.55, target: macroCentre, az: 1.7, el: 0.55 },
    {
      at: 1,
      d: strand ? manySpan * 1.1 : manySpan * 0.5,
      target: macroCentre,
      az: strand ? 2.3 : 2.15,
      el: strand ? 0.45 : 0.42,
    },
  ];
  const pose = flight(T, shots);
  const beats = storyBeats(ctx);
  const px = new T.Vector2();

  return {
    view: pose(0),
    beats,
    pose,
    update(time, _dt, p) {
      const pixels = pixelScale(ctx, px);
      const camD = camera.position.length();
      (back.uniforms.uTime as THREE.IUniform).value = time;
      // Assembly: a share of the atoms already in place at the start, the rest arriving by 0.32.
      const built = 0.16 + 0.84 * ramp(p, 0, 0.32);
      place.uTime.value = time;
      place.uBuilt.value = built;
      const show = 1 - ramp(camD, dc * 4, dc * 12);
      place.uShow.value = show;
      atoms.visible = show > 0.002;
      bonds.visible = nb > 0 && show > 0.002;
      if (octa) octa.visible = show > 0.002;
      // The front: where the atom arriving now will sit.
      const k = xtal.order[Math.min(xtal.n - 1, Math.floor(built * 1.02 * (xtal.n - 1)))] as number;
      front.set(
        xtal.site[k * 3] as number,
        xtal.site[k * 3 + 1] as number,
        xtal.site[k * 3 + 2] as number,
      );
      (feed.uniforms.uFeed as THREE.IUniform).value = (1 - ramp(p, 0.3, 0.42)) * show;
      feed.update(time, p, pixels);
      if (tip) {
        tip.position.set(front.x, front.y + 0.6 + 0.15 * Math.sin(time * 6), front.z);
        tip.visible = p < 0.36 && show > 0.01;
      }
      if (catalyst) {
        const fx = -xtal.length / 2 + built * xtal.length;
        catalyst.position.set(fx + xtal.fibre * 0.3, 0, 0);
        catalyst.visible = show > 0.01;
      }
      if (sea) {
        (sea.uniforms.uOn as THREE.IUniform).value = ramp(built, 0.3, 0.9) * show;
        sea.update(time, p, pixels);
      }
      // The object you could hold, then many of them.
      macroU.uTime.value = time;
      macroU.uGrow.value = ramp(p, 0.24, 0.6);
      macroU.uMany.value = ramp(p, 0.58, 0.98);
      macroU.uShow.value = 1;
      macroU.uHole.value = look.shape === "plane" ? R * 1.02 * ramp(show, 0, 0.3) : 0;
      macroU.uFog.value = camD * 1.8;
      macro.visible = p > 0.2 || xtal.form !== "sheet";
    },
    dispose() {
      bin.dispose();
      macro.dispose();
      scene.remove(atoms, bonds, macro, feed.points, back.mesh);
    },
  };
};

export default lattice;
