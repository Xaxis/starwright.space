/**
 * A network: people, places, institutions or worlds as points of light, linking up. The story
 * opens on a few nodes joining one another, then clusters light up and reach for each other until
 * a dense web carries pulses everywhere. It is laid on Earth's night side (globe), on a dark map
 * of a continent (flat), or across the inner solar system, worlds as clusters with links routed
 * around the Sun (system).
 *
 * Params: nodes (up to 5,000), clusters (up to 40), links (0 to 1: how densely nodes and clusters
 * connect beyond the minimum that joins them), pulses (0 to 1: how much traffic runs), shape.
 */
import type * as THREE from "three";
import { makeEarth, makeRock, makeSky, makeSun } from "../lib/bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import { makeOrbiters, makeRing, rng } from "../lib/particles.ts";
import { makeFlow, makeGlows, makeLinks } from "../lib/systems/glow.ts";
import { makeClock } from "../lib/systems/grow.ts";
import { logMix, mix, orbitView, ramp, storyBeats, type V3 } from "../lib/systems/kit.ts";
import type { Kind, View } from "../types.ts";

type Shape = "globe" | "flat" | "system";

/** Cities the globe's clusters gather around, as longitude and latitude. */
const CITIES: [number, number][] = [
  [36.8, -1.3],
  [3.4, 6.5],
  [31.2, 30.0],
  [38.7, 9.0],
  [28.0, -26.2],
  [15.3, -4.3],
  [-0.2, 5.6],
  [-17.4, 14.7],
  [72.9, 19.1],
  [77.2, 28.6],
  [90.4, 23.8],
  [88.4, 22.6],
  [74.3, 31.5],
  [67.0, 24.9],
  [46.7, 24.7],
  [51.4, 35.7],
  [29.0, 41.0],
  [37.6, 55.8],
  [-0.1, 51.5],
  [2.35, 48.9],
  [13.4, 52.5],
  [-3.7, 40.4],
  [100.5, 13.8],
  [103.8, 1.35],
  [106.8, -6.2],
  [106.7, 10.8],
  [121.0, 14.6],
  [121.5, 31.2],
  [116.4, 39.9],
  [127.0, 37.6],
  [139.7, 35.7],
  [151.2, -33.9],
  [-46.6, -23.5],
  [-58.4, -34.6],
  [-70.7, -33.4],
  [-77.0, -12.0],
  [-74.1, 4.7],
  [-99.1, 19.4],
  [-118.2, 34.0],
  [-87.6, 41.9],
  [-74.0, 40.7],
  [-79.4, 43.7],
];

const network: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera, renderer } = ctx;
  const shape: Shape = (["globe", "flat", "system"] as const).includes(ctx.params.shape as Shape)
    ? (ctx.params.shape as Shape)
    : "globe";
  const want = Math.max(4, Math.min(5000, Math.round(Number(ctx.params.nodes ?? 300)) || 300));
  const n = Math.max(4, Math.min(want, Math.round(5000 * ctx.detail)));
  const C = Math.max(1, Math.min(40, n, Math.round(Number(ctx.params.clusters ?? 6)) || 6));
  const share = (x: unknown, d: number) => Math.max(0, Math.min(1, Number(x ?? d)));
  const linkShare = share(ctx.params.links, 0.4);
  const pulseShare = share(ctx.params.pulses, 0.6);
  const rand = rng(97 + n + C);
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const clock = makeClock(ctx);
  const accent = new T.Color(ctx.colour);

  // --- Clusters: a few large ones and many small, revealed one after another ---------------------
  const weights = Array.from({ length: C }, (_, c) => 1 / (c + 1) ** 0.75);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.max(1, Math.floor((w / wsum) * n)));
  let spare = n - sizes.reduce((a, b) => a + b, 0);
  for (let c = 0; spare > 0; c = (c + 1) % C, spare--) sizes[c] = (sizes[c] as number) + 1;
  const maxSize = Math.max(...sizes);
  /** When each cluster starts, on the story's clock (0 to about 1). */
  const tStart = sizes.map((_, c) => (c === 0 ? 0 : 0.1 + 0.6 * (c / Math.max(1, C - 1)) ** 0.85));

  // Where each cluster sits, and how widely its nodes spread.
  const centres: THREE.Vector3[] = [];
  const spreads: number[] = [];
  const sysBodies: { name: string; at: THREE.Vector3; r: number }[] = [];
  const auScene = (a: number) => Math.sqrt(a) * 4;
  const ll = (lon: number, lat: number) => {
    const a = (lon * Math.PI) / 180;
    const b = (lat * Math.PI) / 180;
    return new T.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), -Math.cos(b) * Math.sin(a));
  };
  if (shape === "globe") {
    // Spread the clusters over the world (each next city the farthest from those chosen), then
    // light them in order of distance from the first, so the web spreads outward from it.
    const cities = CITIES.map((c) => ll(c[0], c[1]));
    const chosen = [cities[0] as THREE.Vector3];
    const left = cities.slice(1);
    while (chosen.length < Math.min(C, cities.length)) {
      let bi = 0;
      let bd = -1;
      left.forEach((v, k) => {
        const d = Math.min(...chosen.map((q) => q.angleTo(v))) + rand() * 0.15;
        if (d > bd) {
          bd = d;
          bi = k;
        }
      });
      chosen.push(left.splice(bi, 1)[0] as THREE.Vector3);
    }
    const start = chosen[0] as THREE.Vector3;
    const order = [start, ...chosen.slice(1).sort((a, b) => a.angleTo(start) - b.angleTo(start))];
    for (let c = 0; c < C; c++) {
      const base = order[c % order.length] as THREE.Vector3;
      // More clusters than cities: put the extras near a city, offset a little.
      const v =
        c < order.length
          ? base.clone()
          : base
              .clone()
              .add(new T.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.08))
              .normalize();
      centres.push(v);
      spreads.push(0.025 + 0.06 * Math.sqrt((sizes[c] as number) / maxSize));
    }
  } else if (shape === "flat") {
    const pts: THREE.Vector3[] = [new T.Vector3(0.12, 0, 0.05)];
    let tries = 0;
    while (pts.length < C && tries < 5000) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 1.05;
      const p = new T.Vector3(Math.cos(a) * r * 1.25, 0, Math.sin(a) * r * 0.85);
      const gap = 0.5 / Math.sqrt(C);
      if (pts.every((q) => q.distanceTo(p) > gap)) pts.push(p);
    }
    while (pts.length < C) pts.push(new T.Vector3((rand() - 0.5) * 2, 0, (rand() - 0.5) * 1.6));
    const sorted = [
      pts[0] as THREE.Vector3,
      ...pts.slice(1).sort((a, b) => a.length() - b.length()),
    ];
    for (let c = 0; c < C; c++) {
      centres.push(sorted[c] as THREE.Vector3);
      spreads.push(0.03 + 0.08 * Math.sqrt((sizes[c] as number) / maxSize));
    }
  } else {
    // The inner solar system, distances squeezed (the square root of AU) so it fits one view.
    const body = (name: string, a: number, angle: number, r: number) => {
      const b = {
        name,
        at: new T.Vector3(Math.cos(angle) * auScene(a), 0, Math.sin(angle) * auScene(a)),
        r,
      };
      sysBodies.push(b);
      return b;
    };
    const earth = body("earth", 1, 0.5, 0.16);
    const moon = {
      name: "moon",
      at: earth.at.clone().add(new T.Vector3(0.42, 0.05, -0.2)),
      r: 0.05,
    };
    sysBodies.push(moon);
    const anchors = [
      earth,
      moon,
      body("mars", 1.52, 1.5, 0.1),
      body("ceres", 2.77, 2.4, 0.04),
      body("venus", 0.72, -0.4, 0.15),
      body("mercury", 0.39, -1.6, 0.07),
    ];
    for (let c = 0; c < C; c++) {
      let at: THREE.Vector3;
      let r: number;
      if (c < anchors.length) {
        at = (anchors[c] as { at: THREE.Vector3 }).at;
        r = (anchors[c] as { r: number }).r;
      } else {
        // Habitats and outposts: on the worlds' orbits and through the belt.
        const a = [1, 1.52, 0.72, 2.2, 2.6, 3.0, 1][c % 7] as number;
        const ang = rand() * Math.PI * 2;
        at = new T.Vector3(
          Math.cos(ang) * auScene(a),
          (rand() - 0.5) * 0.3,
          Math.sin(ang) * auScene(a),
        );
        r = 0.03;
      }
      centres.push(at);
      spreads.push(r * 1.8 + 0.12 * Math.sqrt((sizes[c] as number) / maxSize));
    }
  }

  // --- Nodes --------------------------------------------------------------------------------
  const pos = new Float32Array(n * 3);
  const born = new Float32Array(n);
  const owner = new Int32Array(n);
  const first = new Int32Array(C);
  const tmp = new T.Vector3();
  const e1 = new T.Vector3();
  const e2 = new T.Vector3();
  {
    let i = 0;
    for (let c = 0; c < C; c++) {
      first[c] = i;
      const ctr = centres[c] as THREE.Vector3;
      const size = sizes[c] as number;
      const sp = spreads[c] as number;
      for (let j = 0; j < size; j++, i++) {
        if (shape === "globe") {
          e1.set(0, 1, 0).cross(ctr).normalize();
          e2.copy(ctr).cross(e1).normalize();
          const k = j === 0 ? 0 : 1;
          tmp
            .copy(ctr)
            .addScaledVector(e1, gauss() * sp * k)
            .addScaledVector(e2, gauss() * sp * k)
            .normalize()
            .multiplyScalar(1.004);
        } else if (shape === "flat") {
          const k = j === 0 ? 0 : 1;
          tmp.set(ctr.x + gauss() * sp * k, 0.004, ctr.z + gauss() * sp * k * 0.8);
        } else {
          const body = sysBodies.find((b) => b.at === ctr);
          const r0 = body ? body.r * 1.3 : 0.02;
          const a = rand() * Math.PI * 2;
          const rr = j === 0 ? 0 : r0 + Math.abs(gauss()) * sp;
          tmp.set(ctr.x + Math.cos(a) * rr, ctr.y + gauss() * rr * 0.25, ctr.z + Math.sin(a) * rr);
        }
        pos.set([tmp.x, tmp.y, tmp.z], i * 3);
        owner[i] = c;
        born[i] = c === 0 && j < 4 ? j * 0.004 : (tStart[c] as number) + 0.3 * (j / size) ** 0.9;
      }
    }
  }
  const nodeAt = (i: number) =>
    tmp.set(pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number);
  const dist = (a: number, b: number) =>
    Math.hypot(
      (pos[a * 3] as number) - (pos[b * 3] as number),
      (pos[a * 3 + 1] as number) - (pos[b * 3 + 1] as number),
      (pos[a * 3 + 2] as number) - (pos[b * 3 + 2] as number),
    );

  // --- Links: each node to its nearest earlier neighbour (so every cluster is one tree), extras
  // by the links share, and trunks joining each cluster to the nearest one already lit.
  type L = { a: number; b: number; w: number };
  const local: L[] = [];
  const trunk: L[] = [];
  for (let c = 0; c < C; c++) {
    const f = first[c] as number;
    const size = sizes[c] as number;
    for (let j = 1; j < size; j++) {
      const i = f + j;
      let best = f;
      let second = -1;
      let bd = Number.POSITIVE_INFINITY;
      let sd = Number.POSITIVE_INFINITY;
      // Large clusters: look among a window of recent nodes, enough to find a near one.
      const from = Math.max(f, i - 400);
      for (let k = from; k < i; k++) {
        const d = dist(i, k);
        if (d < bd) {
          sd = bd;
          second = best;
          bd = d;
          best = k;
        } else if (d < sd) {
          sd = d;
          second = k;
        }
      }
      local.push({ a: best, b: i, w: 0.55 });
      if (second >= 0 && second !== best && rand() < linkShare)
        local.push({ a: second, b: i, w: 0.4 });
      if (best !== f && rand() < linkShare * 0.35) local.push({ a: f, b: i, w: 0.7 });
    }
  }
  const hub = (c: number) => first[c] as number;
  for (let c = 1; c < C; c++) {
    const near = Array.from({ length: c }, (_, k) => k).sort(
      (x, y) =>
        (centres[x] as THREE.Vector3).distanceTo(centres[c] as THREE.Vector3) -
        (centres[y] as THREE.Vector3).distanceTo(centres[c] as THREE.Vector3),
    );
    trunk.push({ a: hub(near[0] as number), b: hub(c), w: 1 });
    for (let e = 1; e < Math.min(near.length, 4); e++) {
      if (rand() < linkShare * 0.8) trunk.push({ a: hub(near[e] as number), b: hub(c), w: 0.8 });
    }
  }

  const sphere = shape === "globe";
  const build = (list: L[], isTrunk: boolean) => {
    const m = list.length;
    const from = new Float32Array(m * 3);
    const to = new Float32Array(m * 3);
    const link = new Float32Array(m * 3);
    const when = new Float32Array(m * 2);
    const segs = new Uint8Array(m);
    list.forEach((l, k) => {
      from.set(nodeAt(l.a).toArray(), k * 3);
      to.set(nodeAt(l.b).toArray(), k * 3);
      const d = dist(l.a, l.b);
      const lift =
        shape === "globe"
          ? (isTrunk ? 0.04 : 0.002) + d * (isTrunk ? 0.22 : 0.12)
          : shape === "flat"
            ? d * (isTrunk ? 0.32 : 0.18)
            : d * (isTrunk ? 0.16 : 0.25);
      link.set([lift, rand(), l.w], k * 3);
      const start = Math.max(born[l.a] as number, born[l.b] as number) + 0.004;
      when.set([start, isTrunk ? 0.07 : 0.025], k * 2);
      segs[k] = isTrunk ? 28 : d > 0.08 ? 8 : 4;
    });
    return { from, to, link, born: when, segments: segs };
  };
  const localSpec = build(local, false);
  const trunkSpec = build(trunk, true);
  const localLinks = makeLinks(ctx, localSpec, {
    line: accent.clone().multiplyScalar(0.45),
    pulse: accent.clone().lerp(new T.Color("#ffffff"), 0.3).multiplyScalar(1.3),
    pulses: pulseShare,
    speed: 0.5,
    gain: 0.75,
    sphere,
  });
  // Trunks between worlds bow away from the Sun, as light would be relayed around it.
  const trunkLinks = makeLinks(ctx, trunkSpec, {
    line: accent.clone().lerp(new T.Color("#ffffff"), 0.2).multiplyScalar(0.55),
    pulse: new T.Color("#ffffff").lerp(accent, 0.3).multiplyScalar(1.5),
    pulses: pulseShare,
    speed: shape === "system" ? 0.12 : 0.3,
    gain: 0.9,
    sphere: sphere || shape === "system",
  });

  // Packets: bright points riding the trunks (and some local links), both ways.
  const packets = (() => {
    const from: number[] = [];
    const to: number[] = [];
    const flow: number[] = [];
    const win: number[] = [];
    const col: number[] = [];
    const scale = shape === "system" ? 0.03 : shape === "flat" ? 0.008 : 0.012;
    const hot = new T.Color("#ffffff").lerp(accent, 0.35).multiplyScalar(2.2);
    const add = (spec: typeof trunkSpec, k: number, count: number) => {
      for (let j = 0; j < count; j++) {
        const back = j % 2 === 1;
        const a = spec.from.subarray(k * 3, k * 3 + 3);
        const b = spec.to.subarray(k * 3, k * 3 + 3);
        from.push(...(back ? b : a));
        to.push(...(back ? a : b));
        flow.push(spec.link[k * 3] as number, rand(), 0.5 + rand(), scale);
        win.push((spec.born[k * 2] as number) + (spec.born[k * 2 + 1] as number), 9);
        col.push(hot.r, hot.g, hot.b);
      }
    };
    const perTrunk = 1 + Math.round(pulseShare * 4);
    for (let k = 0; k < trunk.length; k++) add(trunkSpec, k, perTrunk);
    for (let k = 0; k < local.length; k++) if (rand() < pulseShare * 0.3) add(localSpec, k, 1);
    return makeFlow(
      ctx,
      {
        from: new Float32Array(from),
        to: new Float32Array(to),
        flow: new Float32Array(flow),
        window: new Float32Array(win),
        colour: new Float32Array(col),
      },
      {
        rate: shape === "system" ? 0.06 : 0.16,
        sphere: sphere || shape === "system",
        min: 1.5,
        max: 10,
      },
    );
  })();

  // Nodes: hubs brighter and larger.
  const nodeGrow = new Float32Array(n * 2);
  const nodeCol = new Float32Array(n * 3);
  const white = new T.Color("#ffffff");
  const c0 = new T.Color();
  for (let i = 0; i < n; i++) {
    nodeGrow[i * 2] = born[i] as number;
    nodeGrow[i * 2 + 1] = 0.02;
    const isHub = first[owner[i] as number] === i;
    c0.copy(accent)
      .lerp(white, isHub ? 0.55 : rand() * 0.35)
      .multiplyScalar(isHub ? 2.4 : 1.2);
    nodeCol.set([c0.r, c0.g, c0.b], i * 3);
  }
  const nodeSize = shape === "system" ? 0.022 : shape === "flat" ? 0.006 : 0.012;
  const nodes = makeGlows(ctx, clock, {
    position: pos,
    grow: nodeGrow,
    colour: nodeCol,
    size: nodeSize,
    min: 1.6,
    max: 18,
    twinkle: 0.35,
  });
  const hubPos = new Float32Array(C * 3);
  const hubGrow = new Float32Array(C * 2);
  for (let c = 0; c < C; c++) {
    hubPos.set(pos.subarray(hub(c) * 3, hub(c) * 3 + 3), c * 3);
    hubGrow.set([born[hub(c)] as number, 0.03], c * 2);
  }
  const hubs = makeGlows(ctx, clock, {
    position: hubPos,
    grow: hubGrow,
    colour: accent.clone().lerp(white, 0.4).multiplyScalar(1.6),
    size: nodeSize * 3.5,
    min: 3,
    max: 60,
    twinkle: 0.2,
  });

  const web = new T.Group();
  web.add(localLinks.lines, trunkLinks.lines, packets.points, nodes.points, hubs.points);

  // --- The setting --------------------------------------------------------------------------------
  const disposers: (() => void)[] = [];
  const sky = makeSky(ctx, 1);
  scene.add(sky.mesh);
  disposers.push(() => sky.dispose());
  let earth: ReturnType<typeof makeEarth> | undefined;
  let spin: THREE.Object3D | undefined;
  const sunAt = new T.Vector3(-0.62, 0.18, -0.76).multiplyScalar(2e4);
  const camDir = new T.Vector3(0.38, 0.34, 0.86).normalize();
  let spinStart = 0;
  const updaters: ((time: number, px: number) => void)[] = [];
  if (shape === "globe") {
    earth = makeEarth(ctx, { sun: sunAt });
    scene.add(earth.group);
    spin = earth.group.children[0]?.children[0];
    (spin ?? earth.group).add(web);
    disposers.push(() => earth?.dispose());
    // Turn the globe so the first cluster faces the camera at the start.
    const tilt = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      (23.44 * Math.PI) / 180,
    );
    const c0v = centres[0] as THREE.Vector3;
    let best = -2;
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const w = c0v
        .clone()
        .applyAxisAngle(new T.Vector3(0, 1, 0), a)
        .applyQuaternion(tilt);
      const d = w.dot(camDir);
      if (d > best) {
        best = d;
        spinStart = a;
      }
    }
  } else if (shape === "flat") {
    const blobs = centres.map((c, i) => new T.Vector3(c.x, c.z, (spreads[i] as number) * 3 + 0.08));
    while (blobs.length < 40) blobs.push(new T.Vector3(99, 99, 0));
    const mapGeo = new T.PlaneGeometry(6, 6, 1, 1);
    mapGeo.rotateX(-Math.PI / 2);
    const mapMat = new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        uniform vec3 uBlobs[40];
        uniform vec3 cAccent;
        varying vec3 vW;
        ${NOISE}
        void main() {
          vec2 p = vW.xz;
          // A continent: broad noise, pulled up under every cluster so none sits in the sea.
          float land = fbm(vec3(p * 1.6, 1.0)) + 0.32 * (1.0 - smoothstep(0.6, 1.7, length(p * vec2(0.85, 1.2))));
          for (int i = 0; i < 40; i++) {
            vec3 b = uBlobs[i];
            land += 0.25 * (1.0 - smoothstep(0.3, 1.0, length(p - b.xy) / max(b.z, 1e-3)));
          }
          float shore = smoothstep(0.6, 0.62, land);
          float coast = 1.0 - smoothstep(0.0, 0.012, abs(land - 0.61));
          vec2 g = abs(fract(p * 10.0 + 0.5) - 0.5) / fwidth(p * 10.0);
          float grid = 1.0 - smoothstep(0.0, 1.2, min(g.x, g.y));
          vec3 sea = vec3(0.004, 0.008, 0.02);
          vec3 ground = vec3(0.014, 0.017, 0.024) * (0.7 + 0.6 * fbm(vec3(p * 9.0, 2.0)));
          vec3 c = mix(sea, ground, shore);
          c += cAccent * coast * 0.06 + vec3(0.25, 0.35, 0.6) * grid * 0.018 * (1.0 - shore * 0.5);
          float edge = 1.0 - smoothstep(1.6, 2.8, length(p));
          gl_FragColor = vec4(c * edge, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms: { uBlobs: { value: blobs }, cAccent: { value: accent } },
    });
    const mapMesh = new T.Mesh(mapGeo, mapMat);
    scene.add(mapMesh);
    disposers.push(() => {
      mapGeo.dispose();
      mapMat.dispose();
    });
    scene.add(web);
  } else {
    const sun = makeSun(ctx, 0.2);
    scene.add(sun.group);
    disposers.push(() => sun.dispose());
    updaters.push((time) => sun.update(time, camera));
    for (const a of [0.39, 0.72, 1, 1.52]) {
      const ring = makeRing(ctx, auScene(a), "#8fa3c8", 0.18);
      scene.add(ring.line);
      disposers.push(() => ring.dispose());
    }
    const belt = makeOrbiters(ctx, {
      count: Math.round(6000 * ctx.detail),
      rMin: auScene(2.15),
      rMax: auScene(3.3),
      tilt: 0.12,
      colour: "#b8a890",
      size: 0.012,
      speed: 0.004,
      ref: auScene(2.7),
      seed: 23,
      gain: 0.5,
    });
    belt.built.value = 1;
    scene.add(belt.points);
    disposers.push(() => belt.dispose());
    const sunPos = new T.Vector3();
    for (const b of sysBodies) {
      if (b.name === "earth") {
        const e = makeEarth(ctx, { sun: sunPos });
        e.group.scale.setScalar(b.r);
        e.group.position.copy(b.at);
        scene.add(e.group);
        disposers.push(() => e.dispose());
        updaters.push((time) => e.update(time, camera));
      } else if (b.name === "moon" || b.name === "mercury") {
        const r = makeRock(ctx, `${b.name}.jpg` as "moon.jpg" | "mercury.jpg", b.r, sunPos);
        r.mesh.position.copy(b.at);
        scene.add(r.mesh);
        disposers.push(() => r.dispose());
      } else {
        const geo = new T.SphereGeometry(b.r, 32, 16);
        const mat = new T.MeshStandardMaterial({
          color: b.name === "mars" ? "#b5552e" : b.name === "venus" ? "#e0c48a" : "#8a8178",
          roughness: 0.9,
        });
        const mesh = new T.Mesh(geo, mat);
        mesh.position.copy(b.at);
        scene.add(mesh);
        disposers.push(() => {
          geo.dispose();
          mat.dispose();
        });
      }
    }
    const light = new T.PointLight("#fff2dc", 6, 0, 0);
    scene.add(light);
    scene.add(new T.AmbientLight("#334", 0.4));
    scene.add(web);
  }

  // --- The camera ---------------------------------------------------------------------------------
  const tiltQ = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    (23.44 * Math.PI) / 180,
  );
  const turn = (p: number) => spinStart + ramp(p, 0, 1) * 2.4;
  const world0 = new T.Vector3();
  const pose = (p: number): View => {
    const k = ramp(p, 0, 0.8);
    if (shape === "globe") {
      world0
        .copy(centres[0] as THREE.Vector3)
        .applyAxisAngle(new T.Vector3(0, 1, 0), turn(p))
        .applyQuaternion(tiltQ);
      // Close: above the first cluster, looking across it; far: the whole night side.
      const close = world0
        .clone()
        .multiplyScalar(1.12)
        .add(new T.Vector3(0, 0.22, 0))
        .add(
          world0
            .clone()
            .cross(new T.Vector3(0, 1, 0))
            .normalize()
            .multiplyScalar(0.2),
        );
      const d = logMix(close.distanceTo(world0), 3.9, k);
      const dir = close.clone().sub(world0).normalize().lerp(camDir, k).normalize();
      const target = world0.clone().multiplyScalar(1 - k);
      const position = target.clone().addScaledVector(dir, d);
      return {
        position: [position.x, position.y, position.z],
        target: [target.x, target.y, target.z],
        near: 1.15,
        far: 8,
      };
    }
    const c0v = centres[0] as THREE.Vector3;
    const target: V3 = [c0v.x * (1 - k), 0, c0v.z * (1 - k)];
    const az = mix(0.95, 1.7, ramp(p, 0, 1));
    if (shape === "flat")
      return orbitView(target, logMix(0.3, 3.1, k), az, mix(0.38, 0.95, k), 0.15, 3);
    return orbitView(target, logMix(1.2, 21, k), az, mix(0.32, 0.85, k), 0.1, 3);
  };

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      renderer.getSize(size);
      const px = size.y * renderer.getPixelRatio();
      const t = mix(0.05, 1.06, p);
      clock.uBuilt.value = t;
      clock.uTime.value = time;
      localLinks.uniforms.uClock.value = t;
      trunkLinks.uniforms.uClock.value = t;
      packets.uniforms.uClock.value = t;
      localLinks.update(time);
      trunkLinks.update(time);
      packets.update(time, px);
      nodes.update(px);
      hubs.update(px);
      if (earth) {
        earth.update(time, camera);
        if (spin) spin.rotation.y = turn(p);
      }
      for (const u of updaters) u(time, px);
    },
    dispose() {
      for (const d of disposers) d();
      localLinks.dispose();
      trunkLinks.dispose();
      packets.dispose();
      nodes.dispose();
      hubs.dispose();
    },
  };
};

export default network;
