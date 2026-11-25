/**
 * The Moon being settled. The story opens over the first outpost at the south pole, the Sun on the
 * horizon and the Earth hanging low beyond it, then pulls back as the Moon fills with work:
 *
 * - bases: outposts of modules, solar towers and landers, the pole first, then across the near
 *   side, their lights showing on the night side;
 * - mines: pits cut into the regolith, the shadowed polar craters first, each glowing where ore is
 *   cooked, rovers working round it;
 * - driver: a mass driver on Mare Tranquillitatis, slugs racing up its coils and streaming to space;
 * - domes: glass domes beside the bases, green and lit inside;
 * - telescopes: a radio dish in a far-side crater, quiet from Earth, linked home by relays over
 *   the poles.
 *
 * Units are lunar radii; the Earth sits at its true distance, 221 radii. The Moon is turned south
 * up, so the pole the story starts on is the top of the frame. Bases are drawn far larger than
 * life so they read up close.
 */

import type * as THREE from "three";
import { makeEarth } from "../lib/bodies.ts";
import { rng } from "../lib/particles.ts";
import { Bag, materials, shapes } from "../lib/space/craft.ts";
import { makeDriver } from "../lib/space/driver.ts";
import {
  addSunlight,
  farAway,
  flag,
  grow,
  ll,
  makeBackdrop,
  pixelScale,
  ramp,
  type Shot,
  share,
  shotPath,
  storyBeats,
} from "../lib/space/kit.ts";
import { makeDots } from "../lib/space/points.ts";
import { makeRibbons } from "../lib/space/ribbons.ts";
import { makeWorld } from "../lib/space/rock.ts";
import type { Kind } from "../types.ts";

/** Outposts (longitude, latitude), in the order they are built. */
const BASES: [number, number][] = [
  [-40, -88.8],
  [-30, -86],
  [40, -85],
  [120, -84.5],
  [-110, -85],
  [10, -81],
  [24, 10],
  [-26, 8],
  [-60, -10],
  [60, 15],
  [-5, -43],
  [0, 60],
  [-90, 30],
  [90, -30],
  [150, -40],
  [-150, 20],
  [40, -60],
  [-40, -65],
  [80, 50],
  [-120, -55],
];
/** Mines: shadowed polar craters for ice first, then regolith across the near side. */
const MINES: [number, number][] = [
  [60, -87.5],
  [-70, -84],
  [150, -86],
  [-10, -78],
  [33, 4],
  [10, 14],
  [-55, -15],
  [70, 20],
  [10, 40],
  [-100, -50],
  [120, 30],
  [-140, -10],
];
const DISH: [number, number] = [180, -6];

const moon: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const bases = share(ctx, "bases", 0.3);
  const mines = share(ctx, "mines", 0);
  const domes = share(ctx, "domes", 0);
  const driver = flag(ctx, "driver", false);
  const telescopes = flag(ctx, "telescopes", false);
  const accent = ctx.colour;
  const bag = new Bag();

  // South up: the group turns the Moon half over about x.
  const group = new T.Group();
  group.rotation.x = Math.PI;
  scene.add(group);
  const toWorld = (v: THREE.Vector3) => new T.Vector3(v.x, -v.y, -v.z);
  const sunLocal = new T.Vector3(-0.35, -0.12, -0.93).normalize();
  const sunWorld = toWorld(sunLocal);
  const sunPos = sunWorld.clone().multiplyScalar(1e5);
  const sky = makeBackdrop(ctx);
  addSunlight(ctx, sunWorld, 3.4, 0.08);
  const world = makeWorld(ctx, {
    map: "moon.jpg",
    radius: 1,
    sun: sunPos,
    gain: 0.95,
    hot: "#ff8a3a",
  });
  group.add(world.mesh);
  const earth = makeEarth(ctx, { sun: sunPos });
  scene.add(earth.group);
  const placeEarth = farAway(ctx, earth.group, new T.Vector3(1, 0, 0), 221, 3.67);

  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  m.setHeat(0.4);
  const r = rng(71);
  /** A frame on the surface at (lon, lat): normal, east, north. */
  const frameAt = (lon: number, lat: number) => {
    const n = ll(T, lon, lat);
    const e = new T.Vector3(0, 1, 0).cross(n);
    if (e.lengthSq() < 1e-6) e.set(1, 0, 0);
    e.normalize();
    return { n, e, north: n.clone().cross(e) };
  };
  const mat4 = new T.Matrix4();
  const q = new T.Quaternion();
  const qa = new T.Quaternion();
  const place = (
    lon: number,
    lat: number,
    dx: number,
    dy: number,
    lift: number,
    heading: number,
    scale: [number, number, number],
    lie = false,
  ) => {
    const f = frameAt(lon, lat);
    const p = f.n.clone().addScaledVector(f.e, dx).addScaledVector(f.north, dy).normalize();
    q.setFromUnitVectors(new T.Vector3(0, 1, 0), p);
    q.multiply(qa.setFromAxisAngle(new T.Vector3(0, 1, 0), heading));
    if (lie) q.multiply(qa.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
    return mat4.compose(p.multiplyScalar(1 + lift), q, new T.Vector3(...scale)).clone();
  };

  // --- Bases: modules, solar towers, a lander and lights at each site ---------------------------
  const nBases = BASES.length;
  const modules = new T.InstancedMesh(s.cyl, m.hull, nBases * 4);
  const towers = new T.InstancedMesh(s.box, m.panel, nBases * 3);
  const landers = new T.InstancedMesh(s.cone, m.hull, nBases);
  const pads = new T.InstancedMesh(s.cyl, m.accent, nBases);
  bag.add({
    dispose: () => {
      for (const x of [modules, towers, landers, pads]) x.dispose();
    },
  });
  const lightPos: number[] = [];
  const lightBorn: number[] = [];
  BASES.forEach(([lon, lat], i) => {
    const k = 0.0045;
    for (let j = 0; j < 4; j++) {
      const a = j * 1.6 + r();
      modules.setMatrixAt(
        i * 4 + j,
        place(
          lon,
          lat,
          Math.cos(a) * k * 1.6,
          Math.sin(a) * k * 1.6,
          0.0012,
          a,
          [0.0028, 0.008, 0.0028],
          true,
        ),
      );
    }
    for (let j = 0; j < 3; j++) {
      const a = 2 + j * 2.1;
      towers.setMatrixAt(
        i * 3 + j,
        place(
          lon,
          lat,
          Math.cos(a) * k * 4,
          Math.sin(a) * k * 4,
          0.007,
          a,
          [0.0045, 0.014, 0.0005],
        ),
      );
    }
    landers.setMatrixAt(i, place(lon, lat, k * 3, -k * 2.5, 0.0025, 0, [0.0035, 0.005, 0.0035]));
    pads.setMatrixAt(i, place(lon, lat, k * 3, -k * 2.5, 0.0001, 0, [0.009, 0.0002, 0.009]));
    for (let j = 0; j < 40; j++) {
      const f = frameAt(lon, lat);
      const p = f.n
        .clone()
        .addScaledVector(f.e, (r() - 0.5) * 0.03)
        .addScaledVector(f.north, (r() - 0.5) * 0.03)
        .normalize()
        .multiplyScalar(1.002);
      lightPos.push(p.x, p.y, p.z);
      lightBorn.push(Math.min(0.99, i / nBases + r() * 0.02));
    }
  });
  group.add(modules, towers, landers, pads);
  const lights = makeDots(ctx, {
    positions: lightPos,
    born: lightBorn,
    colour: "#ffd08a",
    colourB: "#fff4dc",
    size: 0.0018,
    minPx: 1.2,
    maxPx: 5,
    gain: 1.8,
    twinkle: 0.3,
    night: sunWorld,
  });
  group.add(lights.points);

  // --- Mines and their rovers --------------------------------------------------------------------
  const roverPos: number[] = [];
  const roverBorn: number[] = [];
  MINES.forEach(([lon, lat], i) => {
    const f = frameAt(lon, lat);
    for (let j = 0; j < 30; j++) {
      const a = r() * Math.PI * 2;
      const d = 0.01 + r() * 0.03;
      const p = f.n
        .clone()
        .addScaledVector(f.e, Math.cos(a) * d)
        .addScaledVector(f.north, Math.sin(a) * d)
        .normalize()
        .multiplyScalar(1.002);
      roverPos.push(p.x, p.y, p.z);
      roverBorn.push(Math.min(0.99, i / MINES.length + r() * 0.03));
    }
  });
  // Each working mine's furnace, a glow that reads from orbit.
  const furnacePos = MINES.flatMap(([lon, lat]) => {
    const p = ll(T, lon, lat, 1.004);
    return [p.x, p.y, p.z];
  });
  const furnaces = makeDots(ctx, {
    positions: furnacePos,
    born: MINES.map((_, i) => (i + 0.5) / MINES.length),
    colour: "#ff9a4a",
    colourB: "#ffd08a",
    size: 0.012,
    minPx: 3,
    maxPx: 14,
    gain: 1.6,
    twinkle: 0.3,
  });
  group.add(furnaces.points);
  const rovers = makeDots(ctx, {
    positions: roverPos,
    born: roverBorn,
    colour: "#ffb070",
    colourB: accent,
    size: 0.0012,
    minPx: 1.2,
    maxPx: 4,
    gain: 1.5,
    twinkle: 0.6,
  });
  group.add(rovers.points);

  // --- Domes: glass over gardens ----------------------------------------------------------------
  const DOMES = 16;
  const domeGeo = bag.add(new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  const domeMat = bag.add(
    new T.MeshStandardMaterial({
      color: "#bfe4ff",
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity: 0.38,
      emissive: "#ffcf8a",
      emissiveIntensity: 0.9,
      depthWrite: false,
    }),
  );
  const garden = bag.add(
    new T.MeshBasicMaterial({ color: new T.Color("#3fa84a").multiplyScalar(1.6) }),
  );
  const domeMesh = new T.InstancedMesh(domeGeo, domeMat, DOMES);
  const gardenMesh = new T.InstancedMesh(s.cyl, garden, DOMES);
  bag.add({
    dispose: () => {
      for (const x of [domeMesh, gardenMesh]) x.dispose();
    },
  });
  for (let i = 0; i < DOMES; i++) {
    const [lon, lat] = BASES[i % nBases] as [number, number];
    const k = 0.0045;
    const a = 4.2 + Math.floor(i / nBases) * 1.4;
    const rad = 0.0055;
    domeMesh.setMatrixAt(
      i,
      place(lon, lat, Math.cos(a) * k * 3, Math.sin(a) * k * 3, 0, 0, [rad, rad * 0.8, rad]),
    );
    gardenMesh.setMatrixAt(
      i,
      place(lon, lat, Math.cos(a) * k * 3, Math.sin(a) * k * 3, 0.0003, 0, [
        rad * 1.8,
        0.0004,
        rad * 1.8,
      ]),
    );
  }
  group.add(domeMesh, gardenMesh);

  // --- The mass driver ---------------------------------------------------------------------------
  const dA = ll(T, 19, 7, 1.004);
  const dB = ll(T, 31, 7, 1.004);
  const dirOut = dB.clone().sub(dA).normalize();
  const upOut = dB.clone().normalize();
  const rig = makeDriver(ctx, s, m, bag, {
    a: dA,
    b: dB,
    to: dB.clone().addScaledVector(dirOut, 4.5).addScaledVector(upOut, 1.8),
    bend: upOut.clone().multiplyScalar(0.8),
    coils: 48,
    coilSize: 0.006,
    slug: 0.004,
    width: 0.25,
    cadence: 0.7,
    colour: "#fff0c8",
    accent,
    seed: 81,
    count: 1800,
  });
  rig.group.visible = driver;
  group.add(rig.group);

  // --- The far-side dish and the relays over the poles -------------------------------------------
  const teleGroup = new T.Group();
  teleGroup.visible = telescopes;
  group.add(teleGroup);
  const dishGeo = bag.add(
    new T.SphereGeometry(1, 32, 8, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22),
  );
  const dishMat = bag.add(
    new T.MeshStandardMaterial({
      color: "#d8dce4",
      metalness: 0.8,
      roughness: 0.25,
      wireframe: true,
    }),
  );
  const dish = new T.Mesh(dishGeo, dishMat);
  {
    const f = frameAt(...DISH);
    dish.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), f.n.clone().negate());
    dish.position.copy(f.n).multiplyScalar(1.0 + 0.06 * 0.95);
    dish.scale.setScalar(0.06);
  }
  const dishRing = new T.Mesh(s.ring, m.dark);
  dishRing.position.copy(ll(T, ...DISH, 1.002));
  dishRing.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), ll(T, ...DISH));
  dishRing.scale.setScalar(0.07);
  const smallDishes = new T.InstancedMesh(s.cone, m.hull, 6);
  bag.add({ dispose: () => smallDishes.dispose() });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    smallDishes.setMatrixAt(
      i,
      place(
        DISH[0],
        DISH[1],
        Math.cos(a) * 0.09,
        Math.sin(a) * 0.09,
        0.004,
        0,
        [0.008, 0.006, 0.008],
      ),
    );
  }
  teleGroup.add(dish, dishRing, smallDishes);
  const relayDots = makeDots(ctx, {
    positions: new Float32Array(6),
    colour: "#dff6ff",
    colourB: accent,
    size: 0.03,
    minPx: 3,
    maxPx: 8,
    gain: 1.8,
    twinkle: 0,
  });
  const relayLinks = makeRibbons(
    ctx,
    [0, 1, 2, 3].map((i) => ({ points: [new T.Vector3(), new T.Vector3()], born: i / 4 })),
    { colour: "#9fe8ff", pulse: accent, width: 1.1, pulses: 3, speed: 0.7, base: 0.6 },
  );
  teleGroup.add(relayDots.points, relayLinks.mesh);
  const relayAttr = relayDots.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const dishTop = ll(T, ...DISH, 1.01);
  const poleBase = ll(T, ...(BASES[0] as [number, number]), 1.01);
  const relay = [new T.Vector3(), new T.Vector3()];

  // --- Camera: over the first outpost, out to the whole Moon -------------------------------------
  const azel = (v: THREE.Vector3): [number, number] => {
    const u = v.clone().normalize();
    return [Math.atan2(u.z, u.x), Math.asin(u.y)];
  };
  const base0 = toWorld(ll(T, ...(BASES[0] as [number, number]), 1.0));
  const [az0, el0] = azel(new T.Vector3(-0.92, 0.26, 0.2));
  const [az1, el1] = azel(new T.Vector3(-0.85, 0.36, 0.3));
  const endDir = toWorld(ll(T, telescopes ? 150 : 38, -32));
  const [az3, el3] = azel(endDir);
  const midDir = toWorld(ll(T, telescopes ? 100 : 30, -50));
  const [az2, el2] = azel(midDir);
  const shots: Shot[] = [
    { at: 0, d: 0.09, az: az0, el: el0, target: [base0.x, base0.y, base0.z] },
    { at: 0.3, d: 0.75, az: az1, el: el1, target: [0, 0.88, 0] },
    { at: 0.65, d: 3.2, az: az2, el: el2, target: [0, 0.1, 0] },
    { at: 1, d: 4.3, az: az3, el: el3, target: [0, 0, 0] },
  ];
  for (const k of shots) {
    while (k.az - az0 > Math.PI) k.az -= Math.PI * 2;
    while (az0 - k.az > Math.PI) k.az += Math.PI * 2;
  }
  const pose = shotPath(T, shots);

  const size = new T.Vector2();
  const sites = MINES.map(([lon, lat]) => ll(T, lon, lat));
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      placeEarth();
      world.update(time, camera);
      earth.update(time * 0.3, camera);
      const px = pixelScale(ctx, size);
      const dist = camera.position.length();
      world.uniforms.uBump.value = 1 - ramp(dist, 1.3, 2.6);
      const g = (first: number) => grow(p, first);
      // Bases, the pole first.
      const nb = Math.max(1, Math.round(nBases * bases * g(1 / (nBases * Math.max(bases, 0.05)))));
      modules.count = nb * 4;
      towers.count = nb * 3;
      landers.count = pads.count = nb;
      lights.built.value = nb / nBases;
      lights.update(time, px);
      // Mines grow wider as they are worked.
      const mineShare = mines * g(1 / (MINES.length * Math.max(mines, 0.05)));
      const nm = Math.round(MINES.length * mineShare);
      sites.forEach((d, i) => {
        const on = i < nm ? 1 : 0;
        const age = ramp(p, i / MINES.length - 0.1, i / MINES.length + 0.5);
        world.site(i, d, on * (0.012 + 0.03 * age), on * (0.5 + 0.5 * age));
      });
      rovers.built.value = nm / MINES.length;
      furnaces.built.value = nm / MINES.length;
      furnaces.update(time, px);
      rovers.update(time, px);
      const nd = domes > 0 ? Math.round(DOMES * domes * g(1 / (DOMES * domes))) : 0;
      domeMesh.count = gardenMesh.count = nd;
      // The driver: its coils laid one by one, then the slugs fly.
      rig.laid(ramp(p, 0.15, 0.55));
      rig.firing(ramp(p, 0.5, 0.65));
      rig.update(time, px);
      // The dish and its relays.
      dish.visible = p > 0.2;
      dish.scale.setScalar(0.06 * ramp(p, 0.2, 0.45) + 1e-4);
      smallDishes.count = Math.round(6 * ramp(p, 0.3, 0.7));
      for (let i = 0; i < 2; i++) {
        const th = time * 0.05 + i * Math.PI;
        relay[i]?.set(-Math.cos(th) * 1.8, Math.sin(th) * 1.8, 0.4);
        relayAttr.setXYZ(i, relay[i]?.x ?? 0, relay[i]?.y ?? 0, relay[i]?.z ?? 0);
      }
      relayAttr.needsUpdate = true;
      relayDots.built.value = ramp(p, 0.35, 0.5);
      relayDots.update(time, px);
      relayLinks.set(0, [relay[0] as THREE.Vector3, dishTop]);
      relayLinks.set(1, [relay[1] as THREE.Vector3, dishTop]);
      relayLinks.set(2, [relay[0] as THREE.Vector3, poleBase]);
      relayLinks.set(3, [relay[1] as THREE.Vector3, poleBase]);
      relayLinks.built.value = ramp(p, 0.45, 0.8);
      relayLinks.update(time);
    },
    dispose() {
      sky.dispose();
      world.dispose();
      earth.dispose();
      for (const x of [lights, rovers, furnaces, relayDots]) x.dispose();
      rig.dispose();
      relayLinks.dispose();
      bag.dispose();
    },
  };
};

export default moon;
