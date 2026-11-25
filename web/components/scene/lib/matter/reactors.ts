/**
 * The machines the reactor kind draws, each centred on the origin, about 1.5 units across, with
 * whatever burns at its heart at the origin: a tokamak's D-shaped plasma inside its field coils,
 * a stellarator's twisted plasma inside its non-planar coils, laser beams converging on a target,
 * a fission core in its pool glowing Cherenkov blue, a geothermal well into hot rock, and a vessel
 * of molten rock or salt. Heat runs 0 (cold) to 1 (burning); glow scales how bright it burns.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { annulus, type Bin, glowPoints, LIGHT, lin, solid, surface } from "./common.ts";

export type ReactorType =
  | "tokamak"
  | "stellarator"
  | "laser"
  | "fission"
  | "geothermal"
  | "thermal";

export interface Machine {
  group: THREE.Group;
  /** How far out it reaches, for framing. */
  radius: number;
  /** The y of the floor it stands on. */
  floor: number;
  /** The height the camera looks at. */
  centre: number;
  /** The colour of its heart, for the fleet's lights. */
  core: string;
  update(time: number, heat: number, p: number, pixels: number): void;
}

/** The cutaway: the side toward the story's first camera stays open. */
const WEDGE: [number, number] = [0.25, 1.95];

const PLASMA_VERT = /* glsl */ `
${VERT_HEAD}
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

/** Glowing gas: brightest at the limb, where the eye looks through the most of it, with filaments
 * streaming along the field. */
const PLASMA_FRAG = /* glsl */ `
${FRAG_HEAD}
${NOISE}
uniform float uHeat;
uniform float uTime;
uniform float uGain;
uniform float uTwist;
uniform vec3 cCool;
uniform vec3 cHot;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float mu = abs(dot(normalize(vN), V));
  float limb = pow(clamp(1.0 - mu, 0.0, 1.0), 1.4);
  float s = vUv.x * 6.0 - vUv.y * uTwist;
  float flow = vnoise(vec3(s * 3.0, vUv.y * 40.0 - uTime * 2.0, uTime * 0.3)) * 0.6
    + vnoise(vec3(s * 9.0, vUv.y * 120.0 - uTime * 5.0, 1.0)) * 0.4;
  float b = (0.06 + 0.94 * limb) * (0.45 + 1.0 * flow);
  vec3 col = mix(cCool, cHot, smoothstep(0.2, 1.0, uHeat));
  gl_FragColor = vec4(col * b * uHeat * uGain, 1.0);
  ${FRAG_TAIL}
}`;

function plasmaMat(
  ctx: KindContext,
  bin: Bin,
  heat: { value: number },
  gain: number,
  twist: number,
) {
  const T = ctx.three;
  const uniforms = {
    uHeat: heat,
    uTime: { value: 0 },
    uGain: { value: gain },
    uTwist: { value: twist },
    cCool: { value: lin(ctx, "#ff5fa8") },
    cHot: { value: lin(ctx, "#c9a4ff").lerp(lin(ctx, "#ffffff"), 0.35) },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: PLASMA_VERT,
      fragmentShader: PLASMA_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  return { mat, time: uniforms.uTime };
}

/** Glowing lines along a path, with pulses running along them. */
function glowLines(
  ctx: KindContext,
  bin: Bin,
  paths: [number, number, number][][],
  colour: string,
  closed: boolean,
): { lines: THREE.LineSegments; on: { value: number }; time: { value: number } } {
  const T = ctx.three;
  const pos: number[] = [];
  const along: number[] = [];
  for (const path of paths) {
    const n = path.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = path[i] as [number, number, number];
      const b = path[(i + 1) % n] as [number, number, number];
      pos.push(...a, ...b);
      along.push(i / n, (i + 1) / n);
    }
  }
  const geo = bin.add(new T.BufferGeometry());
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aAlong", new T.Float32BufferAttribute(along, 1));
  const uniforms = { uOn: { value: 0 }, uTime: { value: 0 }, cColour: { value: lin(ctx, colour) } };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: `${VERT_HEAD}\nattribute float aAlong; varying float vAlong;\nvoid main(){ vAlong = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
      fragmentShader: `${FRAG_HEAD}\nuniform float uOn; uniform float uTime; uniform vec3 cColour; varying float vAlong;\nvoid main(){ float pulse = pow(max(0.5 + 0.5 * sin((vAlong * 24.0 - uTime * 1.5) * 6.2832), 0.0), 6.0); gl_FragColor = vec4(cColour * (0.25 + 1.2 * pulse) * uOn, 1.0); ${FRAG_TAIL} }`,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  return { lines: new T.LineSegments(geo, mat), on: uniforms.uOn, time: uniforms.uTime };
}

/** An additive glowing mesh with a facing falloff: a halo, a shock shell, a beam of light. */
function haloMat(ctx: KindContext, bin: Bin, colour: string, power = 2) {
  const T = ctx.three;
  const uniforms = {
    uOn: { value: 0 },
    cColour: { value: lin(ctx, colour) },
    uPow: { value: power },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: `${VERT_HEAD}\nvarying vec3 vW; varying vec3 vN;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
      fragmentShader: `${FRAG_HEAD}\nuniform float uOn; uniform float uPow; uniform vec3 cColour; varying vec3 vW; varying vec3 vN;\nvoid main(){ float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW))); float k = pow(clamp(mu, 0.0, 1.0), uPow); gl_FragColor = vec4(cColour * k * uOn, 1.0); ${FRAG_TAIL} }`,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  return { mat, on: uniforms.uOn };
}

// --- Tokamak ------------------------------------------------------------------------------------

function tokamak(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  // ITER-like shape: major radius 1, minor 0.36, elongation 1.7, triangularity 0.35.
  const R0 = 1;
  const A = 0.36;
  const K = 1.7;
  const D = 0.35;
  const dshape = (a: number, k: number) => (th: number, ph: number) => {
    const R = R0 + a * Math.cos(th + D * Math.sin(th));
    return [R * Math.cos(ph), k * a * Math.sin(th), R * Math.sin(ph)] as [number, number, number];
  };
  const pm = plasmaMat(ctx, bin, heat, 0.16 + 0.32 * glow, 18);
  const plasma = new T.Mesh(bin.add(surface(T, dshape(A, K), 48, 128)), pm.mat);
  const core = new T.Mesh(bin.add(surface(T, dshape(A * 0.55, K), 32, 96)), pm.mat);
  g.add(plasma, core);
  // The vessel, cut open, its inner wall tiled.
  const vessel = new T.Mesh(
    bin.add(surface(T, dshape(A * 1.38, K * 0.96), 48, 128)),
    solid(ctx, bin, {
      colour: "#5d6470",
      rim: "#2a3040",
      gloss: 0.6,
      wedge: WEDGE,
      panel: 9,
      heat,
      heatColour: "#ff8fd0",
    }),
  );
  g.add(vessel);
  // Eighteen D-shaped toroidal field coils, the ones in the cut left out.
  const coilPts: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const th = (i / 64) * Math.PI * 2;
    const R = 1.08 + 0.72 * Math.cos(th + 0.3 * Math.sin(th));
    coilPts.push(new T.Vector3(R, 1.4 * 0.72 * Math.sin(th), 0));
  }
  const coilGeo = bin.add(
    new T.TubeGeometry(new T.CatmullRomCurve3(coilPts, true), 96, 0.06, 6, true),
  );
  const coilAngles: number[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.17;
    const w = Math.atan2(Math.sin(a), Math.cos(a));
    if (w > WEDGE[0] - 0.12 && w < WEDGE[1] + 0.12) continue;
    coilAngles.push(a);
  }
  const coilMat = solid(ctx, bin, {
    colour: "#8a8f9a",
    rim: "#3a4458",
    gloss: 0.9,
    heat,
    heatColour: "#ff9ad8",
  });
  const coils = bin.add(new T.InstancedMesh(coilGeo, coilMat, coilAngles.length));
  const m = new T.Matrix4();
  coilAngles.forEach((a, i) => {
    coils.setMatrixAt(i, m.makeRotationY(-a));
  });
  g.add(coils);
  // The central solenoid and the poloidal field rings.
  const cs = new T.Mesh(
    bin.add(new T.CylinderGeometry(0.3, 0.3, 2.3, 40, 1)),
    solid(ctx, bin, { colour: "#b07a4a", rim: "#4a3020", gloss: 0.7, panel: 14 }),
  );
  g.add(cs);
  const pfMat = solid(ctx, bin, { colour: "#7a808c", rim: "#303848", gloss: 0.8 });
  for (const [y, r] of [
    [1.12, 0.95],
    [-1.12, 0.95],
    [0.82, 1.85],
    [-0.82, 1.85],
  ] as const) {
    const ring = new T.Mesh(bin.add(new T.TorusGeometry(r, 0.06, 8, 96)), pfMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  // The divertor's strike points, where the plasma's exhaust lands, burning brightest.
  const strike = haloMat(ctx, bin, "#ffd0f0", 0.5);
  for (const r of [0.86, 1.16]) {
    const ring = new T.Mesh(bin.add(new T.TorusGeometry(r, 0.012, 6, 128)), strike.mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -K * A - 0.07;
    g.add(ring);
  }
  // Ions streaming round the field lines, each on its own flux surface.
  const ions = glowPoints(ctx, bin, {
    count: 5000,
    seed: 41,
    colour: "#ffc4f0",
    size: 0.016,
    maxPx: 5,
    uniforms: { uHeat: heat },
    decl: "uniform float uHeat;",
    body: /* glsl */ `
      float rho = 0.15 + 0.85 * sqrt(aSeed.x);
      float q = 1.0 + 2.6 * rho * rho;
      float ph = aSeed.y * 6.2832 + uTime * (0.5 + 0.5 * aSeed.z);
      float th = aSeed.w * 6.2832 + ph / q;
      float R = ${R0.toFixed(2)} + ${A.toFixed(2)} * rho * cos(th + ${D.toFixed(2)} * sin(th));
      pos = vec3(R * cos(ph), ${(K * A).toFixed(3)} * rho * sin(th), R * sin(ph));
      alpha = uHeat * (0.25 + 0.75 * aSeed2.x) * (1.2 - rho * 0.6);
      col = mix(cColour, vec3(1.0, 0.95, 1.0), aSeed2.y * 0.6);`,
  });
  g.add(ions.points);
  // Field lines on the edge, lit from the moment the coils are energised.
  const fieldPaths: [number, number, number][][] = [];
  for (let l = 0; l < 6; l++) {
    const path: [number, number, number][] = [];
    for (let i = 0; i < 540; i++) {
      const ph = (i / 540) * Math.PI * 2 * 3;
      const th = (l / 6) * Math.PI * 2 + ph / 3;
      path.push(dshape(A * 1.08, K)(th, ph));
    }
    fieldPaths.push(path);
  }
  const field = glowLines(ctx, bin, fieldPaths, "#7fb8ff", true);
  g.add(field.lines);
  return {
    group: g,
    radius: 2,
    floor: -1.45,
    centre: 0,
    core: "#ff8fdc",
    update(time, h, p, pixels) {
      heat.value = h;
      pm.time.value = time;
      strike.on.value = h * h * (0.6 + 0.8 * glow);
      ions.update(time, p, pixels);
      field.on.value = 0.25 + 0.5 * (1 - h);
      field.time.value = time;
    },
  };
}

// --- Stellarator ----------------------------------------------------------------------------------

function stellarator(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  // Five field periods: the cross-section is an ellipse that turns half a turn each period while
  // the axis rises and falls, as in Wendelstein 7-X.
  const N = 5;
  const R0 = 1.05;
  const A = 0.25;
  const E = 0.45;
  const surf = (a: number, e: number) => (th: number, ph: number) => {
    const al = (N * ph) / 2;
    const u = a * (1 + e) * Math.cos(th);
    const w = a * (1 - e) * Math.sin(th);
    const ur = u * Math.cos(al) - w * Math.sin(al);
    const wr = u * Math.sin(al) + w * Math.cos(al);
    const R = R0 + 0.12 * Math.cos(N * ph) + ur;
    return [R * Math.cos(ph), -0.12 * Math.sin(N * ph) + wr, R * Math.sin(ph)] as [
      number,
      number,
      number,
    ];
  };
  const pm = plasmaMat(ctx, bin, heat, 0.16 + 0.32 * glow, 12);
  g.add(new T.Mesh(bin.add(surface(T, surf(A, E), 40, 200)), pm.mat));
  g.add(new T.Mesh(bin.add(surface(T, surf(A * 0.5, E), 24, 160)), pm.mat));
  // Modular coils, each bent out of its plane to follow the twist; a period left out to see in.
  const nc = ctx.detail < 0.5 ? 35 : 50;
  const coilMat = solid(ctx, bin, {
    colour: "#9aa0ab",
    rim: "#3a4458",
    gloss: 0.9,
    heat,
    heatColour: "#ff9ad8",
  });
  for (let i = 0; i < nc; i++) {
    const ph0 = ((i + 0.5) / nc) * Math.PI * 2;
    const w = Math.atan2(Math.sin(ph0), Math.cos(ph0));
    if (w > WEDGE[0] && w < WEDGE[1] - 0.2) continue;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 48; k++) {
      const th = (k / 48) * Math.PI * 2;
      const ph = ph0 + 0.05 * Math.sin(th + N * ph0);
      pts.push(new T.Vector3(...surf(A * 1.95, 0.18)(th, ph)));
    }
    const geo = bin.add(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 64, 0.035, 5, true));
    g.add(new T.Mesh(geo, coilMat));
  }
  // The ring that holds the coils.
  const ring = new T.Mesh(
    bin.add(new T.TorusGeometry(R0, 0.05, 8, 128)),
    solid(ctx, bin, { colour: "#5d6470", rim: "#2a3040", gloss: 0.6 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.72;
  g.add(ring);
  const ions = glowPoints(ctx, bin, {
    count: 5000,
    seed: 43,
    colour: "#ffc4f0",
    size: 0.015,
    maxPx: 5,
    uniforms: { uHeat: heat },
    decl: /* glsl */ `
      uniform float uHeat;
      vec3 surf(float a, float th, float ph) {
        float al = ${N}.0 * ph / 2.0;
        float u = a * ${(1 + E).toFixed(2)} * cos(th);
        float w = a * ${(1 - E).toFixed(2)} * sin(th);
        float ur = u * cos(al) - w * sin(al);
        float wr = u * sin(al) + w * cos(al);
        float R = ${R0.toFixed(2)} + 0.12 * cos(${N}.0 * ph) + ur;
        return vec3(R * cos(ph), -0.12 * sin(${N}.0 * ph) + wr, R * sin(ph));
      }`,
    body: /* glsl */ `
      float rho = 0.15 + 0.85 * sqrt(aSeed.x);
      float ph = aSeed.y * 6.2832 + uTime * (0.4 + 0.4 * aSeed.z);
      float th = aSeed.w * 6.2832 + ph * 0.9;
      pos = surf(${A.toFixed(2)} * rho, th, ph);
      alpha = uHeat * (0.25 + 0.75 * aSeed2.x) * (1.2 - rho * 0.6);
      col = mix(cColour, vec3(1.0, 0.95, 1.0), aSeed2.y * 0.6);`,
  });
  g.add(ions.points);
  // Coil current, lit before the plasma: field lines on the last closed surface.
  const paths: [number, number, number][][] = [];
  for (let l = 0; l < 5; l++) {
    const path: [number, number, number][] = [];
    for (let i = 0; i < 600; i++) {
      const ph = (i / 600) * Math.PI * 2;
      path.push(surf(A * 1.12, E)((l / 5) * Math.PI * 2 + ph * 0.9 * 1, ph));
    }
    paths.push(path);
  }
  const field = glowLines(ctx, bin, paths, "#7fb8ff", false);
  g.add(field.lines);
  return {
    group: g,
    radius: 1.8,
    floor: -0.78,
    centre: 0,
    core: "#ff8fdc",
    update(time, h, p, pixels) {
      heat.value = h;
      pm.time.value = time;
      ions.update(time, p, pixels);
      field.on.value = 0.25 + 0.5 * (1 - h);
      field.time.value = time;
    },
  };
}

// --- Laser (inertial fusion) -------------------------------------------------------------------------

function laser(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  const flashLight = { value: 0 };
  const RC = 1.3;
  // The target chamber, opened on one side.
  g.add(
    new T.Mesh(
      bin.add(new T.SphereGeometry(RC, 64, 32)),
      solid(ctx, bin, {
        colour: "#6f7682",
        rim: "#283040",
        gloss: 0.7,
        wedge: WEDGE,
        panel: 6,
        // The chamber is lit by each burn, not by the beams.
        heat: flashLight,
        heatColour: "#d8c8ff",
      }),
    ),
  );
  // Beams in cones about each pole, as at the National Ignition Facility: they enter the gold
  // can's two ends, which turn their light to X-rays that crush the capsule inside.
  const cones: [number, number][] = [
    [23.5, 4],
    [30, 4],
    [44.5, 8],
    [50, 8],
  ];
  const beams: { port: THREE.Vector3; aim: THREE.Vector3 }[] = [];
  for (const top of [1, -1])
    for (const [deg, n] of cones)
      for (let i = 0; i < n; i++) {
        const th = (deg * Math.PI) / 180;
        const ph = (i / n) * Math.PI * 2 + deg * 0.05 + (top < 0 ? Math.PI / n : 0);
        const port = new T.Vector3(
          Math.sin(th) * Math.cos(ph),
          top * Math.cos(th),
          Math.sin(th) * Math.sin(ph),
        ).multiplyScalar(RC);
        beams.push({ port, aim: new T.Vector3(0, top * 0.055, 0) });
      }
  const nb = beams.length;
  const cyl = bin.add(new T.CylinderGeometry(1, 1, 1, 6, 1, true));
  cyl.translate(0, 0.5, 0);
  const bg = bin.add(new T.InstancedBufferGeometry());
  bg.index = cyl.index;
  bg.setAttribute("position", cyl.getAttribute("position"));
  bg.setAttribute("normal", cyl.getAttribute("normal"));
  const from = new Float32Array(nb * 3);
  const to = new Float32Array(nb * 3);
  beams.forEach((b, i) => {
    // Each beamline starts well outside the chamber, at the laser bays.
    const out = b.port.clone().multiplyScalar(2.6);
    from.set([out.x, out.y, out.z], i * 3);
    to.set([b.aim.x, b.aim.y, b.aim.z], i * 3);
  });
  bg.setAttribute("aFrom", new T.InstancedBufferAttribute(from, 3));
  bg.setAttribute("aTo", new T.InstancedBufferAttribute(to, 3));
  bg.instanceCount = nb;
  const beamU = {
    uShot: { value: 0 },
    uArm: { value: 0 },
    cColour: { value: lin(ctx, "#a98bff") },
  };
  const beamMat = bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        attribute vec3 aFrom;
        attribute vec3 aTo;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vec3 d = aTo - aFrom;
          float len = length(d);
          vec3 t = d / len;
          vec3 up = abs(t.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 bx = normalize(cross(up, t));
          vec3 bz = cross(t, bx);
          // Wide in the beamline, focused to a point at the target.
          float r = mix(0.05, 0.004, smoothstep(0.55, 1.0, position.y));
          vec3 p = aFrom + bx * position.x * r + t * position.y * len + bz * position.z * r;
          vAlong = position.y;
          vN = normalize(bx * normal.x + bz * normal.z);
          vec4 w = modelMatrix * vec4(p, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform float uShot;
        uniform float uArm;
        uniform vec3 cColour;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
          // The pulse races in from the bays; behind it, the beam's light fades.
          float front = uShot / 0.36;
          float lit = smoothstep(front - 0.5, front, vAlong) * (1.0 - smoothstep(front, front + 0.02, vAlong));
          float b = lit * step(uShot, 0.42) * 2.2 + uArm * 0.12;
          b *= 0.5 + 0.5 * mu;
          b *= 1.0 + 2.5 * smoothstep(0.85, 1.0, vAlong);
          gl_FragColor = vec4(cColour * b, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: beamU,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  const beamMesh = new T.Mesh(bg, beamMat);
  beamMesh.frustumCulled = false;
  g.add(beamMesh);
  // The ports where the beams come in.
  const portGeo = bin.add(new T.TorusGeometry(0.075, 0.018, 6, 20));
  const ports = bin.add(
    new T.InstancedMesh(
      portGeo,
      solid(ctx, bin, { colour: "#b8bec8", rim: "#7a6cff", gloss: 1 }),
      nb,
    ),
  );
  const o = new T.Object3D();
  beams.forEach((b, i) => {
    o.position.copy(b.port);
    o.lookAt(0, 0, 0);
    o.updateMatrix();
    ports.setMatrixAt(i, o.matrix);
  });
  g.add(ports);
  // The gold can, held at the centre on a long arm.
  const can = new T.Mesh(
    bin.add(new T.CylinderGeometry(0.035, 0.035, 0.1, 24, 1, true)),
    solid(ctx, bin, { colour: "#e0a84a", rim: "#ffcf7a", gloss: 1.2 }),
  );
  g.add(can);
  const canGlow = haloMat(ctx, bin, "#fff0d0", 0.6);
  const canHot = new T.Mesh(
    bin.add(new T.CylinderGeometry(0.037, 0.037, 0.102, 24, 1, true)),
    canGlow.mat,
  );
  g.add(canHot);
  const arm = new T.Mesh(
    bin.add(new T.CylinderGeometry(0.012, 0.02, RC, 8)),
    solid(ctx, bin, { colour: "#9aa0ab", rim: "#303848", gloss: 0.8 }),
  );
  arm.position.set(-RC / 2, 0, -0.02);
  arm.rotation.z = Math.PI / 2;
  g.add(arm);
  // The burn: a flash, a shell of debris and neutrons flying out.
  const flashMat = haloMat(ctx, bin, "#fff4e6", 0.4);
  const flash = new T.Mesh(bin.add(new T.SphereGeometry(1, 32, 16)), flashMat.mat);
  g.add(flash);
  const shellMat = haloMat(ctx, bin, "#b9a0ff", 3);
  const shell = new T.Mesh(bin.add(new T.SphereGeometry(1, 48, 24)), shellMat.mat);
  g.add(shell);
  const burstU = { uBurst: { value: 0 }, uHeat: heat };
  const neutrons = glowPoints(ctx, bin, {
    count: 1500,
    seed: 47,
    colour: "#ffe6c0",
    size: 0.02,
    maxPx: 4,
    uniforms: burstU,
    decl: "uniform float uBurst; uniform float uHeat;",
    body: /* glsl */ `
      vec3 d = normalize(aSeed.xyz * 2.0 - 1.0 + 1e-3);
      float r = uBurst * (0.4 + 1.2 * aSeed.w) * 1.3;
      pos = d * r;
      alpha = uHeat * step(0.001, uBurst) * (1.0 - smoothstep(0.6, 1.0, uBurst)) * (0.4 + 0.6 * aSeed2.x);`,
  });
  g.add(neutrons.points);
  return {
    group: g,
    radius: 1.9,
    floor: -1.45,
    centre: 0,
    core: "#c9b0ff",
    update(time, h, p, pixels) {
      heat.value = h;
      // One shot at a time on the bench, ten a second at a plant (slowed here to be seen). A still
      // frame shows the beams arriving on the bench and the burn once the target ignites.
      const rate = 0.25 + 0.6 * h;
      const c = (time * rate + 0.4 + 0.08 * h) % 1;
      beamU.uShot.value = c;
      beamU.uArm.value = 0.5 + 0.5 * h;
      const implode = Math.max(0, Math.min(1, (c - 0.33) / 0.1));
      canGlow.on.value = implode * (c < 0.5 ? 1 : 0) * (0.6 + h);
      const burst = c > 0.43 ? Math.min(1, (c - 0.43) / 0.4) : 0;
      const gain = 0.25 + 0.75 * h;
      flashMat.on.value = burst > 0 ? (1 - burst) ** 2 * gain * (1.5 + 2 * glow) : 0;
      flashLight.value = burst > 0 ? (1 - burst) ** 3 * gain * 0.3 : 0;
      flash.scale.setScalar(0.03 + 0.25 * burst * gain);
      shellMat.on.value = burst > 0 ? (1 - burst) * gain * 0.8 : 0;
      shell.scale.setScalar(0.05 + burst * RC * 0.95);
      burstU.uBurst.value = burst;
      neutrons.update(time, p, pixels);
    },
  };
}

// --- Fission --------------------------------------------------------------------------------------------

function fission(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  // A pool-type core: hexagonal fuel assemblies under water, control rods between them.
  const P = 0.2;
  const rings = 4;
  const cells: [number, number][] = [];
  for (let q = -rings; q <= rings; q++)
    for (let r = -rings; r <= rings; r++) {
      if (Math.abs(q + r) > rings) continue;
      cells.push([P * (q + r / 2), P * r * (Math.sqrt(3) / 2)]);
    }
  const asmGeo = bin.add(new T.CylinderGeometry(P * 0.55, P * 0.55, 1.2, 6, 1));
  const fuelU = {
    uHeat: heat,
    cBlue: { value: lin(ctx, "#4cc2ff") },
    uGlow: { value: 0.5 + glow },
  };
  const fuelMat = bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vW;
        varying vec3 vN;
        varying vec3 vL;
        void main() {
          vL = position;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        ${LIGHT}
        uniform float uHeat;
        uniform float uGlow;
        uniform vec3 cBlue;
        varying vec3 vW;
        varying vec3 vN;
        varying vec3 vL;
        void main() {
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          // Rods: vertical grooves on the sides, a grid of rod ends on top.
          float top = step(0.5, N.y);
          float groove = 0.5 + 0.5 * cos(atan(vL.z, vL.x) * 18.0);
          vec2 g = abs(fract(vL.xz * 60.0) - 0.5);
          float rod = 1.0 - smoothstep(0.22, 0.32, length(g));
          vec3 base = vec3(0.34, 0.37, 0.42) * (0.8 + 0.2 * mix(groove, rod, top));
          vec3 c = lit(base, N, V, vec3(0.1, 0.25, 0.4));
          // Cherenkov light: electrons outrunning light in water glow blue, brightest at the core.
          float k = uHeat * uGlow * (1.0 - smoothstep(0.0, 1.0, length(vW.xz)));
          c += cBlue * k * (0.6 + 1.4 * top * rod + 0.4 * groove);
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: fuelU,
    }),
  );
  const asm = bin.add(new T.InstancedMesh(asmGeo, fuelMat, cells.length));
  const mm = new T.Matrix4();
  cells.forEach(([x, z], i) => {
    asm.setMatrixAt(i, mm.makeTranslation(x, 0, z));
  });
  g.add(asm);
  // Control rods: they rise out of the core as it goes critical.
  const rodPos = cells
    .filter((_, i) => i % 5 === 2)
    .map(([x, z]) => [x + P / 2, z + P * 0.29] as const);
  const rodGeo = bin.add(new T.CylinderGeometry(0.025, 0.025, 1.6, 8));
  const rods = bin.add(
    new T.InstancedMesh(
      rodGeo,
      solid(ctx, bin, { colour: "#2b2f36", rim: "#4cc2ff", gloss: 0.8 }),
      rodPos.length,
    ),
  );
  g.add(rods);
  // The vessel and the pool's Cherenkov glow.
  g.add(
    new T.Mesh(
      bin.add(annulus(T, 1.2, 1.32, -0.9, 1.5, WEDGE, 80)),
      solid(ctx, bin, {
        colour: "#8f969f",
        rim: "#24384c",
        gloss: 0.7,
        heat,
        heatColour: "#3fa8ff",
      }),
    ),
  );
  const floor = new T.Mesh(
    bin.add(new T.CylinderGeometry(1.32, 1.32, 0.12, 64)),
    solid(ctx, bin, { colour: "#6a717b", rim: "#203040", gloss: 0.4, heat, heatColour: "#3fa8ff" }),
  );
  floor.position.y = -0.96;
  g.add(floor);
  const waterU = {
    uHeat: heat,
    uTime: { value: 0 },
    cBlue: { value: lin(ctx, "#3aa8ff") },
    uGlow: { value: 0.5 + glow },
  };
  const water = new T.Mesh(
    bin.add(new T.CylinderGeometry(1.18, 1.18, 2.3, 64, 1, true)),
    bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW; varying vec3 vN;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          uniform float uHeat;
          uniform float uGlow;
          uniform vec3 cBlue;
          varying vec3 vW;
          varying vec3 vN;
          void main() {
            float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
            float a = atan(vW.z, vW.x);
            if (a > ${WEDGE[0].toFixed(2)} && a < ${WEDGE[1].toFixed(2)}) discard;
            float fall = exp(-max(vW.y - 0.6, 0.0) * 1.3) * smoothstep(-0.9, -0.3, vW.y);
            gl_FragColor = vec4(cBlue * (0.04 + 0.5 * uHeat * uGlow * fall) * (0.4 + 0.6 * mu), 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: waterU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    ),
  );
  water.position.y = 0.25;
  g.add(water);
  // A column of blue light rising through the water above the core.
  const column = haloMat(ctx, bin, "#3aa8ff", 1.5);
  const col = new T.Mesh(bin.add(new T.CylinderGeometry(0.55, 0.95, 1.4, 48, 1, true)), column.mat);
  col.position.y = 1.05;
  g.add(col);
  const sparks = glowPoints(ctx, bin, {
    count: 2500,
    seed: 53,
    colour: "#8fd8ff",
    size: 0.02,
    maxPx: 4,
    uniforms: { uHeat: heat, uGlow: { value: 0.5 + glow } },
    decl: "uniform float uHeat; uniform float uGlow;",
    body: /* glsl */ `
      float r = sqrt(aSeed.x) * 1.0;
      float a = aSeed.y * 6.2832;
      float y = -0.55 + aSeed.z * 1.4 + fract(uTime * 0.2 + aSeed.w) * 0.3;
      pos = vec3(cos(a) * r, y, sin(a) * r);
      float tw = pow(max(sin(uTime * 7.0 + aSeed2.x * 60.0), 0.0), 8.0);
      alpha = uHeat * uGlow * (0.15 + 0.85 * tw) * (1.0 - r * 0.6);`,
  });
  g.add(sparks.points);
  const rm = new T.Matrix4();
  return {
    group: g,
    radius: 1.7,
    floor: -1.02,
    centre: 0.3,
    core: "#5cc8ff",
    update(time, h, p, pixels) {
      heat.value = h;
      waterU.uTime.value = time;
      column.on.value = h * (0.3 + 0.5 * glow);
      rodPos.forEach(([x, z], i) => {
        rods.setMatrixAt(i, rm.makeTranslation(x, 0.05 + 1.35 * Math.min(1, h * 1.4), z));
      });
      rods.instanceMatrix.needsUpdate = true;
      sparks.update(time, p, pixels);
    },
  };
}

// --- Geothermal ------------------------------------------------------------------------------------------

function geothermal(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  const W = 6;
  const H = 4.2;
  const Dz = 3;
  const face = Dz / 2;
  // The crust in section: strata over granite over rock hot enough to glow (magma at full glow).
  const rockU = { uHeat: heat, uGlow: { value: glow }, uTime: { value: 0 }, uDepth: { value: 0 } };
  const rock = new T.Mesh(
    bin.add(new T.BoxGeometry(W, H, Dz, 1, 1, 1)),
    bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW; varying vec3 vN;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          ${NOISE}
          ${LIGHT}
          uniform float uHeat;
          uniform float uGlow;
          uniform float uTime;
          uniform float uDepth;
          varying vec3 vW;
          varying vec3 vN;
          vec3 blackbody(float t) {
            return vec3(1.0, 0.25, 0.04) * smoothstep(0.0, 0.4, t) + vec3(0.0, 0.45, 0.12) * smoothstep(0.35, 0.8, t) + vec3(0.0, 0.2, 0.3) * smoothstep(0.75, 1.0, t);
          }
          void main() {
            vec3 N = normalize(vN);
            vec3 V = normalize(cameraPosition - vW);
            float y = vW.y + (vnoise(vec3(vW.x * 0.9, 0.0, vW.z * 0.9)) - 0.5) * 0.35;
            float band = fract(y * 2.2);
            vec3 sed = mix(vec3(0.2, 0.14, 0.1), vec3(0.34, 0.26, 0.17), step(0.5, fract(y * 1.3)));
            sed *= 0.8 + 0.25 * band;
            float sp = vnoise(vW * 28.0);
            vec3 granite = mix(vec3(0.17, 0.16, 0.18), vec3(0.36, 0.33, 0.32), step(0.62, sp));
            vec3 base = mix(sed, granite, smoothstep(-1.3, -1.7, y));
            base = mix(base, vec3(0.16, 0.12, 0.11), smoothstep(-2.6, -3.4, y));
            if (N.y > 0.5) base = mix(vec3(0.12, 0.16, 0.08), vec3(0.2, 0.2, 0.12), vnoise(vW * 6.0));
            vec3 c = lit(base, N, V, vec3(0.0));
            // Heat rises toward the bottom; at full glow the bottom is a magma body, churning.
            float t = smoothstep(-2.2, -${H.toFixed(1)}, vW.y);
            float churn = vnoise(vec3(vW.x * 2.0, vW.y * 2.0 - uTime * 0.3, vW.z * 2.0 + uTime * 0.1));
            float temp = t * (0.3 + 0.4 * uGlow) * (0.75 + 0.5 * churn);
            c += blackbody(temp) * temp * (0.5 + 0.7 * uGlow) * (N.y > 0.5 ? 0.0 : 1.0);
            // Fractures opened between the wells, glowing where hot water runs through them.
            float fz = smoothstep(0.9, 0.2, abs(vW.y + 3.25)) * smoothstep(1.3, 0.8, abs(vW.x));
            float crack = smoothstep(0.08, 0.0, abs(vnoise(vec3(vW.x * 3.0, vW.y * 5.0, 2.0)) - 0.5)) * fz;
            c += vec3(1.0, 0.55, 0.2) * crack * uHeat * 1.4 * step(0.5, N.z);
            gl_FragColor = vec4(c, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: rockU,
      }),
    ),
  );
  rock.position.y = -H / 2;
  g.add(rock);
  // Two wells on the cut face: water goes down one, through the hot fractures and up the other.
  const wellX = [-1.05, 1.05];
  const bottom = -3.35;
  const wellMat = solid(ctx, bin, { colour: "#b8bec8", rim: "#ff9a50", gloss: 1 });
  const wells = wellX.map((x) => {
    const m = new T.Mesh(bin.add(new T.CylinderGeometry(0.035, 0.035, 1, 10)), wellMat);
    m.position.set(x, 0, face + 0.04);
    g.add(m);
    return m;
  });
  const bitMat = haloMat(ctx, bin, "#ffb070", 0.8);
  const bits = wellX.map((x) => {
    const b = new T.Mesh(bin.add(new T.SphereGeometry(0.07, 16, 8)), bitMat.mat);
    b.position.set(x, 0, face + 0.04);
    g.add(b);
    return b;
  });
  const flowU = { uFlow: { value: 0 } };
  const fluid = glowPoints(ctx, bin, {
    count: 1600,
    seed: 59,
    colour: "#7fd0ff",
    size: 0.05,
    maxPx: 6,
    uniforms: flowU,
    decl: "uniform float uFlow;",
    body: /* glsl */ `
      float s = fract(aSeed.x + uTime * 0.12);
      vec3 p;
      if (s < 0.38) {
        float k = s / 0.38;
        p = vec3(${wellX[0]}, mix(0.2, ${bottom}, k), 0.0);
      } else if (s < 0.62) {
        float k = (s - 0.38) / 0.24;
        p = vec3(mix(${wellX[0]}, ${wellX[1]}, k), ${bottom} + 0.25 * sin(k * 9.0 + aSeed.y * 6.0) * (aSeed.z - 0.5) * 2.0, 0.0);
      } else {
        float k = (s - 0.62) / 0.38;
        p = vec3(${wellX[1]}, mix(${bottom}, 0.2, k), 0.0);
      }
      pos = p + vec3((aSeed2.x - 0.5) * 0.05, 0.0, ${(face + 0.09).toFixed(2)});
      col = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.6, 0.25), smoothstep(0.38, 0.62, s));
      alpha = uFlow * (0.4 + 0.6 * aSeed2.y);
      size = s > 0.62 ? 1.3 : 1.0;`,
  });
  g.add(fluid.points);
  // The plant at the surface and its plume.
  const plant = new T.Mesh(
    bin.add(new T.BoxGeometry(1.1, 0.45, 0.7)),
    solid(ctx, bin, { colour: "#c9ccd2", rim: "#304050", gloss: 0.4, panel: 8 }),
  );
  plant.position.set(0.1, 0.225, 0.4);
  g.add(plant);
  const steam = glowPoints(ctx, bin, {
    count: 900,
    seed: 61,
    colour: "#dfe8f4",
    size: 0.18,
    maxPx: 22,
    additive: false,
    uniforms: { uFlow: flowU.uFlow },
    decl: "uniform float uFlow;",
    body: /* glsl */ `
      float s = fract(aSeed.x + uTime * 0.06);
      pos = vec3(0.4 + (aSeed.y - 0.5) * 0.3 * (1.0 + s * 4.0) + s * 0.8, 0.5 + s * 2.6, 0.4 + (aSeed.z - 0.5) * 0.3 * (1.0 + s * 3.0));
      alpha = uFlow * 0.12 * (1.0 - s) * smoothstep(0.0, 0.1, s);
      size = 0.6 + s * 2.5;`,
  });
  g.add(steam.points);
  return {
    group: g,
    radius: 3.4,
    floor: 0,
    centre: -1.8,
    core: "#ff9a4a",
    update(time, h, p, pixels) {
      heat.value = h;
      rockU.uTime.value = time;
      // The drill goes down first, then water starts to run.
      const depth = Math.min(1, p / 0.16);
      const y = 0.05 + (bottom - 0.05) * depth;
      for (const w of wells) {
        w.scale.y = Math.max(0.01, -y + 0.05);
        w.position.y = (y + 0.05) / 2;
      }
      for (const b of bits) b.position.y = y;
      bitMat.on.value = depth < 1 ? 1.2 : 0.4;
      flowU.uFlow.value = Math.min(1, Math.max(0, (p - 0.12) / 0.12));
      fluid.update(time, p, pixels);
      steam.update(time, p, pixels);
    },
  };
}

// --- Thermal --------------------------------------------------------------------------------------------

function thermal(ctx: KindContext, bin: Bin, glow: number): Machine {
  const T = ctx.three;
  const g = new T.Group();
  const heat = { value: 0 };
  // A vessel in section: steel, insulation and firebrick round a core of molten rock or salt.
  const y0 = -0.9;
  const y1 = 0.8;
  const layers: [number, number, string, number][] = [
    [1.06, 1.16, "#7d848e", 0],
    [0.86, 1.06, "#cfc6b4", 0],
    [0.72, 0.86, "#a05a3c", 9],
  ];
  for (const [ri, ro, colour, panel] of layers)
    g.add(
      new T.Mesh(
        bin.add(annulus(T, ri, ro, y0, y1, WEDGE, 72)),
        solid(ctx, bin, { colour, rim: "#302820", gloss: 0.3, panel, heat, heatColour: "#ff7a2a" }),
      ),
    );
  const base = new T.Mesh(
    bin.add(annulus(T, 0, 1.16, y0 - 0.14, y0, WEDGE, 72)),
    solid(ctx, bin, {
      colour: "#a05a3c",
      rim: "#302820",
      gloss: 0.3,
      panel: 9,
      heat,
      heatColour: "#ff7a2a",
    }),
  );
  g.add(base);
  const meltU = { uHeat: heat, uGlow: { value: glow }, uTime: { value: 0 } };
  const melt = new T.Mesh(
    bin.add(annulus(T, 0, 0.72, y0, y1 - 0.25, WEDGE, 72)),
    bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW; varying vec3 vN;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          ${NOISE}
          uniform float uHeat;
          uniform float uGlow;
          uniform float uTime;
          varying vec3 vW;
          varying vec3 vN;
          void main() {
            // Convection: hot melt rising in the middle, cooler crust drifting on top.
            vec3 q = vec3(vW.x * 2.2, vW.y * 2.2 - uTime * 0.35, vW.z * 2.2);
            float n = vnoise(q) * 0.6 + vnoise(q * 2.7 + 3.0) * 0.4;
            float top = step(0.5, normalize(vN).y);
            float crust = top * smoothstep(0.55, 0.7, vnoise(vec3(vW.xz * 5.0, uTime * 0.05)));
            float t = uHeat * (0.3 + 0.32 * uGlow) * (0.7 + 0.5 * n) * (1.0 - 0.8 * crust);
            vec3 cold = vec3(0.09, 0.08, 0.08);
            vec3 hot = vec3(1.0, 0.25, 0.04) * smoothstep(0.0, 0.35, t) + vec3(0.0, 0.5, 0.15) * smoothstep(0.3, 0.75, t) + vec3(0.0, 0.25, 0.35) * smoothstep(0.7, 1.0, t);
            vec3 c = cold * (1.0 - smoothstep(0.0, 0.2, t)) + hot * t * 1.5;
            gl_FragColor = vec4(c, 1.0);
            ${FRAG_TAIL}
          }`,
        uniforms: meltU,
      }),
    ),
  );
  g.add(melt);
  // Electrodes dipping into the melt, their tips glowing.
  const electrodeMat = solid(ctx, bin, {
    colour: "#33363c",
    rim: "#ff8a40",
    gloss: 0.5,
    heat,
    heatColour: "#ff7a2a",
  });
  for (const [x, z] of [
    [-0.32, -0.25],
    [0.3, -0.3],
    [0.02, 0.32],
  ] as const) {
    const e = new T.Mesh(bin.add(new T.CylinderGeometry(0.05, 0.05, 1.3, 12)), electrodeMat);
    e.position.set(x, 0.62, z);
    g.add(e);
  }
  const fume = glowPoints(ctx, bin, {
    count: 900,
    seed: 67,
    colour: "#ffb070",
    size: 0.05,
    maxPx: 8,
    uniforms: { uHeat: heat },
    decl: "uniform float uHeat;",
    body: /* glsl */ `
      float s = fract(aSeed.x + uTime * 0.15);
      float r = sqrt(aSeed.y) * 0.65;
      float a = aSeed.z * 6.2832 + s * 2.0;
      pos = vec3(cos(a) * r * (1.0 + s * 0.4), ${(y1 - 0.25).toFixed(2)} + s * 1.6, sin(a) * r * (1.0 + s * 0.4));
      alpha = uHeat * (1.0 - s) * (0.12 + 0.3 * aSeed2.x);
      col = mix(vec3(1.0, 0.55, 0.25), vec3(0.6, 0.55, 0.7), s);`,
  });
  g.add(fume.points);
  return {
    group: g,
    radius: 1.5,
    floor: y0 - 0.14,
    centre: 0,
    core: "#ffa040",
    update(time, h, p, pixels) {
      heat.value = h;
      meltU.uTime.value = time;
      fume.update(time, p, pixels);
    },
  };
}

const BUILDERS: Record<ReactorType, (ctx: KindContext, bin: Bin, glow: number) => Machine> = {
  tokamak,
  stellarator,
  laser,
  fission,
  geothermal,
  thermal,
};

export function makeMachine(ctx: KindContext, bin: Bin, type: ReactorType, glow: number): Machine {
  return BUILDERS[type](ctx, bin, glow);
}
