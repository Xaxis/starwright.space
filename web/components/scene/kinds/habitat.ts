/**
 * A habitat people live in, cut open so its inside shows. The story opens on the first section
 * being built, then completes the hull, lets the air and light in, greens the land and spins it
 * up to gravity:
 *
 * - type: cylinder (an O'Neill cylinder: three land strips, three windows, mirrors throwing
 *   sunlight in), torus (a Stanford torus: a ring on spokes, its mirror overhead), dome (a glass
 *   dome on the Moon with gardens, a reactor and a spinning centrifuge), sphere (a Bernal sphere
 *   with farm rings at its poles) or ship (a cycler: a spinning ring on a spine of tanks,
 *   radiators and engines);
 * - spin: how fast it turns at the end (each turns once complete);
 * - green: how much of its land is fields and forest at the end.
 *
 * Units are the habitat's own; the Earth hangs far off in the black for scale.
 */

import type * as THREE from "three";
import { makeEarth } from "../lib/bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import { rng } from "../lib/particles.ts";
import { Bag, materials, shapes } from "../lib/space/craft.ts";
import {
  addSunlight,
  choice,
  farAway,
  makeBackdrop,
  mix,
  pixelScale,
  ramp,
  type Shot,
  share,
  shotPath,
  storyBeats,
} from "../lib/space/kit.ts";
import { makeDots } from "../lib/space/points.ts";
import { makeWorld } from "../lib/space/rock.ts";
import { makeShell, type Shell } from "../lib/space/shell.ts";
import type { Kind } from "../types.ts";

type HabType = "cylinder" | "torus" | "dome" | "sphere" | "ship";
const TYPES: readonly HabType[] = ["cylinder", "torus", "dome", "sphere", "ship"];

const GLASS_VERT = /* glsl */ `
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

/** A dome's glass: a fresnel sheen on a frame of struts, cut open toward the reader. */
const GLASS_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uCut;
uniform float uCutCos;
uniform float uBuilt;
uniform float uHeight;
uniform vec3 cAccent;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;
void main() {
  // Built from the ground up.
  if (vPos.y > uBuilt * uHeight + 0.01) discard;
  float edge = uCutCos > 1.0 ? -1.0 : dot(normalize(vPos.xz), normalize(uCut.xz)) - uCutCos;
  if (edge > 0.0 && vPos.y > 0.04) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 3.0);
  vec2 g = vec2(vUv.x * 48.0, vUv.y * 16.0);
  vec2 f = abs(fract(g + vec2(0.5 * floor(g.y), 0.0)) - 0.5);
  float strut = smoothstep(0.42, 0.48, max(f.x, f.y));
  float spec = pow(max(dot(N, normalize(normalize(uSun) + V)), 0.0), 80.0);
  vec3 c = vec3(0.5, 0.7, 0.9) * fres * 0.5 + vec3(0.75, 0.78, 0.82) * strut * (0.25 + 0.75 * max(dot(N, normalize(uSun)), 0.0)) + vec3(1.0) * spec * 1.5;
  c += cAccent * smoothstep(-0.04, 0.0, edge) * 2.0 * step(0.04, vPos.y);
  float a = clamp(0.08 + fres * 0.55 + strut * 0.8 + spec, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
  ${FRAG_TAIL}
}`;

/** A mirror: black space in it, the Sun's glare where the angle is right, a fine frame. */
const MIRROR_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 uCam;
uniform vec3 uSun;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uSun);
  float rl = max(dot(reflect(-V, N), L), 0.0);
  float glare = pow(rl, 30.0) + pow(rl, 4.0) * 0.12;
  float fres = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 4.0);
  vec2 g = fract(vUv * vec2(2.0, 6.0));
  float frame = max(step(0.97, g.x), step(0.985, g.y));
  vec3 c = vec3(0.02, 0.026, 0.04) + vec3(0.2, 0.26, 0.38) * fres + vec3(1.0, 0.95, 0.85) * glare * 2.5;
  c = mix(c, vec3(0.22, 0.23, 0.25) * (0.2 + 0.8 * max(dot(N, L), 0.0)), frame);
  gl_FragColor = vec4(c, 1.0);
  ${FRAG_TAIL}
}`;

interface Build {
  shots: Shot[];
  /** The spinning part. */
  spinner: THREE.Object3D;
  shells: Shell[];
  /** Per frame: the story's share built (0 to 1) and progress. */
  step(built: number, p: number, time: number, pixel: number): void;
  dispose(): void;
}

const habitat: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const type = choice(ctx, "type", TYPES, "cylinder");
  const spin = share(ctx, "spin", 0.5);
  const green = share(ctx, "green", 0.6);
  const accent = ctx.colour;
  const bag = new Bag();
  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  const r = rng(301);

  const sunDir = new T.Vector3(-0.62, 0.5, 0.6).normalize();
  const sky = makeBackdrop(ctx);
  addSunlight(ctx, sunDir, 2.4, 0.2);
  const mirrorU = { uCam: { value: new T.Vector3() }, uSun: { value: sunDir } };
  const mirror = bag.add(
    new T.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: MIRROR_FRAG,
      uniforms: mirrorU,
      side: T.DoubleSide,
    }),
  );
  // Radiators: pale panels, cool on a habitat that is not making much heat.
  const radiator = bag.add(
    new T.MeshStandardMaterial({
      color: "#a7adb5",
      roughness: 0.55,
      metalness: 0.2,
      side: T.DoubleSide,
    }),
  );
  /** The cut faces this way in the world: toward where the story's camera mostly is. */
  const cutWorld = new T.Vector3(0.12, 0.42, 1).normalize();
  const sunFar = sunDir.clone().multiplyScalar(1e6);

  // The Earth far off, for scale and for home.
  const earth = makeEarth(ctx, { sun: sunFar });
  scene.add(earth.group);
  const placeEarth = farAway(
    ctx,
    earth.group,
    type === "dome" ? new T.Vector3(0.5, 0.55, -1) : new T.Vector3(0.9, -0.25, -1),
    type === "dome" ? 2000 : 30000,
    type === "dome" ? 33 : 400,
  );

  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    p: [number, number, number],
    sc: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ) => {
    const x = new T.Mesh(geo, mat);
    x.position.set(...p);
    x.scale.set(...sc);
    x.rotation.set(...rot);
    return x;
  };

  // --- The builds ---------------------------------------------------------------------------------
  const builds: Record<HabType, () => Build> = {
    cylinder() {
      const hab = new T.Group();
      hab.rotation.z = Math.PI / 2;
      scene.add(hab);
      const spinner = new T.Group();
      hab.add(spinner);
      const half = 3;
      const shell = makeShell(ctx, new T.CylinderGeometry(1, 1, half * 2, 144, 36, true), 0, {
        size: half,
        scale: 10,
        sun: sunDir,
      });
      shell.uniforms.uCutLen.value = half * 0.7;
      spinner.add(shell.outer, shell.inner);
      const caps = [half, -half].map((y) => mesh(s.cyl, m.hull, [0, y, 0], [2, 0.02, 2]));
      const spindles = [half, -half].map((y) =>
        mesh(s.cyl, m.dark, [0, y + Math.sign(y) * 0.35, 0], [0.22, 0.7, 0.22]),
      );
      spinner.add(...caps, ...spindles);
      // Mirrors over the three window strips, hinged at the sunward end.
      const mirrors = [0, 1, 2].map((k) => {
        const th = 2 * Math.PI * (k / 3 + 0.25);
        const radial = new T.Vector3(Math.sin(th), 0, Math.cos(th));
        const tilt = 0.42;
        const len = half * 2;
        const hinge = radial.clone().add(new T.Vector3(0, half, 0));
        const along = new T.Vector3(0, Math.cos(tilt), 0).addScaledVector(radial, Math.sin(tilt));
        const x = mesh(s.box, mirror, [0, 0, 0], [1.0, len, 0.008]);
        x.position.copy(hinge).addScaledVector(along, len / 2);
        x.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), along);
        x.rotateY(th);
        spinner.add(x);
        return x;
      });
      return {
        shots: [
          { at: 0, d: 2.9, az: 1.25, el: 0.32, target: [0, 0, 0] },
          { at: 0.4, d: 6.2, az: 1.38, el: 0.36, target: [0, 0, 0] },
          { at: 1, d: 12.5, az: 1.18, el: 0.42, target: [-1.2, 0, 0] },
        ],
        spinner,
        shells: [shell],
        step(built, p) {
          shell.uniforms.uBuilt.value = built;
          for (const c of caps) c.visible = built > 0.99;
          for (const x of spindles) x.visible = built > 0.99;
          mirrors.forEach((x, i) => {
            x.visible = p > 0.5 + i * 0.05;
          });
        },
        dispose() {
          shell.dispose();
        },
      };
    },

    torus() {
      const hab = new T.Group();
      hab.rotation.x = 0.18;
      scene.add(hab);
      const spinner = new T.Group();
      hab.add(spinner);
      const R = 2;
      const geo = new T.TorusGeometry(R, 0.22, 40, 240);
      geo.rotateX(Math.PI / 2);
      const shell = makeShell(ctx, geo, 1, { size: R, scale: 10, sun: sunDir });
      for (const x of [shell.outer, shell.inner]) x.rotation.y = Math.PI / 2;
      spinner.add(shell.outer, shell.inner);
      const hub = mesh(s.ball, m.hull, [0, 0, 0], [0.6, 0.6, 0.6]);
      const spindle = mesh(s.cyl, m.dark, [0, 0, 0], [0.12, 2.4, 0.12]);
      const spokes = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
        const x = mesh(
          s.cyl,
          m.hull,
          [Math.cos(a) * (R / 2 + 0.1), 0, Math.sin(a) * (R / 2 + 0.1)],
          [0.07, R - 0.45, 0.07],
        );
        x.rotation.set(0, -a, Math.PI / 2);
        return { x, a };
      });
      const fins = [-1, 1].map((k) => mesh(s.box, radiator, [0, k * 0.8, 0], [0.7, 0.22, 0.01]));
      spinner.add(hub, spindle, ...spokes.map((x) => x.x), ...fins);
      // The mirror overhead, holding still while the ring turns.
      const annulus = bag.add(new T.RingGeometry(R * 0.45, R * 1.05, 120, 1).rotateX(-Math.PI / 2));
      const disc = mesh(annulus, mirror, [0, 1.5, -2.7], [0.8, 0.8, 0.8], [-0.85, 0, 0]);
      hab.add(disc);
      return {
        shots: [
          { at: 0, d: 1.5, az: 1.75, el: 0.38, target: [-0.38, 0.05, 1.96] },
          { at: 0.4, d: 4.4, az: 1.6, el: 0.42, target: [0, 0, 0.8] },
          { at: 1, d: 9.2, az: 1.45, el: 0.5, target: [0, 0.35, -0.3] },
        ],
        spinner,
        shells: [shell],
        step(built, p) {
          shell.uniforms.uBuilt.value = built;
          // A spoke goes in once the ring reaches it.
          for (const { x, a } of spokes) {
            const at = (((Math.PI / 2 - a + Math.PI * 3) % (Math.PI * 2)) / (Math.PI * 2)) % 1;
            x.visible = p > 0.08 && (built > at || built > 0.99);
          }
          hub.visible = spindle.visible = p > 0.05;
          for (const f of fins) f.visible = p > 0.3;
          disc.visible = p > 0.55;
        },
        dispose() {
          shell.dispose();
        },
      };
    },

    sphere() {
      const hab = new T.Group();
      hab.rotation.z = 0.35;
      scene.add(hab);
      const spinner = new T.Group();
      hab.add(spinner);
      const R = 1.6;
      const shell = makeShell(ctx, new T.SphereGeometry(R, 120, 80), 2, {
        size: R,
        scale: 12,
        sun: sunDir,
      });
      spinner.add(shell.outer, shell.inner);
      const rings = [2.35, -2.35].map((y) => {
        const geo = new T.TorusGeometry(1.25, 0.2, 32, 160);
        geo.rotateX(Math.PI / 2);
        const sh = makeShell(ctx, geo, 1, { size: 1.25, scale: 8, sun: sunDir });
        for (const x of [sh.outer, sh.inner]) x.position.y = y;
        spinner.add(sh.outer, sh.inner);
        return sh;
      });
      const spindle = mesh(s.cyl, m.dark, [0, 0, 0], [0.16, 6.4, 0.16]);
      const fins = [-1, 1].map((k) => mesh(s.box, radiator, [0, k * 3.4, 0], [1.1, 0.35, 0.01]));
      spinner.add(spindle, ...fins);
      return {
        shots: [
          { at: 0, d: 3.2, az: 1.45, el: 0.12, target: [0, 0, 1] },
          { at: 0.4, d: 6.2, az: 1.4, el: 0.32, target: [0, 0, 0] },
          { at: 1, d: 10.5, az: 1.3, el: 0.4, target: [0, 0, 0] },
        ],
        spinner,
        shells: [shell, ...rings],
        step(built, p) {
          shell.uniforms.uBuilt.value = built;
          rings.forEach((sh, i) => {
            sh.uniforms.uBuilt.value = Math.max(0.001, ramp(p, 0.45 + i * 0.1, 0.7 + i * 0.1));
            sh.outer.visible = sh.inner.visible = p > 0.45 + i * 0.1;
          });
          spindle.visible = p > 0.05;
          for (const f of fins) f.visible = p > 0.3;
        },
        dispose() {
          shell.dispose();
          for (const sh of rings) sh.dispose();
        },
      };
    },

    ship() {
      const hab = new T.Group();
      hab.rotation.y = 0.25;
      scene.add(hab);
      const holder = new T.Group();
      holder.rotation.z = -Math.PI / 2;
      holder.position.x = 1.4;
      hab.add(holder);
      const spinner = new T.Group();
      holder.add(spinner);
      const R = 1.0;
      const geo = new T.TorusGeometry(R, 0.13, 32, 200);
      geo.rotateX(Math.PI / 2);
      const shell = makeShell(ctx, geo, 1, { size: R, scale: 8, sun: sunDir });
      for (const x of [shell.outer, shell.inner]) x.rotation.y = Math.PI / 2;
      spinner.add(shell.outer, shell.inner);
      const spokes = [0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        const x = mesh(
          s.cyl,
          m.hull,
          [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5],
          [0.05, R - 0.12, 0.05],
        );
        x.rotation.set(0, -a, Math.PI / 2);
        return x;
      });
      spinner.add(...spokes);
      const spine = mesh(s.cyl, m.dark, [-0.6, 0, 0], [0.12, 5.4, 0.12], [0, 0, Math.PI / 2]);
      const hub = mesh(s.cyl, m.dark, [1.4, 0, 0], [0.32, 0.5, 0.32], [0, 0, Math.PI / 2]);
      const tanks = [-0.1, 0.35, -0.55].flatMap((x) =>
        [-1, 1].map((k) => mesh(s.ball, m.tank, [x, k * 0.2, 0], [0.4, 0.4, 0.4])),
      );
      const radiators = [-1, 1].map((k) =>
        mesh(s.box, radiator, [-1.55, 0, k * 0.55], [1.4, 0.01, 0.7]),
      );
      const arrays = [-1, 1].map((k) => mesh(s.box, m.panel, [0.75, k * 0.7, 0], [0.5, 0.9, 0.01]));
      const engines = [-0.18, 0, 0.18].map((z) =>
        mesh(s.cone, m.dark, [-3.35, 0, z], [0.16, 0.3, 0.16], [0, 0, Math.PI / 2]),
      );
      hab.add(spine, hub, ...tanks, ...radiators, ...arrays, ...engines);
      const flames = makeDots(ctx, {
        positions: [-0.18, 0, 0.18].flatMap((z) => [-3.55, 0, z]),
        colour: "#bfe0ff",
        colourB: accent,
        size: 0.14,
        minPx: 4,
        maxPx: 26,
        gain: 2.2,
        twinkle: 0.4,
      });
      hab.add(flames.points);
      const parts = [hub, ...tanks, ...radiators, ...arrays, ...engines];
      return {
        shots: [
          { at: 0, d: 2.6, az: 0.55, el: 0.3, target: [1.36, 0, -0.35] },
          { at: 0.4, d: 4.8, az: 0.75, el: 0.34, target: [0.9, 0, -0.2] },
          { at: 1, d: 7.8, az: 0.95, el: 0.38, target: [0, 0, 0] },
        ],
        spinner,
        shells: [shell],
        step(built, p, time, px) {
          shell.uniforms.uBuilt.value = built;
          spokes.forEach((x, i) => {
            x.visible = built > i / 4;
          });
          parts.forEach((x, i) => {
            x.visible = i === 0 || p > 0.08 + (i / parts.length) * 0.4;
          });
          flames.built.value = ramp(p, 0.5, 0.6);
          flames.update(time, px);
        },
        dispose() {
          shell.dispose();
          flames.dispose();
        },
      };
    },

    dome() {
      // A dome on the Moon: a slice of the surface below, the dome and what it holds above.
      const ground = makeWorld(ctx, { map: "moon.jpg", radius: 60, sun: sunFar, gain: 0.62 });
      ground.mesh.position.y = -60;
      ground.mesh.rotation.set(0.3, 0.8, 0);
      scene.add(ground.mesh);
      const hab = new T.Group();
      scene.add(hab);
      const R = 1.5;
      const floor = makeShell(ctx, new T.CircleGeometry(R * 0.98, 96).rotateX(-Math.PI / 2), 3, {
        size: R,
        scale: 14,
        sun: sunDir,
      });
      (floor.inner.material as THREE.ShaderMaterial).side = T.DoubleSide;
      floor.inner.position.y = 0.012;
      hab.add(floor.inner);
      // A berm of regolith banked round the foot of the dome.
      const bermGeo = bag.add(
        new T.LatheGeometry(
          [
            [R * 0.97, 0.16],
            [R * 1.02, 0.15],
            [R * 1.12, 0.09],
            [R * 1.25, 0.02],
            [R * 1.32, -0.02],
          ].map(([x, y]) => new T.Vector2(x, y)),
          120,
        ),
      );
      const regolith = bag.add(
        new T.MeshStandardMaterial({
          color: "#6f6a64",
          roughness: 1,
          metalness: 0,
          side: T.DoubleSide,
        }),
      );
      const berm = new T.Mesh(bermGeo, regolith);
      const reactor = mesh(s.cyl, m.hull, [0, 0.2, 0], [0.22, 0.4, 0.22]);
      const core = mesh(s.ball, m.accent, [0, 0.42, 0], [0.12, 0.12, 0.12]);
      hab.add(berm, reactor, core);
      // Houses and labs in rings round the reactor, lit inside.
      const HOUSES = 36;
      const houses = new T.InstancedMesh(s.box, m.hull, HOUSES);
      bag.add({ dispose: () => houses.dispose() });
      const mat4 = new T.Matrix4();
      const housePos: number[] = [];
      for (let i = 0; i < HOUSES; i++) {
        const ring = i < 14 ? 0.55 : 1.05;
        const a = (i / (i < 14 ? 14 : 22)) * Math.PI * 2 + r() * 0.1;
        const h = 0.06 + r() * 0.1;
        const pos = new T.Vector3(Math.cos(a) * ring, h / 2 + 0.012, Math.sin(a) * ring);
        mat4.compose(
          pos,
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -a),
          new T.Vector3(0.12, h, 0.08),
        );
        houses.setMatrixAt(i, mat4);
        housePos.push(pos.x * 1.02, h + 0.02, pos.z * 1.02);
      }
      hab.add(houses);
      const windows = makeDots(ctx, {
        positions: housePos,
        born: housePos.filter((_, i) => i % 3 === 0).map((_, i) => i / HOUSES),
        colour: "#ffd08a",
        colourB: "#fff3dc",
        size: 0.02,
        minPx: 2,
        maxPx: 8,
        gain: 2,
        twinkle: 0.3,
      });
      hab.add(windows.points);
      // The centrifuge, where people sleep at a fuller weight.
      const spinner = new T.Group();
      spinner.position.y = 0.72;
      hab.add(spinner);
      const ringGeo = bag.add(new T.TorusGeometry(0.75, 0.035, 12, 120).rotateX(Math.PI / 2));
      const ringMesh = new T.Mesh(ringGeo, m.hull);
      const pods = [0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return mesh(
          s.box,
          m.hull,
          [Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75],
          [0.16, 0.1, 0.12],
          [0, -a, 0],
        );
      });
      const hubPost = mesh(s.cyl, m.dark, [0, -0.15, 0], [0.04, 0.3, 0.04]);
      spinner.add(ringMesh, ...pods);
      hab.add(hubPost);
      // The glass.
      const glassGeo = bag.add(new T.SphereGeometry(R, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2));
      const glassU = {
        uCam: { value: new T.Vector3() },
        uSun: { value: sunDir },
        uCut: { value: cutWorld.clone() },
        uCutCos: { value: 2 },
        uBuilt: { value: 1 },
        uHeight: { value: R },
        cAccent: { value: new T.Color(accent) },
      };
      const glassMat = bag.add(
        new T.ShaderMaterial({
          vertexShader: GLASS_VERT,
          fragmentShader: GLASS_FRAG,
          uniforms: glassU,
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      const glass = new T.Mesh(glassGeo, glassMat);
      glass.renderOrder = 2;
      hab.add(glass);
      return {
        shots: [
          { at: 0, d: 2.6, az: 1.42, el: 0.32, target: [0, 0.35, 0] },
          { at: 0.45, d: 4, az: 1.3, el: 0.42, target: [0, 0.3, 0] },
          { at: 1, d: 6.2, az: 1.15, el: 0.36, target: [0, 0.5, 0] },
        ],
        spinner,
        shells: [floor],
        step(built, p, time, px) {
          houses.count = Math.max(2, Math.round(HOUSES * ramp(p, 0.05, 0.65)));
          windows.built.value = ramp(p, 0.35, 0.9);
          windows.update(time, px);
          ringMesh.visible = p > 0.3;
          for (const x of pods) x.visible = p > 0.35;
          glassU.uCutCos.value = floor.uniforms.uCutCos.value;
          camera.getWorldPosition(glassU.uCam.value);
          ground.update(time, camera);
          // Relief scaled to this large a world, so the craters near the dome read.
          ground.uniforms.uBump.value = 25;
          glassU.uBuilt.value = built;
        },
        dispose() {
          floor.dispose();
          windows.dispose();
          ground.dispose();
        },
      };
    },
  };

  const b = builds[type]();
  const pose = shotPath(T, b.shots);
  let angle = 0;
  let last = 0;
  const size = new T.Vector2();
  const cutCos = type === "sphere" ? 0.72 : type === "dome" ? 0.5 : 0.55;
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      camera.getWorldPosition(mirrorU.uCam.value);
      placeEarth();
      earth.update(time * 0.3, camera);
      // The hull goes up section by section; it turns only once it is whole.
      const built = mix(0.07, 1, ramp(p, 0, 0.5));
      const omega = spin * 0.45 * ramp(p, 0.45, 0.75);
      angle += omega * Math.max(0, time - last);
      last = time;
      b.spinner.rotation.y = angle;
      const open = ramp(p, 0.15, 0.42);
      const lights = ramp(p, 0.45, 0.9);
      const g = green * mix(0.03, 1, ramp(p, 0.25, 0.9));
      for (const sh of b.shells) {
        sh.uniforms.uTime.value = time;
        sh.uniforms.uGreen.value = g;
        sh.uniforms.uLights.value = lights;
        sh.uniforms.uCutCos.value = open > 0 ? mix(1, cutCos, open) : 2;
        sh.aim(cutWorld, camera);
      }
      b.step(built, p, time, pixelScale(ctx, size));
    },
    dispose() {
      sky.dispose();
      earth.dispose();
      b.dispose();
      bag.dispose();
    },
  };
};

export default habitat;
