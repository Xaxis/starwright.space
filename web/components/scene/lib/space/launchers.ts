/**
 * The six ways off a world, for the launch kind. Each builds into a root group whose origin is the
 * world's centre (radius 1), around a launch site, and returns the camera's shots (in the root's
 * frame) and a per-frame update. `cadence` (0 to 1) is how often they launch; `p` the story's
 * progress, from the first unit to the full system.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import {
  type Bag,
  type Materials,
  makeCollector,
  makeRocket,
  makeStation,
  type Shapes,
} from "./craft.ts";
import { makeDriver } from "./driver.ts";
import { grow, mix, ramp, type Shot } from "./kit.ts";
import { makeDots, makeFlow } from "./points.ts";
import { headAt, makeRibbons, pointAlong } from "./ribbons.ts";

export type Method = "rocket" | "mass-driver" | "tether" | "elevator" | "loop" | "sail";
export type WorldName = "earth" | "moon" | "mercury" | "asteroid";

export interface LaunchEnv {
  ctx: KindContext;
  s: Shapes;
  m: Materials;
  bag: Bag;
  root: THREE.Group;
  /** The site's frame in the root: up, east, north. */
  n: THREE.Vector3;
  e: THREE.Vector3;
  north: THREE.Vector3;
  cadence: number;
  world: WorldName;
  /** The Sun's direction, in the root's frame. */
  sun: THREE.Vector3;
}

export interface Rig {
  shots: Shot[];
  update(time: number, p: number, pixel: number): void;
  dispose(): void;
}

/** Azimuth and elevation of a direction, for a shot. */
export function azel(v: THREE.Vector3): [number, number] {
  const u = v.clone().normalize();
  return [Math.atan2(u.z, u.x), Math.asin(Math.max(-1, Math.min(1, u.y)))];
}

function shot(at: number, d: number, dir: THREE.Vector3, target: THREE.Vector3): Shot {
  const [az, el] = azel(dir);
  return { at, d, az, el, target: [target.x, target.y, target.z] };
}

/** A point near the site: offsets east and north (radians) and height above the surface. */
function siteAt(env: LaunchEnv, dx: number, dy: number, h: number): THREE.Vector3 {
  return env.n
    .clone()
    .addScaledVector(env.e, dx)
    .addScaledVector(env.north, dy)
    .normalize()
    .multiplyScalar(1 + h);
}

/** Stand an object at a point on the surface, its +y along the local up. */
function standAt(env: LaunchEnv, obj: THREE.Object3D, p: THREE.Vector3, size: number) {
  const T = env.ctx.three;
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), p.clone().normalize());
  obj.scale.setScalar(size);
}

// --- Rockets ------------------------------------------------------------------------------------

function rocket(env: LaunchEnv): Rig {
  const { ctx, s, m, root, n, e, north, cadence } = env;
  const T = ctx.three;
  const lines = 1 + Math.round(cadence * 22);
  const pads = Math.min(6, 1 + Math.round(cadence * 5));
  const padAt = (i: number) =>
    siteAt(env, (i % 3) * 0.018 - 0.018, Math.floor(i / 3) * 0.02, 0.0005);
  const comet = env.world === "asteroid";
  const cometAt = n.clone().multiplyScalar(2.5).addScaledVector(e, 7).addScaledVector(north, -2);
  const paths: THREE.Vector3[][] = [];
  for (let i = 0; i < lines; i++) {
    const pad = padAt(i % pads);
    const pts: THREE.Vector3[] = [];
    if (comet) {
      // Interceptors climb away from the depot and curve toward the comet.
      const c1 = pad.clone().addScaledVector(pad.clone().normalize(), 1.2);
      const aim = cometAt.clone().addScaledVector(north, (i % 5) * 0.08 - 0.16);
      for (let k = 0; k <= 40; k++) {
        const u = k / 40;
        pts.push(
          pad
            .clone()
            .multiplyScalar((1 - u) ** 2)
            .addScaledVector(c1, 2 * u * (1 - u))
            .addScaledVector(aim, u * u),
        );
      }
    } else {
      // A gravity turn: straight up, then over toward the east, into orbit.
      const heading = (i * 0.618) % 1;
      const dir = e
        .clone()
        .multiplyScalar(Math.cos((heading - 0.5) * 0.9))
        .addScaledVector(north, Math.sin((heading - 0.5) * 0.9));
      const up = pad.clone().normalize();
      const H = 0.16 + 0.06 * ((i * 0.37) % 1);
      const theta = 0.9 + 0.5 * ((i * 0.53) % 1);
      for (let k = 0; k <= 48; k++) {
        const u = k / 48;
        const th = theta * u ** 1.8;
        const h = H * (1 - (1 - u) ** 2);
        pts.push(
          up
            .clone()
            .multiplyScalar(Math.cos(th))
            .addScaledVector(dir, Math.sin(th))
            .normalize()
            .multiplyScalar(1 + h),
        );
      }
    }
    paths.push(pts);
  }
  const travel = { rate: 0.04 + cadence * 0.05, trail: comet ? 0.25 : 0.4, accel: 1.5 };
  const trails = makeRibbons(
    ctx,
    paths.map((points, i) => ({ points, born: i / lines, seed: (i * 0.618) % 1 })),
    { colour: "#ffcf9a", pulse: "#fff4e0", width: 1.5, pulses: 0, base: 0.9, travel },
  );
  root.add(trails.mesh);
  const flames = makeDots(ctx, {
    positions: new Float32Array(lines * 3),
    born: paths.map((_, i) => i / lines),
    colour: "#fff1d0",
    colourB: "#ffb35e",
    size: 0.006,
    minPx: 2.5,
    maxPx: 10,
    gain: 2.4,
    twinkle: 0.3,
  });
  root.add(flames.points);
  const fAttr = flames.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  // Rockets waiting on their pads, and the pads in the record's colour.
  for (let i = 0; i < pads; i++) {
    const r = makeRocket(ctx, s, m);
    standAt(env, r, padAt(i), 0.009);
    root.add(r);
    const pad = new T.Mesh(s.cyl, m.accent);
    standAt(env, pad, padAt(i), 1);
    pad.scale.set(0.006, 0.0003, 0.006);
    root.add(pad);
  }
  // The comet the interceptors chase, its tail streaming away from the Sun.
  const cometGroup = new T.Group();
  cometGroup.visible = comet;
  root.add(cometGroup);
  const tail = makeFlow(ctx, {
    count: Math.round(2400 * ctx.detail) + 600,
    colour: "#bfe6ff",
    colourB: "#ffffff",
    size: 0.018,
    minPx: 1.2,
    maxPx: 4,
    rate: 0.04,
    width: 0.4,
    fan: 1,
    seed: 201,
    gain: 0.55,
  });
  tail.from.copy(cometAt);
  tail.to.copy(cometAt).addScaledVector(env.sun, -4);
  tail.on.value = 1;
  const nucleus = makeDots(ctx, {
    positions: [cometAt.x, cometAt.y, cometAt.z],
    colour: "#e8f6ff",
    size: 0.15,
    minPx: 4,
    maxPx: 16,
    gain: 2,
  });
  cometGroup.add(tail.points, nucleus.points);

  const site = siteAt(env, 0, 0, 0.02);
  const pull = comet ? 9 : 2.9;
  const shots = [
    shot(
      0,
      comet ? 0.14 : 0.55,
      north
        .clone()
        .multiplyScalar(0.7)
        .addScaledVector(n, comet ? 0.3 : 0.55)
        .addScaledVector(e, -0.35),
      comet ? site : siteAt(env, 0.02, 0, 0.03),
    ),
    shot(
      0.35,
      0.6,
      north.clone().multiplyScalar(0.7).addScaledVector(n, 0.55).addScaledVector(e, -0.2),
      siteAt(env, 0.12, 0, 0.1),
    ),
    shot(
      1,
      pull,
      comet
        ? north.clone().multiplyScalar(0.75).addScaledVector(n, 0.6).addScaledVector(e, -0.15)
        : north.clone().multiplyScalar(0.55).addScaledVector(n, 0.7).addScaledVector(e, 0.2),
      comet ? cometAt.clone().multiplyScalar(0.5) : n.clone().multiplyScalar(0.5),
    ),
  ];
  const tmp = new T.Vector3();
  return {
    shots,
    update(time, p, px) {
      const shown = Math.max(1, Math.round(lines * grow(p, 1 / lines)));
      trails.built.value = shown / lines;
      trails.update(time);
      for (let i = 0; i < lines; i++) {
        const h = headAt(time, (i * 0.618) % 1, travel);
        pointAlong(paths[i] as THREE.Vector3[], h, tmp);
        fAttr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      fAttr.needsUpdate = true;
      flames.built.value = shown / lines;
      flames.update(time, px);
      tail.update(time, px);
      nucleus.update(time, px);
    },
    dispose() {
      trails.dispose();
      flames.dispose();
      tail.dispose();
      nucleus.dispose();
    },
  };
}

// --- Mass driver --------------------------------------------------------------------------------

function massDriver(env: LaunchEnv): Rig {
  const { ctx, s, m, bag, root, n, e, cadence, world } = env;
  const T = ctx.three;
  const a = siteAt(env, -0.16, 0, 0.004);
  const b = siteAt(env, 0.14, 0, 0.004);
  const dir = b.clone().sub(a).normalize();
  const up = b.clone().normalize();
  const rig = makeDriver(ctx, s, m, bag, {
    a,
    b,
    to: b.clone().addScaledVector(dir, 6).addScaledVector(up, 2.6),
    bend: up.clone().multiplyScalar(0.9),
    coils: 64,
    coilSize: 0.006,
    slug: 0.0045,
    width: 0.3,
    cadence,
    colour: world === "asteroid" ? "#ffd9a0" : "#fff0c8",
    accent: ctx.colour,
    seed: 211,
    count: 1400,
  });
  root.add(rig.group);
  // The plant feeding it: a refinery's blocks and its furnace, glowing.
  const plant = new T.Group();
  for (let i = 0; i < 7; i++) {
    const box = new T.Mesh(i === 3 ? s.cyl : s.box, i % 2 ? m.hull : m.tank);
    const h = 0.003 + (i % 3) * 0.0015;
    standAt(
      env,
      box,
      siteAt(env, -0.195 + (i % 4) * 0.008, (Math.floor(i / 4) - 0.5) * 0.012, h / 2),
      1,
    );
    box.scale.set(0.006, h, 0.005);
    plant.add(box);
  }
  const furnace = makeDots(ctx, {
    positions: (() => {
      const p = siteAt(env, -0.185, 0, 0.012);
      return [p.x, p.y, p.z];
    })(),
    colour: "#ff9a3a",
    size: 0.02,
    minPx: 4,
    maxPx: 22,
    gain: 2.2,
    twinkle: 0.2,
  });
  plant.add(furnace.points);
  root.add(plant);
  const shots = [
    shot(
      0,
      0.15,
      e.clone().multiplyScalar(-0.55).addScaledVector(n, 0.55).addScaledVector(env.north, 0.6),
      siteAt(env, -0.15, 0, 0.004),
    ),
    shot(
      0.4,
      0.55,
      e.clone().multiplyScalar(-0.3).addScaledVector(n, 0.6).addScaledVector(env.north, 0.7),
      siteAt(env, 0.05, 0, 0.05),
    ),
    shot(
      1,
      3.2,
      e.clone().multiplyScalar(0.2).addScaledVector(n, 0.6).addScaledVector(env.north, 0.75),
      b.clone().addScaledVector(dir, 1.2).addScaledVector(up, 0.4),
    ),
  ];
  return {
    shots,
    update(time, p, px) {
      rig.laid(mix(0.12, 1, ramp(p, 0, 0.5)));
      rig.firing(1);
      rig.update(time, px);
      furnace.update(time, px);
    },
    dispose() {
      rig.dispose();
      furnace.dispose();
    },
  };
}

// --- Rotating tethers ---------------------------------------------------------------------------

function tether(env: LaunchEnv): Rig {
  const { ctx, s, m, root, n, e, cadence } = env;
  const T = ctx.three;
  const count = 1 + Math.round(cadence * 3);
  const lines = Array.from({ length: count }, (_, i) => ({
    points: [new T.Vector3(), new T.Vector3(), new T.Vector3()],
    born: i / count,
  }));
  const cables = makeRibbons(ctx, lines, {
    colour: "#dfe8ff",
    pulse: ctx.colour,
    width: 1.3,
    pulses: 4,
    speed: 0.4,
    base: 0.75,
  });
  root.add(cables.mesh);
  const hubs = Array.from({ length: count }, () => {
    const st = makeStation(ctx, s, m);
    root.add(st);
    return st;
  });
  const payloads = makeDots(ctx, {
    positions: new Float32Array(count * 2 * 3),
    colour: "#fff1d0",
    colourB: ctx.colour,
    size: 0.008,
    minPx: 2.5,
    maxPx: 9,
    gain: 2.2,
    twinkle: 0,
  });
  root.add(payloads.points);
  const pAttr = payloads.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  // The suborbital hop that brings each payload up to the tip.
  const hopPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    hopPts.push(siteAt(env, -0.05 + u * 0.05, 0, 0.03 * Math.sin((u * Math.PI) / 2)));
  }
  const ORBIT = 96;
  const orbitPts = Array.from({ length: ORBIT + 1 }, () => new T.Vector3());
  const orbit = makeRibbons(ctx, [{ points: orbitPts }], {
    colour: "#8fb0ff",
    width: 0.8,
    base: 0.35,
    pulses: 0,
  });
  root.add(orbit.mesh);
  let orbitL = -1;
  const hop = makeRibbons(ctx, [{ points: hopPts }], {
    colour: "#ffcf9a",
    width: 1.4,
    base: 1,
    pulses: 0,
    travel: { rate: 0.08, trail: 0.6 },
  });
  root.add(hop.mesh);
  const flings = Array.from({ length: count }, (_, i) => {
    const f = makeFlow(ctx, {
      count: 260,
      colour: "#fff1d0",
      colourB: ctx.colour,
      size: 0.01,
      minPx: 1.5,
      maxPx: 5,
      rate: 0.05,
      width: 0.08,
      fan: 1,
      seed: 230 + i,
      packets: 4,
      gain: 1.5,
    });
    root.add(f.points);
    return f;
  });
  const C = new T.Vector3();
  const radial = new T.Vector3();
  const along = new T.Vector3();
  const tipA = new T.Vector3();
  const tipB = new T.Vector3();
  let L = 0.1;
  const centreAt = (i: number, time: number) => {
    const ph = -i * 0.55 + time * 0.012;
    radial.copy(n).multiplyScalar(Math.cos(ph)).addScaledVector(e, Math.sin(ph)).normalize();
    along.copy(e).multiplyScalar(Math.cos(ph)).addScaledVector(n, -Math.sin(ph)).normalize();
    C.copy(radial).multiplyScalar(1.03 + L);
  };
  centreAt(0, 0);
  const c0 = C.clone();
  const shots = [
    shot(
      0,
      0.5,
      env.north.clone().multiplyScalar(0.85).addScaledVector(e, -0.3).addScaledVector(n, 0.2),
      c0.clone().multiplyScalar(0.96),
    ),
    shot(
      0.45,
      1.2,
      env.north.clone().multiplyScalar(0.8).addScaledVector(e, 0.1).addScaledVector(n, 0.4),
      c0.clone().multiplyScalar(0.9),
    ),
    shot(
      1,
      2.6,
      env.north.clone().multiplyScalar(0.7).addScaledVector(e, 0.25).addScaledVector(n, 0.55),
      n.clone().multiplyScalar(0.6),
    ),
  ];
  return {
    shots,
    update(time, p, px) {
      L = mix(0.08, 0.26, grow(p, 0));
      if (Math.abs(L - orbitL) > 1e-4) {
        orbitL = L;
        orbitPts.forEach((v, k) => {
          const a = (k / ORBIT) * Math.PI * 2;
          v.copy(n)
            .multiplyScalar(Math.cos(a))
            .addScaledVector(e, Math.sin(a))
            .multiplyScalar(1.03 + L);
        });
        orbit.set(0, orbitPts);
      }
      const shown = Math.max(1, Math.round(count * grow(p, 1 / count)));
      cables.built.value = shown / count;
      for (let i = 0; i < count; i++) {
        centreAt(i, time);
        // At time 0 the first tether hangs straight down over the site, catching.
        const th = Math.PI + time * 0.22 + i * 1.3;
        tipA
          .copy(C)
          .addScaledVector(radial, Math.cos(th) * L)
          .addScaledVector(along, Math.sin(th) * L);
        tipB
          .copy(C)
          .addScaledVector(radial, -Math.cos(th) * L)
          .addScaledVector(along, -Math.sin(th) * L);
        cables.set(i, [tipA, C, tipB]);
        const hub = hubs[i] as THREE.Object3D;
        hub.visible = i < shown;
        hub.position.copy(C);
        hub.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), tipA.clone().sub(C).normalize());
        hub.scale.setScalar(0.03);
        // The payload rides tip A on its way up, and leaves it at the top.
        const rising = Math.sin(th - Math.PI) <= 0 ? 1 : 0;
        const carry = i < shown && rising ? 1 : 0;
        pAttr.setXYZ(i * 2, carry ? tipA.x : C.x, carry ? tipA.y : C.y, carry ? tipA.z : C.z);
        pAttr.setXYZ(i * 2 + 1, C.x, C.y, C.z);
        const f = flings[i] as ReturnType<typeof makeFlow>;
        f.from.copy(C).addScaledVector(radial, L);
        f.to.copy(f.from).addScaledVector(along, 1.6).addScaledVector(radial, 1.2);
        f.bend.copy(radial).multiplyScalar(0.2);
        f.on.value = i < shown ? ramp(p, 0.1, 0.3) : 0;
        f.update(time, px);
      }
      pAttr.needsUpdate = true;
      payloads.built.value = 1;
      payloads.update(time, px);
      cables.update(time);
      orbit.update(time);
      hop.update(time);
    },
    dispose() {
      cables.dispose();
      orbit.dispose();
      payloads.dispose();
      hop.dispose();
      for (const f of flings) f.dispose();
    },
  };
}

// --- Space elevator -----------------------------------------------------------------------------

function elevator(env: LaunchEnv): Rig {
  const { ctx, s, m, root, n, e, cadence, world } = env;
  const T = ctx.three;
  const top = world === "earth" ? 10.5 : world === "moon" ? 9 : 6;
  const station = world === "earth" ? 6.62 : top * 0.62;
  const base = n.clone().multiplyScalar(1.001);
  const tip = n.clone().multiplyScalar(top);
  const ribbon = makeRibbons(ctx, [{ points: [base, tip] }], {
    colour: "#d8e6ff",
    pulse: ctx.colour,
    width: 1.3,
    pulses: 8,
    speed: 0.06,
    base: 0.75,
  });
  root.add(ribbon.mesh);
  const climbers = makeFlow(ctx, {
    count: 60 * (3 + Math.round(cadence * 15)),
    colour: "#fff2cf",
    colourB: ctx.colour,
    size: 0.03,
    minPx: 2.5,
    maxPx: 8,
    rate: 0.015,
    width: 0,
    seed: 241,
    packets: 3 + Math.round(cadence * 15),
    gain: 1.8,
  });
  climbers.from.copy(base);
  climbers.to.copy(tip);
  root.add(climbers.points);
  const hub = makeStation(ctx, s, m);
  hub.position.copy(n).multiplyScalar(station);
  hub.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), e);
  hub.scale.setScalar(0.45);
  root.add(hub);
  const weight = new T.Mesh(s.ball, m.dark);
  weight.position.copy(tip);
  weight.scale.setScalar(0.25);
  root.add(weight);
  // The anchor platform at sea: a few work lights round the ribbon's foot.
  const anchor = makeDots(ctx, {
    positions: [0, 1, 2, 3, 4].flatMap((k) => {
      const a = (k / 5) * Math.PI * 2;
      const p = siteAt(env, Math.cos(a) * 0.004, Math.sin(a) * 0.004, 0.0004);
      return [p.x, p.y, p.z];
    }),
    colour: "#ffe2b0",
    size: 0.0015,
    minPx: 2,
    maxPx: 6,
    gain: 1.6,
    twinkle: 0.3,
  });
  root.add(anchor.points);
  const shots = [
    shot(
      0,
      0.16,
      env.north.clone().multiplyScalar(0.9).addScaledVector(n, 0.05).addScaledVector(e, 0.4),
      n.clone().multiplyScalar(1.06),
    ),
    shot(
      0.45,
      3.2,
      env.north.clone().multiplyScalar(0.85).addScaledVector(e, 0.5),
      n.clone().multiplyScalar(2.2),
    ),
    shot(
      1,
      top * 1.75,
      env.north.clone().multiplyScalar(0.8).addScaledVector(e, 0.55).addScaledVector(n, 0.15),
      n.clone().multiplyScalar(top * 0.42),
    ),
  ];
  return {
    shots,
    update(time, p, px) {
      const reveal = mix(0.08, 1.02, ramp(p, 0, 0.7));
      ribbon.reveal.value = reveal;
      ribbon.update(time);
      climbers.len.value = reveal;
      climbers.on.value = ramp(p, 0.05, 0.3);
      climbers.update(time, px);
      hub.visible = reveal * top > station;
      weight.visible = reveal > 0.99;
      anchor.update(time, px);
    },
    dispose() {
      ribbon.dispose();
      climbers.dispose();
      anchor.dispose();
    },
  };
}

// --- Launch loop --------------------------------------------------------------------------------

function loop(env: LaunchEnv): Rig {
  const { ctx, root, n, e, north, cadence } = env;
  const half = 0.16;
  const h = 0.035;
  const arc = (th: number, hh: number, side: number) =>
    n
      .clone()
      .multiplyScalar(Math.cos(th))
      .addScaledVector(e, Math.sin(th))
      .addScaledVector(north, side)
      .normalize()
      .multiplyScalar(1 + hh);
  const upper: THREE.Vector3[] = [];
  const lower: THREE.Vector3[] = [];
  for (let k = 0; k <= 40; k++) {
    const th = -half + (2 * half * k) / 40;
    upper.push(arc(th, h, 0));
    lower.push(arc(th, h * 0.8, 0.004));
  }
  const westGround = arc(-half - 0.035, 0.0008, 0.002);
  const eastGround = arc(half + 0.035, 0.0008, 0.002);
  const struts: { points: THREE.Vector3[]; born: number }[] = [
    { points: [westGround, upper[0] as THREE.Vector3], born: 0 },
    { points: [westGround, lower[0] as THREE.Vector3], born: 0 },
    { points: [eastGround, upper[40] as THREE.Vector3], born: 0.9 },
    { points: [eastGround, lower[40] as THREE.Vector3], born: 0.9 },
  ];
  for (let k = 4; k < 40; k += 4) {
    const th = -half + (2 * half * k) / 40;
    struts.push({ points: [arc(th, 0.0008, 0.002), upper[k] as THREE.Vector3], born: k / 40 });
  }
  const frame = makeRibbons(
    ctx,
    [{ points: upper, born: 0 }, { points: lower, born: 0 }, ...struts.map((x) => ({ ...x }))],
    { colour: "#cfe0ff", pulse: ctx.colour, width: 1.5, pulses: 6, speed: 0.5, base: 0.7 },
  );
  root.add(frame.mesh);
  // The rotor: an iron belt racing round the loop, shown as a stream along the top and back.
  const bendFor = (hh: number) => n.clone().multiplyScalar(2 * (1 + hh) * (1 - Math.cos(half)));
  const rotorTop = makeFlow(ctx, {
    count: 700,
    colour: "#9fe8ff",
    colourB: "#e8fbff",
    size: 0.0025,
    minPx: 1.2,
    maxPx: 3,
    rate: 0.4,
    width: 0,
    seed: 251,
    gain: 1.2,
  });
  rotorTop.from.copy(upper[0] as THREE.Vector3);
  rotorTop.to.copy(upper[40] as THREE.Vector3);
  rotorTop.bend.copy(bendFor(h));
  const rotorBack = makeFlow(ctx, {
    count: 500,
    colour: "#9fe8ff",
    size: 0.0022,
    minPx: 1.2,
    maxPx: 3,
    rate: 0.4,
    width: 0,
    seed: 253,
    gain: 0.9,
  });
  rotorBack.from.copy(lower[40] as THREE.Vector3);
  rotorBack.to.copy(lower[0] as THREE.Vector3);
  rotorBack.bend.copy(bendFor(h * 0.8));
  root.add(rotorTop.points, rotorBack.points);
  // Vehicles ride the top, speeding up, and leave from its east end for orbit.
  const packets = 2 + Math.round(cadence * 8);
  const riders = makeFlow(ctx, {
    count: packets * 30,
    colour: "#fff1d0",
    colourB: ctx.colour,
    size: 0.004,
    minPx: 2.5,
    maxPx: 8,
    rate: 0.08,
    width: 0,
    seed: 255,
    accel: 2.2,
    packets,
    gain: 2,
  });
  riders.from.copy(upper[0] as THREE.Vector3).addScaledVector(n, 0.002);
  riders.to.copy(upper[40] as THREE.Vector3).addScaledVector(n, 0.002);
  riders.bend.copy(bendFor(h));
  const out = makeFlow(ctx, {
    count: 600,
    colour: "#fff1d0",
    colourB: ctx.colour,
    size: 0.006,
    minPx: 1.5,
    maxPx: 5,
    rate: 0.05,
    width: 0.05,
    fan: 1,
    seed: 257,
    packets: Math.round(packets * 2),
    gain: 1.6,
  });
  const exit = upper[40] as THREE.Vector3;
  const fwd = e
    .clone()
    .multiplyScalar(Math.cos(half))
    .addScaledVector(n, -Math.sin(half))
    .normalize();
  out.from.copy(exit);
  out.to.copy(exit).addScaledVector(fwd, 1.5).addScaledVector(exit.clone().normalize(), 0.6);
  out.bend.copy(exit.clone().normalize()).multiplyScalar(-0.1);
  root.add(riders.points, out.points);
  const west = upper[0] as THREE.Vector3;
  const shots = [
    shot(
      0,
      0.2,
      north.clone().multiplyScalar(0.55).addScaledVector(n, 0.7).addScaledVector(e, -0.35),
      west.clone().multiplyScalar(0.995),
    ),
    shot(
      0.45,
      0.5,
      north.clone().multiplyScalar(0.85).addScaledVector(n, 0.45).addScaledVector(e, -0.1),
      n.clone().multiplyScalar(1.02),
    ),
    shot(
      1,
      1.5,
      north.clone().multiplyScalar(0.75).addScaledVector(n, 0.5).addScaledVector(e, 0.3),
      n.clone().multiplyScalar(1.0).addScaledVector(e, 0.25),
    ),
  ];
  return {
    shots,
    update(time, p, px) {
      frame.built.value = mix(0.12, 1.02, ramp(p, 0, 0.5));
      frame.update(time);
      const done = ramp(p, 0.3, 0.55);
      rotorTop.on.value = rotorBack.on.value = done;
      riders.on.value = out.on.value = ramp(p, 0.5, 0.7);
      for (const f of [rotorTop, rotorBack, riders, out]) f.update(time, px);
    },
    dispose() {
      frame.dispose();
      for (const f of [rotorTop, rotorBack, riders, out]) f.dispose();
    },
  };
}

// --- Beamed sails -------------------------------------------------------------------------------

function sail(env: LaunchEnv): Rig {
  const { ctx, s, m, root, n, e, north, cadence } = env;
  const T = ctx.three;
  const count = 1 + Math.round(cadence * 7);
  const home = n.clone().multiplyScalar(1.35);
  const station = makeStation(ctx, s, m);
  station.position.copy(home);
  station.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
  station.scale.setScalar(0.06);
  root.add(station);
  const way = e
    .clone()
    .multiplyScalar(0.75)
    .addScaledVector(n, 0.55)
    .addScaledVector(north, 0.2)
    .normalize();
  const goal = home.clone().addScaledVector(way, 40);
  const sails = Array.from({ length: count }, () => {
    const c = makeCollector(ctx, s, m);
    c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), way.clone().negate());
    root.add(c);
    return c;
  });
  const beams = makeRibbons(
    ctx,
    sails.map((_, i) => ({ points: [home.clone(), home.clone()], born: i / count, seed: i * 0.3 })),
    { colour: ctx.colour, pulse: "#ffffff", width: 2.2, pulses: 6, speed: -1.2, base: 0.45 },
  );
  root.add(beams.mesh);
  const glows = makeDots(ctx, {
    positions: new Float32Array(count * 3),
    born: sails.map((_, i) => i / count),
    colour: "#ffffff",
    colourB: ctx.colour,
    size: 0.05,
    minPx: 3,
    maxPx: 16,
    gain: 1.6,
    twinkle: 0.2,
  });
  root.add(glows.points);
  const gAttr = glows.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = makeDots(ctx, {
    positions: [goal.x, goal.y, goal.z],
    colour: "#ff8a5a",
    size: 0.8,
    minPx: 4,
    maxPx: 10,
    gain: 1.4,
  });
  root.add(target.points);
  const emitter = makeDots(ctx, {
    positions: [home.x, home.y, home.z],
    colour: ctx.colour,
    size: 0.02,
    minPx: 4,
    maxPx: 18,
    gain: 2.4,
  });
  root.add(emitter.points);
  const shots = [
    shot(
      0,
      0.22,
      north.clone().multiplyScalar(0.8).addScaledVector(e, -0.45).addScaledVector(n, 0.3),
      home.clone().addScaledVector(way, 0.06),
    ),
    shot(
      0.45,
      1.4,
      north.clone().multiplyScalar(0.85).addScaledVector(e, -0.2).addScaledVector(n, 0.4),
      home.clone().addScaledVector(way, 0.6),
    ),
    shot(
      1,
      6.5,
      north.clone().multiplyScalar(0.8).addScaledVector(e, 0.1).addScaledVector(n, 0.55),
      home.clone().addScaledVector(way, 3),
    ),
  ];
  const pos = new T.Vector3();
  return {
    shots,
    update(time, p, px) {
      const shown = Math.max(1, Math.round(count * grow(p, 1 / count)));
      sails.forEach((c, i) => {
        // Each sail accelerates out along the beam; the first starts close to home.
        const ph = (time * 0.012 + i / count + 0.02) % 1;
        const d = 0.06 + ph ** 1.6 * 9;
        pos
          .copy(home)
          .addScaledVector(way, d)
          .addScaledVector(north, (i % 3) * 0.04 * d - 0.04 * d);
        c.position.copy(pos);
        c.scale.setScalar(0.04 + 0.01 * d);
        c.visible = i < shown;
        beams.set(i, [home, pos.clone()]);
        gAttr.setXYZ(i, pos.x, pos.y, pos.z);
      });
      gAttr.needsUpdate = true;
      beams.built.value = shown / count;
      glows.built.value = shown / count;
      beams.update(time);
      glows.update(time, px);
      target.update(time, px);
      emitter.update(time, px);
    },
    dispose() {
      beams.dispose();
      glows.dispose();
      target.dispose();
      emitter.dispose();
    },
  };
}

export const LAUNCHERS: Record<Method, (env: LaunchEnv) => Rig> = {
  rocket,
  "mass-driver": massDriver,
  tether,
  elevator,
  loop,
  sail,
};
