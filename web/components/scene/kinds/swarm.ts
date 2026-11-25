/**
 * A swarm of collectors around the Sun. The story opens on the first collector, a sheet of film
 * catching sunlight with the Sun beyond it, then pulls back as its copies form a ring on the
 * Sun's equator, widen into a band and close into a shell:
 *
 * - built: the share of the Sun's light the swarm catches at the end; as it closes the Sun dims
 *   and the shell glows in the infrared with the heat it sheds;
 * - radiusAu: the swarm's radius; inside Earth's orbit it leaves a lane of sunlight open to Earth;
 * - mercury: Mercury mined to feed it, streams of new collectors spiralling out to the shell.
 *
 * Units are hundredths of an AU. Orbits are true to scale; the Sun is drawn three times its size,
 * the planets and collectors far larger, so they read.
 */

import type * as THREE from "three";
import { glowTexture, makeRock, makeSun } from "../lib/bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import { makeRing, rng } from "../lib/particles.ts";
import { Bag, materials, shapes } from "../lib/space/craft.ts";
import {
  flag,
  grow,
  makeBackdrop,
  num,
  pixelScale,
  ramp,
  type Shot,
  share,
  shotPath,
  storyBeats,
} from "../lib/space/kit.ts";
import { makeDots, makeFlow, makeOrbiting } from "../lib/space/points.ts";
import type { Kind } from "../types.ts";

const AU = 100;
const SPEED = 0.006;

const SHELL_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uOn;
uniform vec3 uCam;
varying vec3 vN;
varying vec3 vW;
void main() {
  float mu = abs(dot(normalize(vN), normalize(uCam - vW)));
  float limb = pow(clamp(1.0 - mu, 0.0, 1.0), 2.0);
  vec3 c = vec3(1.0, 0.3, 0.1) * (0.07 + 0.9 * limb);
  gl_FragColor = vec4(c * uOn, uOn * (0.1 + 0.6 * limb));
  ${FRAG_TAIL}
}`;
const SHELL_VERT = /* glsl */ `
${VERT_HEAD}
varying vec3 vN;
varying vec3 vW;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

/** A collector: gold film catching the Sun on its face, a lattice of cells, heat glowing behind. */
const FILM_VERT = /* glsl */ `
${VERT_HEAD}
varying vec3 vN;
varying vec3 vW;
varying vec3 vLocal;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
  #endif
  vLocal = position;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;
const FILM_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform vec3 uCam;
uniform float uHeat;
varying vec3 vN;
varying vec3 vW;
varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  vec3 L = normalize(-vW);
  vec3 V = normalize(uCam - vW);
  float facing = dot(N, L);
  vec2 q = vLocal.xz * 16.0;
  vec2 g = abs(fract(q + vec2(0.5 * floor(q.y), 0.0)) - 0.5);
  float line = smoothstep(0.44, 0.5, max(g.x, g.y));
  float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 3.0);
  vec3 film = mix(vec3(0.9, 0.58, 0.22), vec3(0.55, 0.45, 0.9), fres * 0.6) * (0.08 + 0.5 * max(facing, 0.0));
  film += vec3(1.0, 0.92, 0.8) * pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * 1.2;
  film *= 1.0 - line * 0.55;
  vec3 back = vec3(0.03, 0.028, 0.026) + vec3(1.0, 0.22, 0.05) * uHeat * (0.5 + 0.5 * (1.0 - line));
  gl_FragColor = vec4(facing > 0.0 ? film : back, 1.0);
  ${FRAG_TAIL}
}`;

const swarm: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const built = share(ctx, "built", 0.5);
  const R = num(ctx, "radiusAu", 0.6, 0.1, 2) * AU;
  const feed = flag(ctx, "mercury", false);
  const accent = ctx.colour;
  const bag = new Bag();
  const origin = new T.Vector3();

  const sky = makeBackdrop(ctx);
  const sun = makeSun(ctx, 1.4);
  scene.add(sun.group);
  // Light for the modelled collectors comes from the Sun at the centre.
  const lamp = new T.PointLight("#fff1dc", 9, 0, 0);
  const fill = new T.HemisphereLight("#9fb6ff", "#20140c", 0.12);
  scene.add(lamp, fill);

  // Orbits of the inner planets, and the planets as points.
  const rings = [0.387, 0.723, 1, 1.524].map((a) => makeRing(ctx, a * AU, "#8fa3c8", 0.18));
  for (const r of rings) scene.add(r.line);
  const planets = makeDots(ctx, {
    positions: new Float32Array(9),
    colour: "#9fc6ff",
    colourB: "#ffd9a8",
    size: 0.9,
    minPx: 3,
    maxPx: 9,
    gain: 1.6,
    twinkle: 0,
  });
  scene.add(planets.points);
  // Mercury, Venus and Earth, held still: the swarm turns, they barely move in a story's time.
  const planetAt = [0.387, 0.723, 1].map((a, i) => {
    const th = [1.25, 3.9, 2.1][i] as number;
    return new T.Vector3(Math.cos(th) * a * AU, 0, -Math.sin(th) * a * AU);
  });
  const planetAttr = planets.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  planetAt.forEach((v, i) => {
    planetAttr.setXYZ(i, v.x, v.y, v.z);
  });

  // --- The swarm --------------------------------------------------------------------------------
  const shell = makeOrbiting(ctx, {
    count: 90000,
    rMin: R * 0.95,
    rMax: R * 1.05,
    tilt: Math.PI / 2,
    colour: "#ffe2a0",
    colourB: "#fff7e0",
    size: 0.22,
    minPx: 1.2,
    maxPx: 5,
    speed: SPEED,
    ref: R,
    seed: 19,
    gain: 0.95,
    glint: 2,
    // A ring on the Sun's equator first, widening into a band, then the shell.
    born: ({ inc, u }) => (Math.abs(inc) / (Math.PI / 2)) ** 0.7 * 0.75 + u * 0.25,
  });
  scene.add(shell.points);
  const gold = new T.Color("#ffe2a0");
  const ember = new T.Color("#ff6a2a");
  const cA = shell.uniforms.cA as { value: THREE.Color };

  // The heat the closed shell sheds, seen as an infrared glow at its limb.
  const shellGeo = bag.add(new T.SphereGeometry(R * 1.04, 96, 48));
  const shellU = { uOn: { value: 0 }, uCam: { value: new T.Vector3() } };
  const shellMat = bag.add(
    new T.ShaderMaterial({
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      uniforms: shellU,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
  );
  scene.add(new T.Mesh(shellGeo, shellMat));

  // --- The first collectors, modelled ------------------------------------------------------------
  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  m.setHeat(0.5);
  const HERO = 40;
  const heroAngle = 0.35;
  const heroPos = new T.Vector3(Math.cos(heroAngle) * R, 0, -Math.sin(heroAngle) * R);
  const filmU = { uCam: { value: new T.Vector3() }, uHeat: { value: 0.8 } };
  const filmMat = bag.add(
    new T.ShaderMaterial({ vertexShader: FILM_VERT, fragmentShader: FILM_FRAG, uniforms: filmU }),
  );
  const films = new T.InstancedMesh(s.hex, filmMat, HERO);
  bag.add({ dispose: () => films.dispose() });
  const r = rng(23);
  const mat4 = new T.Matrix4();
  const q = new T.Quaternion();
  const heroSize = R * 0.012;
  for (let i = 0; i < HERO; i++) {
    const a = heroAngle + (i === 0 ? 0 : (r() - 0.5) * 0.12);
    const h = i === 0 ? 0 : (r() - 0.5) * R * 0.05;
    const rad = R * (i === 0 ? 1 : 0.97 + r() * 0.06);
    const p = new T.Vector3(Math.cos(a) * rad, h, -Math.sin(a) * rad);
    // Each faces the Sun, its film toward it, a little off so they catch the light differently.
    const toSun = p.clone().negate().normalize();
    toSun.x += (r() - 0.5) * 0.4;
    toSun.y += (r() - 0.5) * 0.4;
    q.setFromUnitVectors(new T.Vector3(0, 1, 0), toSun.normalize());
    const k = heroSize * (i === 0 ? 1 : 0.6 + r() * 0.5);
    films.setMatrixAt(i, mat4.compose(p, q, new T.Vector3(k, k * 0.004, k)));
  }
  scene.add(films);

  // --- Mercury, feeding the swarm ----------------------------------------------------------------
  const mercAngle = 1.25;
  const mercury = makeRock(ctx, "mercury.jpg", 0.55, origin);
  const mercPos = new T.Vector3(
    Math.cos(mercAngle) * 0.387 * AU,
    0,
    -Math.sin(mercAngle) * 0.387 * AU,
  );
  mercury.mesh.position.copy(mercPos);
  mercury.mesh.visible = feed;
  scene.add(mercury.mesh);
  const feeds = [0.55, 1.2, -0.6].map((da, i) => {
    const f = makeFlow(ctx, {
      count: 1400,
      colour: "#ffcf8a",
      colourB: accent,
      size: 0.25,
      minPx: 1.2,
      maxPx: 4,
      rate: 0.03 + i * 0.008,
      width: R * 0.03,
      fan: 0.6,
      seed: 31 + i,
      gain: 1.3,
    });
    const a = mercAngle + da;
    f.from.copy(mercPos);
    f.to.set(Math.cos(a) * R, (i - 1) * R * 0.12, -Math.sin(a) * R);
    f.bend.copy(
      f.to
        .clone()
        .sub(mercPos)
        .cross(new T.Vector3(0, 1, 0))
        .setLength(R * 0.25),
    );
    f.points.visible = feed;
    scene.add(f.points);
    return f;
  });
  // The forges round Mercury, glowing.
  const forge = new T.Sprite(
    bag.add(
      new T.SpriteMaterial({
        map: glowTexture(ctx),
        color: new T.Color(accent).multiplyScalar(1.6),
        blending: T.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    ),
  );
  forge.position.copy(mercPos);
  forge.scale.setScalar(4);
  forge.visible = feed;
  scene.add(forge);

  // --- Camera ----------------------------------------------------------------------------------
  const heroOut = heroPos.clone().normalize();
  // On the sunward side, at a slant: the film's lit face, and the stars beyond it.
  const off = heroOut
    .clone()
    .multiplyScalar(-0.42)
    .add(new T.Vector3(0, 0.5, 0))
    .add(new T.Vector3(0, 1, 0).cross(heroOut).multiplyScalar(-0.75))
    .normalize();
  const az0 = Math.atan2(off.z, off.x);
  const el0 = Math.asin(off.y);
  const outAz = Math.atan2(heroOut.z, heroOut.x);
  const mid: [number, number, number] = [heroPos.x * 0.55, 0, heroPos.z * 0.55];
  const shots: Shot[] = [
    { at: 0, d: heroSize * 4.2, az: az0, el: el0, target: [heroPos.x, heroPos.y, heroPos.z] },
    { at: 0.3, d: R * 0.7, az: outAz - 0.5, el: 0.42, target: mid },
    { at: 0.65, d: R * 1.9, az: outAz - 0.2, el: 0.5, target: [0, 0, 0] },
    { at: 1, d: R * 2.7, az: outAz + 0.1, el: 0.38, target: [0, 0, 0] },
  ];
  for (const k of shots) {
    while (k.az - az0 > Math.PI) k.az -= Math.PI * 2;
    while (az0 - k.az > Math.PI) k.az += Math.PI * 2;
  }
  const pose = shotPath(T, shots);

  const size = new T.Vector2();
  const earthDir = new T.Vector3();
  const gap = shell.uniforms.uGap as { value: THREE.Vector3 };
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      const px = pixelScale(ctx, size);
      const share = built * grow(p, 0.0006);
      shell.built.value = share;
      cA.value.copy(gold).lerp(ember, ramp(share, 0.6, 1) * 0.75);
      shell.update(time, px);
      films.count = 1 + Math.round((HERO - 1) * ramp(p, 0.02, 0.35));
      camera.getWorldPosition(filmU.uCam.value);
      const closing = ramp(share, 0.45, 1);
      sun.dim.value = 0.93 * closing ** 1.4;
      sun.update(time, camera);
      lamp.intensity = 9 * (1 - 0.6 * closing);
      shellU.uOn.value = closing ** 1.6;
      camera.getWorldPosition(shellU.uCam.value);
      // The planets, and a lane of sunlight kept open to Earth when the swarm is inside its orbit.
      planets.update(time, px);
      earthDir.copy(planetAt[2] as THREE.Vector3).normalize();
      if (R < AU * 0.95) gap.value.copy(earthDir).multiplyScalar(Math.cos(0.12));
      else gap.value.set(0, 0, 0);
      for (const ring of rings)
        (ring.material.uniforms.uOpacity as { value: number }).value = 0.18 * ramp(p, 0.15, 0.5);
      // Mercury's streams: on from the start when it feeds the swarm.
      mercury.update(camera);
      for (const f of feeds) {
        f.on.value = ramp(p, 0.05, 0.3) * (1 - 0.6 * ramp(share, 0.9, 1));
        f.update(time, px);
      }
    },
    dispose() {
      sky.dispose();
      sun.dispose();
      for (const ring of rings) ring.dispose();
      planets.dispose();
      shell.dispose();
      mercury.dispose();
      for (const f of feeds) f.dispose();
      bag.dispose();
    },
  };
};

export default swarm;
