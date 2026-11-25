/**
 * Earth's orbits filling with industry. The story opens close on the first real unit (a station,
 * a depot or a collector, whichever the record is most about) against the Earth, then pulls back
 * as its copies fill low orbit and the geostationary ring:
 *
 * - stations: a shell of stations and satellites in low orbit; with beams, a laser mesh between
 *   them and down to ground stations;
 * - collectors: sunlit collectors along the geostationary ring, glinting as they turn;
 * - radiators: craft glowing red as they shed the heat of the work done in orbit;
 * - beams: power beamed from the collectors to receivers on the ground, pulsing down;
 * - elevator: a tether from the equator past the geostationary ring, climbers riding it;
 * - depots: propellant depots low and high, tankers streaming between them.
 *
 * Units are Earth radii, true to scale: low orbit at 1.06, the geostationary ring at 6.6. The
 * modelled craft are drawn far larger than life so they read up close.
 */

import type * as THREE from "three";
import { makeEarth } from "../lib/bodies.ts";
import {
  Bag,
  makeCollector,
  makeDepot,
  makeStation,
  materials,
  shapes,
} from "../lib/space/craft.ts";
import {
  addSunlight,
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
import { makeDots, makeFlow, makeOrbiting } from "../lib/space/points.ts";
import { makeRibbons } from "../lib/space/ribbons.ts";
import type { Kind } from "../types.ts";

const GEO = 6.62;
const TILT = (23.44 * Math.PI) / 180;

const orbit: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  let stations = share(ctx, "stations", 0);
  const collectors = share(ctx, "collectors", 0);
  const radiators = share(ctx, "radiators", 0);
  const depots = share(ctx, "depots", 0);
  const beams = flag(ctx, "beams", false);
  const elevator = flag(ctx, "elevator", false);
  if (stations + collectors + radiators + depots === 0) stations = 0.5;
  const accent = ctx.colour;
  const bag = new Bag();

  const sunDir = new T.Vector3(1, 0.12, -0.25).normalize();
  const sunPos = sunDir.clone().multiplyScalar(23481);
  const sky = makeBackdrop(ctx);
  const earth = makeEarth(ctx, { sun: sunPos });
  scene.add(earth.group);
  addSunlight(ctx, sunDir, 3.2, 0.18);
  const tilt = new T.Group();
  tilt.rotation.z = TILT;
  const spin = new T.Group();
  tilt.add(spin);
  scene.add(tilt);

  // --- The first unit, modelled -----------------------------------------------------------------
  const hero =
    depots > Math.max(stations, collectors)
      ? "depot"
      : collectors > stations
        ? "collector"
        : "station";
  const s = shapes(ctx, bag);
  const m = materials(ctx, bag);
  m.setHeat(0.15 + 0.85 * radiators);
  const heroAz = 1.15;
  // High over the northern hemisphere, so the Earth lies below the craft in the frame.
  const heroDir = new T.Vector3(Math.cos(heroAz) * 0.55, 0.82, Math.sin(heroAz) * 0.55).normalize();
  const heroR = hero === "collector" ? GEO : 1.07;
  const heroPos = heroDir.clone().multiplyScalar(heroR);
  const heroSize = hero === "collector" ? 0.22 : 0.012;
  const heroObj =
    hero === "depot"
      ? makeDepot(ctx, s, m)
      : hero === "collector"
        ? makeCollector(ctx, s, m)
        : makeStation(ctx, s, m);
  heroObj.scale.setScalar(heroSize);
  heroObj.position.copy(heroPos);
  // Stations fly along their orbit; a collector faces the Sun; a depot points its tanker at Earth.
  if (hero === "collector")
    heroObj.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      sunDir.clone().add(heroDir).normalize(),
    );
  else if (hero === "depot")
    heroObj.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), heroDir.clone().negate());
  else heroObj.lookAt(heroPos.clone().add(new T.Vector3(0, 1, 0).cross(heroDir)));
  scene.add(heroObj);

  // --- Low orbit ----------------------------------------------------------------------------------
  const low = makeOrbiting(ctx, {
    count: 7000,
    rMin: 1.04,
    rMax: 1.32,
    tilt: 1.3,
    colour: "#cfe0ff",
    colourB: "#ffffff",
    size: 0.006,
    minPx: 1.6,
    maxPx: 5,
    speed: 0.09,
    ref: 1.1,
    seed: 3,
    bias: 2.2,
    gain: 1.3,
  });
  const heat = makeOrbiting(ctx, {
    count: 2600,
    rMin: 1.06,
    rMax: GEO + 0.3,
    tilt: 0.5,
    colour: "#ff4a1c",
    colourB: "#ff9a4a",
    size: 0.012,
    minPx: 1.4,
    maxPx: 6,
    speed: 0.05,
    ref: 2,
    seed: 7,
    bias: 3,
    gain: 1.4,
  });
  scene.add(low.points, heat.points);

  // --- The geostationary ring: collectors turning with the Earth ----------------------------------
  const ring = makeOrbiting(ctx, {
    count: 6000,
    rMin: GEO - 0.25,
    rMax: GEO + 0.25,
    tilt: 0.03,
    colour: "#ffe2a0",
    colourB: "#fff6dc",
    size: 0.035,
    minPx: 1.3,
    maxPx: 7,
    speed: 0.015,
    ref: GEO,
    seed: 5,
    gain: 1.3,
    glint: 2.5,
  });
  tilt.add(ring.points);
  // Big collectors over the receivers, each beaming down.
  const BEAMS = 8;
  const beamLon = (i: number) => -150 + i * 45 + 20;
  const slots: THREE.Group[] = [];
  for (let i = 0; i < BEAMS; i++) {
    const c = makeCollector(ctx, s, m);
    c.scale.setScalar(0.26);
    c.position.copy(ll(T, beamLon(i), 0, GEO));
    spin.add(c);
    slots.push(c);
  }
  const beamLines = [];
  const rectennas = [];
  for (let i = 0; i < BEAMS; i++) {
    const top = ll(T, beamLon(i), 0, GEO - 0.1);
    const lat = (i % 2 ? 1 : -1) * (18 + ((i * 7) % 15));
    const foot = ll(T, beamLon(i) + 4, lat, 1.003);
    beamLines.push({ points: [top, foot], born: i / BEAMS, seed: i * 0.21 });
    // A receiver: a ring on the ground in the record's colour.
    const n = foot.clone().normalize();
    const e1 = new T.Vector3(0, 1, 0).cross(n).normalize();
    const e2 = n.clone().cross(e1);
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      pts.push(
        n
          .clone()
          .addScaledVector(e1, Math.cos(a) * 0.022)
          .addScaledVector(e2, Math.sin(a) * 0.022)
          .normalize()
          .multiplyScalar(1.004),
      );
    }
    rectennas.push({ points: pts, born: i / BEAMS });
  }
  const power = makeRibbons(ctx, beamLines, {
    colour: "#ffc98a",
    pulse: "#fff1d0",
    width: 2.4,
    pulses: 5,
    speed: -0.6,
    base: 0.35,
  });
  const receivers = makeRibbons(ctx, rectennas, {
    colour: accent,
    width: 1.3,
    pulses: 1,
    speed: 0.3,
    base: 1,
  });
  power.mesh.visible = receivers.mesh.visible = beams;
  spin.add(power.mesh, receivers.mesh);

  // --- A laser mesh in low orbit: six planes of eight, linked along and across ------------------
  const PLANES = 6;
  const PER = 8;
  const sats = PLANES * PER;
  const satPos = Array.from({ length: sats }, () => new T.Vector3());
  const links: { points: THREE.Vector3[]; born: number; seed: number }[] = [];
  const pairs: [number, number][] = [];
  for (let pl = 0; pl < PLANES; pl++)
    for (let k = 0; k < PER; k++) {
      const i = pl * PER + k;
      pairs.push([i, pl * PER + ((k + 1) % PER)]);
      pairs.push([i, ((pl + 1) % PLANES) * PER + k]);
    }
  const GROUND = [
    [-77, 39],
    [2, 48],
    [139, 36],
    [-47, -16],
    [28, -26],
    [77, 13],
  ] as const;
  pairs.forEach((_, i) => {
    links.push({
      points: [new T.Vector3(), new T.Vector3()],
      born: (i * 0.618) % 1,
      seed: i * 0.13,
    });
  });
  for (let g = 0; g < GROUND.length; g++)
    links.push({ points: [new T.Vector3(), new T.Vector3()], born: g / GROUND.length, seed: g });
  const laser = makeRibbons(ctx, links, {
    colour: "#7ff0ff",
    pulse: accent,
    width: 1.1,
    pulses: 2,
    speed: 0.8,
    base: 0.55,
  });
  laser.mesh.visible = beams && stations > 0;
  scene.add(laser.mesh);
  const satDots = makeDots(ctx, {
    positions: new Float32Array(sats * 3),
    colour: "#bff8ff",
    size: 0.008,
    minPx: 2,
    maxPx: 6,
    gain: 1.6,
    twinkle: 0,
  });
  satDots.points.visible = laser.mesh.visible;
  scene.add(satDots.points);
  const satAttr = satDots.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const ground = GROUND.map(([lo, la]) => ll(T, lo, la, 1.002));
  const groundW = new T.Vector3();
  const placeSats = (time: number) => {
    const inc = (53 * Math.PI) / 180;
    for (let pl = 0; pl < PLANES; pl++)
      for (let k = 0; k < PER; k++) {
        const i = pl * PER + k;
        const th = (k / PER) * Math.PI * 2 + pl * 0.4 + time * 0.08;
        const node = (pl / PLANES) * Math.PI * 2;
        const p = satPos[i] as THREE.Vector3;
        p.set(Math.cos(th) * 1.1, 0, Math.sin(th) * 1.1);
        p.set(p.x, p.z * Math.sin(inc), p.z * Math.cos(inc));
        p.set(
          p.x * Math.cos(node) - p.z * Math.sin(node),
          p.y,
          p.x * Math.sin(node) + p.z * Math.cos(node),
        );
        satAttr.setXYZ(i, p.x, p.y, p.z);
      }
    satAttr.needsUpdate = true;
    pairs.forEach(([a, b], i) => {
      laser.set(i, [satPos[a] as THREE.Vector3, satPos[b] as THREE.Vector3]);
    });
    ground.forEach((g, j) => {
      groundW.copy(g).applyMatrix4(spin.matrixWorld);
      let best = satPos[0] as THREE.Vector3;
      for (const p of satPos)
        if (p.distanceToSquared(groundW) < best.distanceToSquared(groundW)) best = p;
      laser.set(pairs.length + j, [groundW.clone(), best]);
    });
  };

  // --- The elevator -----------------------------------------------------------------------------
  const elevLon = (heroAz * -180) / Math.PI + 10;
  const base = ll(T, elevLon, 0, 1.0);
  const top = ll(T, elevLon, 0, 10.5);
  const elevGroup = new T.Group();
  elevGroup.visible = elevator;
  spin.add(elevGroup);
  const tether = makeRibbons(ctx, [{ points: [base, top] }], {
    colour: "#cfe0ff",
    pulse: accent,
    width: 1.2,
    pulses: 6,
    speed: 0.08,
    base: 0.7,
  });
  const climbers = makeFlow(ctx, {
    count: 260,
    colour: "#fff2cf",
    colourB: accent,
    size: 0.05,
    minPx: 2,
    maxPx: 7,
    rate: 0.02,
    width: 0.0,
    seed: 41,
    packets: 9,
  });
  climbers.from.copy(base);
  climbers.to.copy(top);
  climbers.on.value = 1;
  const geoStation = makeStation(ctx, s, m);
  geoStation.scale.setScalar(0.35);
  geoStation.position.copy(ll(T, elevLon, 0, GEO));
  const weight = new T.Mesh(s.ball, m.dark);
  weight.scale.setScalar(0.22);
  weight.position.copy(top);
  elevGroup.add(tether.mesh, climbers.points, geoStation, weight);

  // --- Depots, low and high, and the tankers between them ----------------------------------------
  const DEP = 12;
  const depotGroup = new T.Group();
  depotGroup.visible = depots > 0;
  spin.add(depotGroup);
  const depotAt: THREE.Vector3[] = [];
  const depObjs: THREE.Object3D[] = [];
  for (let i = 0; i < DEP; i++) {
    const high = i % 3 === 2;
    const p = high
      ? ll(T, -160 + i * 31, 0, GEO + 0.05)
      : ll(T, -150 + i * 29, ((i * 37) % 50) - 25, 1.12);
    depotAt.push(p);
    const d = makeDepot(ctx, s, m);
    d.scale.setScalar(high ? 0.2 : 0.03);
    d.position.copy(p);
    d.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), p.clone().normalize().negate());
    depotGroup.add(d);
    depObjs.push(d);
  }
  const depotDots = makeDots(ctx, {
    positions: depotAt.flatMap((p) => [p.x, p.y, p.z]),
    born: depotAt.map((_, i) => i / DEP),
    colour: "#cdeaff",
    colourB: accent,
    size: 0.05,
    minPx: 3,
    maxPx: 9,
    gain: 1.5,
    twinkle: 0.3,
  });
  depotGroup.add(depotDots.points);
  const tankers = [0, 1, 2, 3].map((i) => {
    const f = makeFlow(ctx, {
      count: 140,
      colour: "#bfe6ff",
      colourB: "#ffe1a8",
      size: 0.03,
      minPx: 1.5,
      maxPx: 5,
      rate: 0.04 + i * 0.01,
      width: 0.04,
      seed: 50 + i,
      packets: 5,
    });
    const a = depotAt[i * 3] as THREE.Vector3;
    const b = depotAt[i * 3 + 2] as THREE.Vector3;
    f.from.copy(a);
    f.to.copy(b);
    f.bend.copy(a.clone().add(b).normalize().multiplyScalar(2.2));
    depotGroup.add(f.points);
    return f;
  });
  // A tug outbound for the Moon's distance.
  const tug = makeFlow(ctx, {
    count: 120,
    colour: "#ffe1a8",
    size: 0.05,
    minPx: 1.5,
    maxPx: 5,
    rate: 0.025,
    width: 0.1,
    seed: 61,
    packets: 3,
  });
  tug.from.copy(depotAt[2] as THREE.Vector3);
  tug.to.copy(
    (depotAt[2] as THREE.Vector3)
      .clone()
      .normalize()
      .multiplyScalar(22)
      .add(new T.Vector3(0, 3, 0)),
  );
  tug.bend.set(0, 2, 0);
  depotGroup.add(tug.points);

  // --- The camera: close on the first unit, then out to the geostationary ring -----------------
  const out = heroDir.clone();
  const side = new T.Vector3(0, 1, 0).cross(out).normalize();
  const up = out.clone().cross(side);
  const off =
    hero === "collector"
      ? out
          .clone()
          .multiplyScalar(0.75)
          .addScaledVector(side, 0.55)
          .addScaledVector(up, 0.25)
          .normalize()
      : side
          .clone()
          .multiplyScalar(0.8)
          .addScaledVector(out, 0.38)
          .addScaledVector(up, 0.3)
          .normalize();
  const azel = (v: THREE.Vector3): [number, number] => [
    Math.atan2(v.z, v.x),
    Math.asin(v.y / v.length()),
  ];
  const [az0, el0] = azel(off);
  const [azH] = azel(heroPos.clone().add(off.clone().multiplyScalar(0.5)));
  const hasGeo = collectors > 0 || beams || depots > 0.3 || radiators > 0.5;
  const farD = elevator ? 19 : hasGeo ? 17 : 4.6;
  const d0 = hero === "collector" ? 0.75 : 0.042;
  const H: [number, number, number] = [heroPos.x, heroPos.y, heroPos.z];
  const near: [number, number, number] =
    hero === "collector" ? [0, 0, 0] : [heroPos.x * 0.3, heroPos.y * 0.3, heroPos.z * 0.3];
  // With an elevator, frame its whole length: aim at its middle.
  const mid = ll(T, elevLon, 0, 4.5).applyAxisAngle(new T.Vector3(0, 0, 1), TILT);
  const endTarget: [number, number, number] = elevator ? [mid.x, mid.y, mid.z] : [0, 0, 0];
  const shots: Shot[] = [
    { at: 0, d: d0, az: az0, el: el0, target: H },
    { at: 0.3, d: hero === "collector" ? 4 : 2.6, az: azH + 0.35, el: 0.5, target: near },
    { at: 0.65, d: Math.min(farD, 6), az: azH + 0.15, el: 0.55, target: [0, 0, 0] },
    { at: 1, d: farD, az: azH - 0.1, el: 0.62, target: endTarget },
  ];
  // Keep every azimuth on the same turn as the first, so the camera never swings the long way.
  for (const k of shots) while (k.az - az0 > Math.PI) k.az -= Math.PI * 2;
  for (const k of shots) while (az0 - k.az > Math.PI) k.az += Math.PI * 2;
  const pose = shotPath(T, shots);

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      const et = time * 0.3;
      earth.update(et, camera);
      spin.rotation.y = et * 0.05;
      tilt.updateMatrixWorld(true);
      const px = pixelScale(ctx, size);
      const g = (first: number) => grow(p, first);
      low.built.value = stations * g(0.003);
      heat.built.value = radiators * g(0.004);
      ring.built.value = collectors * g(0.002);
      for (const o of [low, heat, ring]) o.update(time, px);
      const nCol = collectors > 0 ? Math.ceil(BEAMS * collectors * g(0.02)) : 0;
      slots.forEach((c, i) => {
        c.visible = i < nCol;
        c.lookAt(sunPos);
        c.rotateX(Math.PI / 2);
      });
      power.built.value = g(1 / BEAMS) * (collectors > 0 ? Math.max(0.5, collectors) : 0.5);
      receivers.built.value = power.built.value;
      power.update(time);
      receivers.update(time);
      if (laser.mesh.visible) {
        placeSats(time);
        laser.built.value = stations * g(0.05) * 1.05;
        satDots.built.value = 1;
        laser.update(time);
        satDots.update(time, px);
      }
      tether.reveal.value = 0.08 + 0.94 * ramp(p, 0, 0.75);
      tether.update(time);
      climbers.len.value = tether.reveal.value;
      climbers.on.value = ramp(p, 0.1, 0.5);
      climbers.update(time, px);
      geoStation.visible = tether.reveal.value > 0.6;
      weight.visible = tether.reveal.value > 0.98;
      const nDep = Math.ceil(DEP * depots * g(1 / (DEP * Math.max(depots, 0.01))));
      depObjs.forEach((d, i) => {
        d.visible = i < nDep;
      });
      depotDots.built.value = nDep / DEP;
      depotDots.update(time, px);
      tankers.forEach((f, i) => {
        f.on.value = ramp(nDep / DEP, (i * 3 + 2) / DEP, (i * 3 + 3) / DEP);
        f.update(time, px);
      });
      tug.on.value = ramp(p, 0.55, 0.9) * (depots > 0.4 ? 1 : 0);
      tug.update(time, px);
    },
    dispose() {
      sky.dispose();
      earth.dispose();
      for (const o of [low, heat, ring, satDots, depotDots, climbers, tug, ...tankers]) o.dispose();
      for (const r of [power, receivers, laser, tether]) r.dispose();
      bag.dispose();
    },
  };
};

export default orbit;
