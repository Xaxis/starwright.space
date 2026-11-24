/**
 * The whole climb in one shot, in powers of ten. The story starts close over today's Earth at
 * night, covers the deserts in panels and wires the continents together, fills Earth's orbits
 * with industry, sends the Moon's mass up a driver, then pulls back past the Moon to the inner
 * solar system, where Mercury is mined into a swarm of collectors that closes around the Sun.
 *
 * Distances are in Earth radii and true to scale: the Moon at 60, the Sun 109 across at 23,481.
 * Progress runs 0 to 1 across the ladder's rungs, one rung per beat, evenly spaced.
 */
import { makeEarth, makeRock, makeSky, makeSun } from "../lib/bodies.ts";
import { makeOrbiters, makeRing, makeStream } from "../lib/particles.ts";
import type { Beat, Kind, View } from "../types.ts";

export interface LadderData {
  beats: Beat[];
  /** The swarm's radius around the Sun, AU. */
  swarmAu: number;
}

const AU = 23481;
const SUN_R = 109.2;
const MOON_D = 60.3;
const MOON_R = 0.273;

/** 0 before a, 1 after b, smooth between. */
const ramp = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ladder: Kind = (ctx) => {
  const T = ctx.three;
  const data = (ctx.data ?? { beats: [], swarmAu: 0.6 }) as LadderData;
  const { scene, camera, renderer } = ctx;
  const n = Math.max(2, data.beats.length);
  /** Progress of beat i. */
  const at = (i: number) => i / (n - 1);

  // The Sun sits at -AU on x, so Earth's day side faces -x; Earth is the origin, for precision
  // where the camera is close.
  const sunPos = new T.Vector3(-AU, 0, 0);
  const sky = makeSky(ctx, 4e6);
  scene.add(sky.mesh);
  const sun = makeSun(ctx, SUN_R);
  sun.group.position.copy(sunPos);
  scene.add(sun.group);
  const earth = makeEarth(ctx, { sun: sunPos });
  scene.add(earth.group);

  // The world grid: lines between the sunny deserts and the cities, pulsing with power.
  const hubs: [number, number][] = [
    [8, 23], // Sahara
    [46, 23], // Arabia
    [130, -25], // Australia
    [-70, -23], // Atacama
    [-112, 34], // US southwest
    [100, 41], // Gobi
    [2, 48], // Europe
    [77, 28], // India
    [116, 39], // China
    [-74, 40], // US east
    [139, 35], // Japan
    [-46, -23], // Brazil
    [28, -26], // southern Africa
    [37, 55], // Russia
  ];
  const links: [number, number][] = [
    [0, 6],
    [0, 1],
    [1, 7],
    [7, 8],
    [5, 8],
    [8, 10],
    [2, 9],
    [4, 9],
    [3, 11],
    [0, 12],
    [6, 13],
    [5, 13],
    [2, 10],
    [9, 11],
    [12, 1],
  ];
  const ll = (lon: number, lat: number, r: number) => {
    const a = (lon * Math.PI) / 180;
    const b = (lat * Math.PI) / 180;
    return new T.Vector3(Math.cos(b) * Math.cos(a) * r, Math.sin(b) * r, -Math.cos(b) * Math.sin(a) * r);
  };
  const gridPos: number[] = [];
  const gridAlong: number[] = [];
  for (const [a, b] of links) {
    const [la, pa] = hubs[a] as [number, number];
    const [lb, pb] = hubs[b] as [number, number];
    const A = ll(la, pa, 1);
    const B = ll(lb, pb, 1);
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      for (const s of [i / steps, (i + 1) / steps]) {
        const p = new T.Vector3().copy(A).lerp(B, s).normalize();
        p.multiplyScalar(1.004 + 0.06 * Math.sin(Math.PI * s) * A.distanceTo(B));
        gridPos.push(p.x, p.y, p.z);
        gridAlong.push(s);
      }
    }
  }
  const gridGeo = new T.BufferGeometry();
  gridGeo.setAttribute("position", new T.Float32BufferAttribute(gridPos, 3));
  gridGeo.setAttribute("aAlong", new T.Float32BufferAttribute(gridAlong, 1));
  const gridU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const gridMat = new T.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aAlong;
      varying float vAlong;
      void main() {
        vAlong = aAlong;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      uniform float uOn;
      varying float vAlong;
      void main() {
        float pulse = pow(max(0.5 + 0.5 * sin((vAlong * 6.0 - uTime * 0.8) * 6.2832), 0.0), 8.0);
        vec3 c = vec3(1.0, 0.72, 0.32) * (0.35 + 1.6 * pulse);
        gl_FragColor = vec4(c * uOn, uOn);
        #include <logdepthbuf_fragment>
      }`,
    uniforms: gridU,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const grid = new T.LineSegments(gridGeo, gridMat);
  // The grid turns with the globe: put it inside the same tilt and spin.
  const tilt = new T.Group();
  tilt.rotation.z = (23.44 * Math.PI) / 180;
  const spin = new T.Group();
  tilt.add(spin);
  spin.add(grid);
  earth.group.add(tilt);

  // Earth's orbital industry: a low shell of stations, a ring at geostationary height, and
  // radiators glowing as they shed the heat of computers and factories.
  const low = makeOrbiters(ctx, {
    count: 9000,
    rMin: 1.06,
    rMax: 1.35,
    tilt: 1.2,
    colour: "#cfe3ff",
    size: 0.006,
    speed: 0.5,
    ref: 1.1,
    seed: 3,
    bias: 1.5,
  });
  const geo = makeOrbiters(ctx, {
    count: 7000,
    rMin: 6.4,
    rMax: 6.9,
    tilt: 0.02,
    colour: "#ffe2a8",
    size: 0.03,
    speed: 0.08,
    ref: 6.6,
    seed: 5,
    gain: 1.4,
  });
  const radiators = makeOrbiters(ctx, {
    count: 2500,
    rMin: 2,
    rMax: 9,
    tilt: 0.25,
    colour: "#ff6a3d",
    size: 0.05,
    speed: 0.05,
    ref: 6.6,
    seed: 7,
  });
  const industry = new T.Group();
  industry.rotation.z = (23.44 * Math.PI) / 180;
  industry.add(low.points, geo.points, radiators.points);
  scene.add(industry);

  // The Moon, and the mass driver throwing its regolith up to the factories at L5.
  const moonGroup = new T.Group();
  const moon = makeRock(ctx, "moon.jpg", MOON_R, sunPos);
  moon.mesh.position.set(MOON_D, 0, 0);
  moonGroup.add(moon.mesh);
  moonGroup.rotation.y = 2.1;
  scene.add(moonGroup);
  const driver = makeStream(ctx, {
    count: 2500,
    colour: "#d8d4ff",
    size: 0.15,
    rate: 0.05,
    width: 1.2,
    seed: 11,
  });
  scene.add(driver.points);
  const l5 = makeOrbiters(ctx, {
    count: 2500,
    rMin: 0.2,
    rMax: 5,
    tilt: Math.PI / 2,
    colour: "#ffd9a0",
    size: 0.2,
    speed: 0.3,
    ref: 1,
    seed: 13,
    bias: 2,
  });
  scene.add(l5.points);

  // The inner solar system: orbits, Mercury mined into collectors, the swarm.
  const orbits = new T.Group();
  orbits.position.copy(sunPos);
  const rings = [0.387, 0.723, 1, 1.524].map((a) => makeRing(ctx, a * AU, "#8fa3c8", 0.25));
  for (const r of rings) orbits.add(r.line);
  scene.add(orbits);
  const mercuryGroup = new T.Group();
  mercuryGroup.position.copy(sunPos);
  const mercury = makeRock(ctx, "mercury.jpg", 0.383 * 30, sunPos);
  mercury.mesh.position.set(0.387 * AU, 0, 0);
  mercuryGroup.add(mercury.mesh);
  mercuryGroup.rotation.y = 0.9;
  scene.add(mercuryGroup);
  const mine = makeStream(ctx, {
    count: 4000,
    colour: "#ffcf8a",
    size: 40,
    rate: 0.03,
    width: 2600,
    seed: 17,
  });
  scene.add(mine.points);
  const swarmR = data.swarmAu * AU;
  const swarm = makeOrbiters(ctx, {
    count: 90000,
    rMin: swarmR * 0.82,
    rMax: swarmR * 1.18,
    tilt: Math.PI / 2,
    colour: "#ffe7b0",
    size: 55,
    speed: 0.02,
    ref: swarmR,
    seed: 19,
    gain: 0.9,
  });
  swarm.points.position.copy(sunPos);
  scene.add(swarm.points);
  // When the swarm is nearly closed, its back faces glow with the heat they shed: false colour.
  const shellGeo = new T.SphereGeometry(swarmR, 96, 48);
  const shellU = { uOn: { value: 0 }, uCam: { value: new T.Vector3() } };
  const shellMat = new T.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uOn;
      uniform vec3 uCam;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        float mu = abs(dot(normalize(vN), normalize(uCam - vW)));
        float limb = pow(clamp(1.0 - mu, 0.0, 1.0), 2.0);
        vec3 c = vec3(1.0, 0.36, 0.12) * (0.08 + 0.9 * limb);
        gl_FragColor = vec4(c * uOn, uOn * (0.1 + 0.6 * limb));
        #include <logdepthbuf_fragment>
      }`,
    uniforms: shellU,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
  const shell = new T.Mesh(shellGeo, shellMat);
  shell.position.copy(sunPos);
  scene.add(shell);

  // --- The camera's path: one shot per beat ------------------------------------------------------
  const dir = (az: number, el: number) =>
    new T.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  // [distance, target (0 Earth, 1 the Sun), azimuth, elevation]
  const shots: [number, number, number, number][] = [
    [3.1, 0, 2.6, 0.3], // today: Earth at night, the terminator in view
    [2.7, 0, 3.0, 0.38], // abundance: over the deserts at dusk
    [16, 0, 2.3, 0.5], // the heat ceiling: Earth's orbits fill
    [230, 0, 2.0, 0.6], // Type I: the Earth and Moon system
    [0.9 * AU, 0.35, 1.2, 0.9], // a planet's sunlight: pull back toward the Sun
    [1.9 * AU, 1, 0.6, 0.7], // the inner system at work
    [2.2 * AU, 1, 0.2, 0.45], // Type II
    [2.6 * AU, 1, -0.2, 0.3], // the whole Sun
  ];
  const shot = (i: number) => shots[Math.min(shots.length - 1, Math.max(0, i))] as [number, number, number, number];
  const target = new T.Vector3();
  const pos = new T.Vector3();
  const pose = (p: number): View => {
    const f = p * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const k = ramp(f - i, 0, 1);
    const a = shot(Math.round((i / (n - 1)) * (shots.length - 1)));
    const b = shot(Math.round(((i + 1) / (n - 1)) * (shots.length - 1)));
    const d = Math.exp(Math.log(a[0]) + (Math.log(b[0]) - Math.log(a[0])) * k);
    const tw = a[1] + (b[1] - a[1]) * k;
    const az = a[2] + (b[2] - a[2]) * k;
    const el = a[3] + (b[3] - a[3]) * k;
    target.set(0, 0, 0).lerp(sunPos, tw);
    pos.copy(target).addScaledVector(dir(az, el), d);
    return {
      position: [pos.x, pos.y, pos.z],
      target: [target.x, target.y, target.z],
      near: Math.max(1.4, d * 0.2),
      far: Math.max(6, d * 6),
    };
  };

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: data.beats.map((b, i) => ({ ...b, at: at(i) })),
    pose,
    update(time, _dt, p) {
      renderer.getSize(size);
      const pr = renderer.getPixelRatio();
      sky.mesh.position.copy(camera.position);
      earth.update(time, camera);
      spin.rotation.y = time * 0.05;
      sun.update(time, camera);
      moon.update(camera);
      mercury.update(camera);
      // Abundance: panels spread over the deserts and the grid lights up.
      earth.uniforms.uSolar.value = ramp(p, at(0) + 0.02, at(1));
      gridU.uOn.value = ramp(p, at(0) + 0.05, at(1)) * (1 - ramp(p, at(4), at(5)) * 0.5);
      gridU.uTime.value = time;
      // The heat ceiling and Type I: orbits fill, the Moon's driver runs.
      low.built.value = ramp(p, at(1) + 0.02, at(3));
      geo.built.value = ramp(p, at(1) + 0.06, at(3) + 0.05);
      radiators.built.value = ramp(p, at(2), at(3) + 0.1);
      for (const o of [low, geo, radiators, l5]) o.update(time, pr, size.y);
      moonGroup.rotation.y = 2.1 + time * 0.01;
      moon.mesh.getWorldPosition(driver.uniforms.uFrom.value);
      // L5 trails the Moon by 60 degrees on its orbit.
      const l5a = moonGroup.rotation.y - Math.PI / 3;
      l5.points.position.set(Math.cos(l5a) * MOON_D, 0, -Math.sin(l5a) * MOON_D);
      driver.uniforms.uTo.value.copy(l5.points.position);
      driver.uniforms.uBend.value.set(0, 6, 0);
      driver.uniforms.uOn.value = ramp(p, at(2) + 0.03, at(3));
      l5.built.value = ramp(p, at(2) + 0.05, at(3) + 0.1);
      driver.update(time, pr, size.y);
      // The inner system: Mercury mined, the swarm built, the Sun's light caught.
      const far = ramp(p, at(3) + 0.05, at(4));
      for (const r of rings) r.material.uniforms.uOpacity.value = 0.22 * far;
      mercuryGroup.rotation.y = 0.9 + time * 0.004;
      mercury.mesh.getWorldPosition(mine.uniforms.uFrom.value);
      mine.uniforms.uTo.value.copy(sunPos).add(new T.Vector3(swarmR * 0.3, swarmR * 0.6, swarmR * 0.7));
      mine.uniforms.uBend.value.set(0, swarmR * 0.4, 0);
      mine.uniforms.uOn.value = ramp(p, at(4), at(5)) * (1 - ramp(p, at(6), at(7)) * 0.7);
      mine.update(time, pr, size.y);
      // The swarm grows across the last rungs, a power of ten at a time.
      swarm.built.value = ramp(p, at(4) - 0.02, at(7));
      swarm.update(time, pr, size.y);
      const closing = ramp(p, at(5), at(7));
      sun.dim.value = 0.92 * closing ** 1.5;
      shellU.uOn.value = closing ** 2;
      camera.getWorldPosition(shellU.uCam.value);
      earth.uniforms.uLights.value = 1;
    },
    dispose() {
      sky.dispose();
      sun.dispose();
      earth.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      for (const o of [low, geo, radiators, l5, swarm]) o.dispose();
      moon.dispose();
      mercury.dispose();
      driver.dispose();
      mine.dispose();
      for (const r of rings) r.dispose();
      shellGeo.dispose();
      shellMat.dispose();
    },
  };
};

export default ladder;
