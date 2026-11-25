/**
 * Mercury worked for the swarm. The story opens on the first site at the dawn line, the Sun low
 * and huge on the horizon: one pit glowing where sunlight melts the crust, a ring of mirrors round
 * it, oxygen rising, one mass driver throwing slugs into the sky. Then it pulls back as the work
 * spreads along the band of morning:
 *
 * - mined: the share of the crust worked: how many sites, how wide each pit and its mirror field;
 * - drivers: how many mass drivers, each a coil track flinging a stream of metal and glass off the
 *   planet and out, away from the Sun, toward the swarm's orbit.
 *
 * Units are Mercury's radius. The Sun sits at its true distance and size (it is kept inside the
 * camera's range but always looks as big as it would from Mercury: about three Suns from Earth).
 */

import type * as THREE from "three";
import { makeSun } from "../lib/bodies.ts";
import { rng } from "../lib/particles.ts";
import { Bag, materials, shapes } from "../lib/space/craft.ts";
import { makeDriver } from "../lib/space/driver.ts";
import {
  addSunlight,
  farAway,
  grow,
  ll,
  makeBackdrop,
  num,
  pixelScale,
  ramp,
  type Shot,
  share,
  shotPath,
  storyBeats,
} from "../lib/space/kit.ts";
import { makeDots, makeFlow } from "../lib/space/points.ts";
import { makeWorld, SITES } from "../lib/space/rock.ts";
import type { Kind } from "../types.ts";

/** Sites along the morning band, the first one closest to the dawn line. */
const PLACES: [number, number][] = [
  [72, 10],
  [66, -8],
  [70, 24],
  [60, 2],
  [64, -26],
  [56, 16],
  [68, 40],
  [52, -14],
  [58, -40],
  [46, 28],
  [48, 0],
  [62, 52],
  [40, -30],
  [44, 12],
  [54, -58],
  [36, 40],
];
const SUN_D = 23730;
const SUN_R = 285;

const mercury: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const mined = share(ctx, "mined", 0.2);
  const drivers = Math.round(num(ctx, "drivers", 3, 1, 12));
  const accent = ctx.colour;
  const bag = new Bag();

  const sunDir = new T.Vector3(1, 0.08, 0.15).normalize();
  const sunPos = sunDir.clone().multiplyScalar(SUN_D);
  const sky = makeBackdrop(ctx);
  const sun = makeSun(ctx, SUN_R);
  scene.add(sun.group);
  const placeSun = farAway(ctx, sun.group, sunDir, SUN_D);
  addSunlight(ctx, sunDir, 4.5, 0.06);
  const world = makeWorld(ctx, {
    map: "mercury.jpg",
    radius: 1,
    sun: sunPos,
    gain: 1.05,
    hot: "#ff7a24",
  });
  scene.add(world.mesh);

  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  m.setHeat(0.6);
  const r = rng(97);
  const frameAt = (lon: number, lat: number) => {
    const n = ll(T, lon, lat);
    const e = new T.Vector3(0, 1, 0).cross(n).normalize();
    return { n, e, north: n.clone().cross(e) };
  };

  // --- Sites: pits, and the mirror fields that melt them ----------------------------------------
  const nSites = Math.min(SITES, PLACES.length);
  const siteDir = PLACES.map(([lon, lat]) => ll(T, lon, lat));
  const maxR = 0.02 + 0.1 * mined;
  const mirrorPos: number[] = [];
  const mirrorBorn: number[] = [];
  PLACES.forEach(([lon, lat], i) => {
    const f = frameAt(lon, lat);
    const n = Math.round(160 * ctx.detail) + 20;
    for (let j = 0; j < n; j++) {
      const a = r() * Math.PI * 2;
      const d = maxR * (1.05 + r() * 0.9);
      const p = f.n
        .clone()
        .addScaledVector(f.e, Math.cos(a) * d)
        .addScaledVector(f.north, Math.sin(a) * d)
        .normalize()
        .multiplyScalar(1.002);
      mirrorPos.push(p.x, p.y, p.z);
      mirrorBorn.push(Math.min(0.99, i / nSites + r() * 0.04));
    }
  });
  const mirrors = makeDots(ctx, {
    positions: mirrorPos,
    born: mirrorBorn,
    colour: "#fff3d6",
    colourB: "#ffd27a",
    size: 0.004,
    minPx: 1.2,
    maxPx: 4,
    gain: 2.2,
    twinkle: 0.7,
  });
  scene.add(mirrors.points);
  // Oxygen rising from the first pit.
  const oxygen = makeFlow(ctx, {
    count: 260,
    colour: "#bfe9ff",
    colourB: "#ffffff",
    size: 0.006,
    minPx: 1.2,
    maxPx: 4,
    rate: 0.06,
    width: 0.04,
    fan: 1,
    seed: 101,
    gain: 0.9,
  });
  const s0 = siteDir[0] as THREE.Vector3;
  oxygen.from.copy(s0).multiplyScalar(1.003);
  oxygen.to.copy(s0).multiplyScalar(1.22);
  scene.add(oxygen.points);

  // --- Mass drivers: a coil track at a site, flinging a stream away from the Sun ----------------
  const DRIVERS = 12;
  const rigs = PLACES.slice(0, DRIVERS).map(([lon, lat], i) => {
    const f = frameAt(lon, lat);
    const start = f.n
      .clone()
      .addScaledVector(f.north, maxR * 1.6 + 0.02)
      .addScaledVector(f.e, 0.08)
      .normalize();
    // Launch westward, toward the night: the streams leave over the planet's dark side.
    const a = start.clone().multiplyScalar(1.003);
    const b = start.clone().addScaledVector(f.e, -0.22).normalize().multiplyScalar(1.006);
    const dir = b.clone().sub(a).normalize();
    const up = b.clone().normalize();
    const rig = makeDriver(ctx, s, m, bag, {
      a,
      b,
      to: b.clone().addScaledVector(dir, 4.5).addScaledVector(up, 2).addScaledVector(sunDir, -2.5),
      bend: up.clone().multiplyScalar(0.6).addScaledVector(dir, 0.4),
      coils: 30,
      coilSize: 0.005,
      slug: 0.0035,
      width: 0.35,
      cadence: 0.6,
      colour: i % 2 ? "#ffd08a" : "#ffe2a8",
      accent,
      seed: 110 + i * 3,
      count: 700,
    });
    scene.add(rig.group);
    return rig;
  });

  // --- Camera: at the dawn line facing the Sun, then out to the whole planet --------------------
  const P0 = (siteDir[0] as THREE.Vector3).clone();
  const n0 = P0.clone().normalize();
  const tSun = sunDir.clone().addScaledVector(n0, -sunDir.dot(n0)).normalize();
  const side = n0.clone().cross(tSun).normalize();
  const azel = (v: THREE.Vector3): [number, number] => {
    const u = v.clone().normalize();
    return [Math.atan2(u.z, u.x), Math.asin(u.y)];
  };
  const [az0, el0] = azel(
    tSun.clone().multiplyScalar(-0.85).addScaledVector(n0, 0.42).addScaledVector(side, 0.25),
  );
  const [az1, el1] = azel(n0.clone().addScaledVector(tSun, -0.7).addScaledVector(side, 0.3));
  const [az2, el2] = azel(
    n0.clone().multiplyScalar(0.8).addScaledVector(sunDir, -0.55).addScaledVector(side, 0.35),
  );
  const [az3, el3] = azel(
    n0.clone().multiplyScalar(0.8).addScaledVector(sunDir, 0.05).addScaledVector(side, 0.6),
  );
  const shots: Shot[] = [
    { at: 0, d: 0.16, az: az0, el: el0, target: [P0.x, P0.y, P0.z] },
    { at: 0.3, d: 1.1, az: az1, el: el1, target: [P0.x * 0.8, P0.y * 0.8, P0.z * 0.8] },
    { at: 0.65, d: 3.6, az: az2, el: el2, target: [0, 0, 0] },
    { at: 1, d: 6, az: az3, el: el3, target: [0, 0, 0] },
  ];
  for (const k of shots) {
    while (k.az - az0 > Math.PI) k.az -= Math.PI * 2;
    while (az0 - k.az > Math.PI) k.az += Math.PI * 2;
  }
  const pose = shotPath(T, shots);

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      placeSun();
      sun.update(time, camera);
      world.update(time, camera);
      world.uniforms.uBump.value = 1 - ramp(camera.position.length(), 1.4, 2.8);
      const px = pixelScale(ctx, size);
      // Sites open one by one along the band, each pit widening as it is worked.
      const want = Math.max(1, Math.round(nSites * Math.min(1, mined * 2.5)));
      const open = Math.max(1, Math.round(want * grow(p, 1 / want)));
      siteDir.forEach((d, i) => {
        const on = i < open ? 1 : 0;
        const age = ramp(p, (i / want) * 0.7 - 0.05, (i / want) * 0.7 + 0.35);
        world.site(i, d, on * maxR * (0.35 + 0.65 * age), on * (0.6 + 0.4 * age));
      });
      mirrors.built.value = open / nSites;
      mirrors.update(time, px);
      oxygen.on.value = 1 - 0.5 * ramp(p, 0.4, 1);
      oxygen.update(time, px);
      // Drivers come into service one at a time, the first from the start.
      const nd = Math.max(1, Math.round(drivers * grow(p, 1 / drivers)));
      rigs.forEach((rig, i) => {
        rig.group.visible = i < nd;
        rig.laid(i < nd ? 1 : 0);
        rig.firing(i < nd ? 1 : 0);
        rig.update(time, px);
      });
    },
    dispose() {
      sky.dispose();
      sun.dispose();
      world.dispose();
      mirrors.dispose();
      oxygen.dispose();
      for (const rig of rigs) rig.dispose();
      bag.dispose();
    },
  };
};

export default mercury;
