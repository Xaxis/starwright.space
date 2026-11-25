/**
 * A field of one unit repeated: panels in a desert, tanks on a plain, condensers on a glacier,
 * towers in a city. The story starts close on one unit, then rows spread across the ground, block
 * by block, the camera rising as they go until the whole field shows to the horizon. Each copy
 * glows in the record's colour while it goes up and its lights come on once it is finished.
 *
 * Params: unit (what is repeated), count (how many at the end, up to 20,000), terrain.
 * Units are metres; the field sits on y = 0, panels facing +z, toward the low Sun.
 */

import { glowTexture } from "../lib/bodies.ts";
import { rng } from "../lib/particles.ts";
import { makeGlows, makeLinks } from "../lib/systems/glow.ts";
import { makeClock, makeCrowd } from "../lib/systems/grow.ts";
import {
  crowd,
  logMix,
  mix,
  orbitView,
  ramp,
  storyBeats,
  viewDistance,
} from "../lib/systems/kit.ts";
import { lightFromSky, makeGroundSky, makeSkyEarth, SKIES } from "../lib/systems/sky.ts";
import { makeTerrain, type TerrainName } from "../lib/systems/terrain.ts";
import { fieldUnit, makeLooks, shapes, type UnitName } from "../lib/systems/units.ts";
import type { Kind, View } from "../types.ts";

const UNITS: UnitName[] = [
  "panel",
  "mirror",
  "turbine",
  "greenhouse",
  "tank",
  "fab",
  "rack",
  "house",
  "tower",
  "well",
  "farm",
  "kelp",
];
const TERRAINS: TerrainName[] = ["desert", "sea", "plain", "ice", "regolith", "city"];

const field: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera, renderer } = ctx;
  const unitName = UNITS.includes(ctx.params.unit as UnitName)
    ? (ctx.params.unit as UnitName)
    : "panel";
  const terrainName = TERRAINS.includes(ctx.params.terrain as TerrainName)
    ? (ctx.params.terrain as TerrainName)
    : "desert";
  const count = Math.max(1, Math.min(20000, Math.round(Number(ctx.params.count ?? 2000)) || 2000));
  // A software renderer draws fewer copies; the field keeps its shape.
  const n = Math.max(1, Math.min(count, Math.round(20000 * ctx.detail)));
  const unit = fieldUnit(ctx, unitName, ctx.colour);
  const big = Math.max(...unit.size);
  const wet = terrainName === "sea";

  // --- Where each copy stands, in the order they are built ---------------------------------------
  const rand = rng(7 + n);
  /** Each copy's place, and for rows its block (i, j) and row, which its cable follows. */
  type Spot = {
    x: number;
    z: number;
    yaw: number;
    key: number;
    i?: number;
    j?: number;
    row?: number;
  };
  const spots: Spot[] = [];
  if (unit.layout === "rings") {
    // Rings around a centre: heliostats around their tower, houses around the kit that powers them.
    const r0 = unitName === "mirror" ? Math.max(40, Math.sqrt(n) * 1.2) : 26;
    let ring = 0;
    while (spots.length < n) {
      const r = r0 + ring * unit.spacing[1];
      const around = Math.max(6, Math.floor((2 * Math.PI * r) / unit.spacing[0]));
      const start = Math.PI / 2 + ring * 0.37;
      for (let k = 0; k < around && spots.length < n; k++) {
        // Fill each ring from the front, both ways at once.
        const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        const a = start + (step / around) * Math.PI * 2;
        spots.push({
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          yaw: unitName === "house" ? -a - Math.PI / 2 : 0,
          key: ring + Math.abs(step) / around,
        });
      }
      ring++;
    }
  } else {
    const [bx, bz] = unit.block;
    const [sx, sz] = unit.spacing;
    const per = bx * bz;
    const W = bx * sx + unit.road;
    const D = bz * sz + unit.road;
    const blocks = Math.ceil(n / per);
    const side = Math.ceil(Math.sqrt(blocks)) + 3;
    const cand: { i: number; j: number; key: number }[] = [];
    for (let i = -side; i <= side; i++) {
      for (let j = -side; j <= side; j++) {
        const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        cand.push({ i, j, key: Math.hypot(i * W, j * D * 1.25) * (1 + 0.3 * (h - Math.floor(h))) });
      }
    }
    cand.sort((a, b) => a.key - b.key);
    const midC = (bx - 1) / 2;
    const midR = (bz - 1) / 2;
    const within: { c: number; r: number; k: number }[] = [];
    for (let r = 0; r < bz; r++)
      for (let c = 0; c < bx; c++)
        within.push({ c, r, k: Math.abs(r - midR) * bx * 2 + Math.abs(c - midC) });
    within.sort((a, b) => a.k - b.k);
    for (let b = 0; b < blocks; b++) {
      const blk = cand[b] as { i: number; j: number };
      for (let w = 0; w < per; w++) {
        const cell = within[w] as { c: number; r: number };
        spots.push({
          x: blk.i * W + (cell.c - midC) * sx,
          z: blk.j * D + (cell.r - midR) * sz,
          yaw: 0,
          // Neighbouring blocks go up together, as crews would build them.
          key: b + 2.5 * (w / per),
          i: blk.i,
          j: blk.j,
          row: b * bz + cell.r,
        });
      }
    }
  }
  spots.sort((a, b) => a.key - b.key);
  spots.length = n;

  const matrices = new Float32Array(n * 16);
  const aim = new Float32Array(n * 16);
  const grow = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const at = new Float32Array(n * 3);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const v = new T.Vector3();
  const one = new T.Vector3(1, 1, 1);
  const upY = new T.Vector3(0, 1, 0);
  let reach = 0;
  for (let i = 0; i < n; i++) {
    const s = spots[i] as { x: number; z: number; yaw: number };
    q.setFromAxisAngle(upY, s.yaw);
    m.compose(v.set(s.x, 0, s.z), q, one);
    m.toArray(matrices, i * 16);
    grow[i * 2] = i / n;
    grow[i * 2 + 1] = (0.15 * i + 1) / n;
    seed[i] = rand();
    at[i * 3] = s.x;
    at[i * 3 + 2] = s.z;
    reach = Math.max(reach, Math.hypot(s.x, s.z));
  }
  const frame = crowd(at);

  // Cables: one along each row from its middle out to both ends, drawn as the row goes up, and
  // trunks along the roads from each block back toward the centre; pulses run along them all.
  const cable = {
    from: [] as number[],
    to: [] as number[],
    link: [] as number[],
    born: [] as number[],
    segs: [] as number[],
  };
  const addCable = (
    a: number[],
    b: number[],
    start: number,
    length: number,
    weight: number,
    segs: number,
  ) => {
    cable.from.push(...a);
    cable.to.push(...b);
    cable.link.push(0, rand(), weight);
    cable.born.push(start, Math.max(length, 1e-4));
    cable.segs.push(segs);
  };
  const [cy, cz] = unit.cable;
  if (unit.layout === "rows") {
    const rows = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = (spots[i] as Spot).row as number;
      const list = rows.get(r);
      if (list) list.push(i);
      else rows.set(r, [i]);
    }
    const half = unit.spacing[0] * 0.5;
    for (const list of rows.values()) {
      const first = list[0] as number;
      const s0 = spots[first] as Spot;
      const xs = list.map((i) => (spots[i] as Spot).x);
      const lo = Math.min(...xs) - half * 0.8;
      const hi = Math.max(...xs) + half * 0.8;
      const start = grow[first * 2] as number;
      const end = Math.max(
        ...list.map((i) => (grow[i * 2] as number) + (grow[i * 2 + 1] as number)),
      );
      for (const x of [lo, hi])
        addCable([s0.x, cy, s0.z + cz], [x, cy, s0.z + cz], start, end - start, 0.55, 8);
    }
    const W = unit.block[0] * unit.spacing[0] + unit.road;
    const D = unit.block[1] * unit.spacing[1] + unit.road;
    const blocks = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const sp = spots[i] as Spot;
      const k = `${sp.i},${sp.j}`;
      if (!blocks.has(k)) blocks.set(k, i);
    }
    for (const [k, i] of blocks) {
      const [bi, bj] = k.split(",").map(Number) as [number, number];
      if (bi === 0 && bj === 0) continue;
      const [pi, pj] =
        Math.abs(bi) >= Math.abs(bj) ? [bi - Math.sign(bi), bj] : [bi, bj - Math.sign(bj)];
      const port = (a: number, b: number) => [a * W - W / 2, 0.4, b * D - D / 2];
      addCable(
        port(bi, bj),
        port(pi, pj),
        grow[i * 2] as number,
        (grow[i * 2 + 1] as number) * 3,
        1,
        12,
      );
    }
  } else if (unitName === "house") {
    for (let i = 0; i < n; i++) {
      const sp = spots[i] as Spot;
      const end = (grow[i * 2] as number) + (grow[i * 2 + 1] as number);
      addCable(
        [0, 0.3, 0],
        [sp.x, 0.3, sp.z],
        end - (grow[i * 2 + 1] as number) * 0.8,
        (grow[i * 2 + 1] as number) * 0.8,
        0.8,
        10,
      );
    }
  }
  /** Copies standing at progress p: one at the start, the whole field (and a little) at the end. */
  const standing = (p: number) => Math.exp(p * Math.log(n * 1.2));

  // --- Sky, light, ground ------------------------------------------------------------------------
  const preset = SKIES[terrainName] ?? (SKIES.desert as (typeof SKIES)["desert"]);
  const sky = makeGroundSky(ctx, preset);
  scene.add(sky.mesh);
  const light = lightFromSky(ctx, sky);
  const ground = makeTerrain(ctx, terrainName, sky, reach * 1.15 + big * 3);
  scene.add(ground.mesh);
  const azStart = Math.PI / 2 - 0.55;
  const azEnd = Math.PI / 2 + 0.35;
  const skyEarth =
    terrainName === "regolith" ? makeSkyEarth(ctx, sky, azStart + Math.PI + 0.25, 0.07) : undefined;
  if (skyEarth) scene.add(skyEarth.group);

  // --- The copies -------------------------------------------------------------------------------
  const clock = makeClock(ctx);
  const flatUnit = unitName === "panel" || unitName === "mirror" || unitName === "kelp";
  const looks = makeLooks(ctx, clock, {
    bob: wet ? 0.18 : undefined,
    grow: flatUnit ? "pop" : "print",
    height: unit.size[2],
  });
  const parts = unit.parts.filter((p) => !(wet && p.look === "shadow"));
  if (unitName === "mirror") {
    // Each heliostat turns its mirror to send the Sun's light to the receiver on the tower.
    const towerH = Math.max(40, reach * 0.22);
    const recv = new T.Vector3(0, towerH, 0);
    const pivot = new T.Vector3();
    const nrm = new T.Vector3();
    for (let i = 0; i < n; i++) {
      pivot.set(at[i * 3] as number, 3.6, at[i * 3 + 2] as number);
      nrm.copy(recv).sub(pivot).normalize().add(sky.sunDir).normalize();
      q.setFromUnitVectors(upY, nrm);
      m.compose(pivot, q, one);
      m.toArray(aim, i * 16);
    }
  }
  const copies = makeCrowd(ctx, parts, looks.looks, matrices, grow, seed, aim);
  scene.add(copies.group);
  const accent = new T.Color(ctx.colour);
  const cables =
    cable.segs.length > 0
      ? makeLinks(
          ctx,
          {
            from: new Float32Array(cable.from),
            to: new Float32Array(cable.to),
            link: new Float32Array(cable.link),
            born: new Float32Array(cable.born),
            segments: cable.segs,
          },
          {
            line: accent.clone().multiplyScalar(0.5),
            pulse: accent.clone().multiplyScalar(1.4),
            pulses: 1,
            speed: 0.35,
            gain: 0.8,
          },
        )
      : undefined;
  if (cables) scene.add(cables.lines);

  // Each copy's lights, as points that keep a few pixels at any distance.
  const lights = unit.lights;
  const lp = new Float32Array(n * lights.length * 3);
  const lg = new Float32Array(n * lights.length * 2);
  {
    let k = 0;
    for (let i = 0; i < n; i++) {
      m.fromArray(matrices, i * 16);
      for (const l of lights) {
        v.set(l[0], l[1], l[2]).applyMatrix4(m);
        lp.set([v.x, v.y, v.z], k * 3);
        lg[k * 2] = grow[i * 2] as number;
        lg[k * 2 + 1] = grow[i * 2 + 1] as number;
        k++;
      }
    }
  }
  const glows = makeGlows(ctx, clock, {
    position: lp,
    grow: lg,
    colour: new T.Color(unit.light).multiplyScalar(unitName === "turbine" ? 1.6 : 1.1),
    size: unitName === "turbine" ? 8 : unitName === "fab" ? 4 : unitName === "panel" ? 0.5 : 1.6,
    min: 1.6,
    max: 26,
    twinkle: unitName === "turbine" ? 0.9 : 0.35,
  });
  scene.add(glows.points);

  // What a field gathers into: a tower whose receiver burns with the heliostats' light, or the
  // small power kit at the heart of a village.
  const s = shapes(T);
  const extras: { geo: { dispose(): void }; mat: { dispose(): void } }[] = [];
  let receiver:
    | { mat: InstanceType<typeof T.MeshStandardMaterial>; sprite: InstanceType<typeof T.Sprite> }
    | undefined;
  let beams: ReturnType<typeof makeLinks> | undefined;
  if (unitName === "mirror") {
    const towerH = Math.max(40, reach * 0.22);
    const towerGeo = s.merge([
      s.cyl(2.2, 4, towerH, 0, towerH / 2, 0, 16),
      s.cyl(4.6, 4.6, 1.2, 0, towerH - 6, 0, 16),
    ]);
    const towerMat = new T.MeshStandardMaterial({
      color: "#cfcac0",
      roughness: 0.6,
      metalness: 0.1,
    });
    scene.add(new T.Mesh(towerGeo, towerMat));
    const recvGeo = s.cyl(3.2, 3.2, 9, 0, towerH + 1, 0, 16);
    const recvMat = new T.MeshStandardMaterial({
      color: "#2a1a10",
      emissive: "#ffd28a",
      emissiveIntensity: 0,
    });
    scene.add(new T.Mesh(recvGeo, recvMat));
    const spriteMat = new T.SpriteMaterial({
      map: glowTexture(ctx),
      color: new T.Color("#ffcf7a").multiplyScalar(2),
      blending: T.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    });
    const sprite = new T.Sprite(spriteMat);
    sprite.position.set(0, towerH + 1, 0);
    scene.add(sprite);
    receiver = { mat: recvMat, sprite };
    extras.push(
      { geo: towerGeo, mat: towerMat },
      { geo: recvGeo, mat: recvMat },
      { geo: { dispose() {} }, mat: spriteMat },
    );
    // A share of the mirrors' beams, drawn: light running in to the receiver.
    const shown = Math.min(n, Math.round(600 * ctx.detail) + 20);
    const from = new Float32Array(shown * 3);
    const to = new Float32Array(shown * 3);
    const link = new Float32Array(shown * 3);
    const born = new Float32Array(shown * 2);
    for (let k = 0; k < shown; k++) {
      const i = Math.floor((k / shown) * n);
      from.set([at[i * 3] as number, 3.7, at[i * 3 + 2] as number], k * 3);
      to.set([0, towerH + 1, 0], k * 3);
      link.set([0, rand(), 0.15], k * 3);
      born.set(
        [
          (grow[i * 2] as number) + (grow[i * 2 + 1] as number),
          (grow[i * 2 + 1] as number) * 0.6 + 0.002,
        ],
        k * 2,
      );
    }
    beams = makeLinks(
      ctx,
      { from, to, link, born, segments: new Uint8Array(shown).fill(6) },
      {
        line: new T.Color("#ffd9a0").multiplyScalar(0.25),
        pulse: new T.Color("#fff0c8"),
        pulses: 0.9,
        speed: 0.8,
        gain: 0.22,
      },
    );
    scene.add(beams.lines);
  }
  if (unitName === "house") {
    const kitGeo = s.merge([
      s.box(6, 2.6, 2.5, 0, 1.3, 0),
      s.box(0.2, 2.2, 0.2, -2, 1.1, 3.5),
      s.box(0.2, 2.2, 0.2, 2, 1.1, 3.5),
    ]);
    const kitMat = new T.MeshStandardMaterial({ color: "#d7d2c8", roughness: 0.5 });
    scene.add(new T.Mesh(kitGeo, kitMat));
    const panGeo = s.box(5, 0.06, 2.4, 0, 2.4, 3.5, 0.5);
    const panMat = new T.MeshStandardMaterial({
      color: "#14233f",
      roughness: 0.18,
      metalness: 0.75,
    });
    scene.add(new T.Mesh(panGeo, panMat));
    const coreGeo = s.box(5.4, 0.3, 0.05, 0, 1.7, 1.27);
    const coreMat = new T.MeshStandardMaterial({
      color: "#111",
      emissive: ctx.colour,
      emissiveIntensity: 4,
    });
    scene.add(new T.Mesh(coreGeo, coreMat));
    extras.push(
      { geo: kitGeo, mat: kitMat },
      { geo: panGeo, mat: panMat },
      { geo: coreGeo, mat: coreMat },
    );
  }

  // --- The camera: close on the first copy, rising until the whole field shows ----------------
  const pose = (p: number): View => {
    const k = Math.min(n, standing(p));
    const c = frame(k);
    const R = Math.max(big * 0.6, c.radius * 1.5 + big * 0.5);
    const d = Math.max(big * 2.4, R * 2.6);
    const el = mix(0.24, 0.6, ramp(p, 0, 0.95) ** 0.8);
    const az = mix(azStart, azEnd, ramp(p, 0, 1));
    // Look a little above the field, so the horizon and its sky show at the top.
    const lift = unit.size[2] * 0.4 * (1 - ramp(p, 0, 0.35)) + R * 0.32 * ramp(p, 0.1, 0.6);
    const view = orbitView([c.centre[0], 0, c.centre[2]], d, az, el, 0.2, 5);
    view.target = [c.centre[0], lift, c.centre[2]];
    return view;
  };

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      renderer.getSize(size);
      const px = size.y * renderer.getPixelRatio();
      clock.uBuilt.value = standing(p) / n;
      clock.uTime.value = time;
      sky.update(camera);
      light.update(viewDistance(camera));
      ground.update(time, camera);
      skyEarth?.update(time, camera);
      glows.update(px);
      if (receiver) {
        const lit = Math.min(1, standing(p) / n);
        receiver.mat.emissiveIntensity = 1 + 7 * lit;
        receiver.sprite.scale.setScalar(20 + logMix(1, 3, lit) * 25 * lit);
        receiver.sprite.material.opacity = 0.3 + 0.7 * lit;
      }
      if (cables) {
        cables.uniforms.uClock.value = standing(p) / n;
        cables.update(time);
      }
      if (beams) {
        beams.uniforms.uClock.value = standing(p) / n;
        beams.update(time);
      }
    },
    dispose() {
      sky.dispose();
      light.dispose();
      ground.dispose();
      skyEarth?.dispose();
      copies.dispose();
      for (const part of unit.parts) part.geo.dispose();
      looks.dispose();
      glows.dispose();
      beams?.dispose();
      cables?.dispose();
      for (const e of extras) {
        e.geo.dispose();
        e.mat.dispose();
      }
    },
  };
};

export default field;
