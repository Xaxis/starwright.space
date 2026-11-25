/**
 * Earth from orbit, changed by the climb. The story opens low over one region (`look`) as it is
 * today, with the first real unit of the change marked in the record's colour, then pulls back to
 * the whole planet at the params' end state:
 *
 * - solar: the sunniest deserts filling with panel fields, glinting by day and glowing at dusk;
 * - grid: lines of light between the continents, power pulsing from the deserts to the cities;
 * - lights: city lights by night, and new lights where villages join the grid;
 * - ice: sea ice and caps spreading back from the poles;
 * - green: dry and cleared land turning to forest and grassland;
 * - rings: an orbital ring of industry over the equator, its arc built round, tethered to the ground;
 * - look: the region the story starts on.
 *
 * Units are Earth radii. Earth turns slowly and the camera rides with it, so the region stays in
 * view while day and night sweep across it.
 */
import { lin, makeEarth, map } from "../lib/bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import { rng } from "../lib/particles.ts";
import {
  choice,
  grow,
  ll,
  makeBackdrop,
  mix,
  pixelScale,
  ramp,
  share,
  storyBeats,
} from "../lib/space/kit.ts";
import { makeDots } from "../lib/space/points.ts";
import { makeRibbons } from "../lib/space/ribbons.ts";
import type { Kind, View } from "../types.ts";

type Look = "deserts" | "oceans" | "cities" | "poles" | "forests" | "farms" | "coasts";
const LOOKS: readonly Look[] = [
  "deserts",
  "oceans",
  "cities",
  "poles",
  "forests",
  "farms",
  "coasts",
];

/** Each region: longitude, latitude, and how far round the Sun sits from it (degrees; 0 noon). */
const REGION: Record<Look, [number, number, number]> = {
  deserts: [14, 22, 55],
  oceans: [-32, 22, 40],
  cities: [16, 34, 118],
  poles: [-42, 70, 25],
  forests: [-60, -6, 35],
  farms: [-92, 40, 45],
  coasts: [42, 18, 45],
};

/** Grid hubs (longitude, latitude): the sunny deserts and the cities they serve. */
const HUBS: [number, number][] = [
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
  [3, 7], // West Africa
];
const LINKS: [number, number][] = [
  [0, 6],
  [0, 1],
  [1, 7],
  [7, 8],
  [5, 8],
  [8, 10],
  [6, 9],
  [4, 9],
  [3, 11],
  [0, 12],
  [6, 13],
  [5, 13],
  [2, 10],
  [9, 11],
  [12, 1],
  [0, 14],
  [14, 11],
  [4, 10],
  [3, 4],
  [2, 7],
];

/** Land boxes (longitude, latitude ranges) mostly dark today, where new lights arrive. */
const NEW_LIGHTS: [number, number, number, number][] = [
  [-12, 10, 6, 15],
  [12, 40, -10, 12],
  [15, 34, -28, -12],
  [30, 45, 4, 14],
  [90, 105, 15, 25],
];

const OVERLAY_VERT = /* glsl */ `
${VERT_HEAD}
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_TAIL}
}`;

/**
 * Panel fields, forests and ice painted over Earth's own map, under its clouds. Panels fill the
 * sunniest deserts cell by cell (a third of a degree each), with gaps between fields; forests take
 * dry and cleared land patch by patch; ice spreads back from the poles with ragged edges.
 */
const OVERLAY_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uDay;
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uTime;
uniform float uGreen;
uniform float uIce;
uniform float uSolar;
uniform vec3 cPower;
uniform vec3 uHere;   // the region the story starts on: change begins there and spreads
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
${NOISE}
float blob(vec2 ll, vec2 c, vec2 r) {
  return 1.0 - smoothstep(0.55, 1.0, length((ll - c) / r));
}
// The sunniest deserts, as soft ellipses: centre and half-widths in degrees.
float sunny(vec2 ll) {
  float d = blob(ll, vec2(8.0, 23.0), vec2(22.0, 7.5));
  d = max(d, blob(ll, vec2(46.0, 22.5), vec2(9.0, 5.5)));
  d = max(d, blob(ll, vec2(128.0, -24.0), vec2(10.0, 5.0)));
  d = max(d, blob(ll, vec2(-69.6, -23.0), vec2(1.6, 4.0)));
  d = max(d, blob(ll, vec2(-112.0, 34.0), vec2(5.0, 3.0)));
  d = max(d, blob(ll, vec2(101.0, 41.5), vec2(9.0, 3.0)));
  d = max(d, blob(ll, vec2(20.0, -23.5), vec2(5.0, 4.0)));
  d = max(d, blob(ll, vec2(71.0, 26.5), vec2(3.0, 2.5)));
  return d;
}
void main() {
  vec3 albedo = texture2D(uDay, vUv).rgb;
  vec2 ll = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
  float land = step(0.06, albedo.r + albedo.g - albedo.b * 0.6);
  float n1 = vnoise(vObj * 70.0);
  float n2 = vnoise(vObj * 9.0);
  vec3 N = normalize(vN);
  vec3 L = normalize(uSun);
  vec3 V = normalize(uCam - vWorld);
  float mu = dot(N, L);
  // Panels: blocks a degree across, each a grid of fields, in parks that follow the sand; each
  // block is built once the share passes its own draw, the nearest to the region first.
  float sand = smoothstep(0.28, 0.5, albedo.r) * step(albedo.b * 1.15, albedo.r);
  float sun = sunny(ll) * land * sand;
  float park = smoothstep(0.3, 0.6, vnoise(vObj * 18.0));
  vec2 cell = floor(ll);
  vec2 inCell = fract(ll);
  float near = clamp(acos(clamp(dot(vObj, uHere), -1.0, 1.0)) / 1.2, 0.0, 1.0);
  float draw = mix(hash13(vec3(cell, 7.0)), near, 0.55);
  vec2 sub = fract(inCell * 5.0);
  float margin = step(0.05, sub.x) * step(sub.x, 0.95) * step(0.08, sub.y) * step(sub.y, 0.92);
  float panel = step(draw, uSolar * sun * mix(0.6, 1.0, park)) * mix(0.35, 1.0, margin) * step(0.001, uSolar);
  float rows = 0.8 + 0.2 * step(0.5, fract(inCell.y * 60.0));
  vec3 glass = vec3(0.006, 0.012, 0.035) * rows;
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 220.0) * 2.5;
  float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);
  // Forest: dry, brown or cleared land, never the panel fields.
  // Forest takes dry and cleared land, never bare sand or the panel fields.
  float bright = albedo.r + albedo.g + albedo.b;
  float dry = smoothstep(0.005, 0.09, albedo.r - albedo.g * 0.92) * land * (1.0 - step(0.55, albedo.b));
  dry *= 1.0 - smoothstep(0.75, 1.05, bright);
  dry *= 1.0 - step(0.5, panel);
  float cover = dry * step(1.0 - uGreen, mix(n1 * 0.45 + n2 * 0.55, 1.0 - near, 0.3));
  vec3 forest = mix(vec3(0.018, 0.07, 0.02), vec3(0.06, 0.13, 0.03), n1);
  // Ice.
  float edge = (n2 - 0.5) * 9.0 + (n1 - 0.5) * 3.0;
  // Sea ice spreads over the water; on land only the high ice sheets thicken.
  float northLat = mix(80.0, 64.0, uIce);
  float southLat = mix(-68.0, -57.0, uIce);
  float ice = smoothstep(northLat - 1.5, northLat + 1.5, ll.y + edge);
  ice += smoothstep(-southLat - 1.5, -southLat + 1.5, -ll.y + edge);
  ice *= mix(1.0 - land, 1.0, step(mix(80.0, 70.0, uIce), abs(ll.y) + edge * 0.5));
  ice = clamp(ice, 0.0, 1.0) * step(0.001, uIce);
  vec3 iceCol = mix(vec3(0.62, 0.72, 0.82), vec3(0.88, 0.92, 0.96), n1);
  vec3 col = mix(forest, iceCol, ice);
  float a = max(cover * 0.92, ice * 0.95);
  vec3 lit = col * (max(mu, 0.0) * 1.25 + 0.012);
  // Panels over the rest: dark glass, the Sun's glint, and a warm glow of delivered power at dusk.
  float dusk = 1.0 - smoothstep(-0.25, 0.2, mu);
  vec3 pv = glass * (max(mu, 0.0) * 1.25 + 0.02) + vec3(1.0, 0.9, 0.72) * glint * smoothstep(-0.05, 0.2, mu);
  pv += vec3(0.05, 0.1, 0.22) * fres * max(mu, 0.0);
  pv += cPower * dusk * (0.5 + 0.5 * sin(uTime * 1.2 + draw * 30.0)) * 0.35;
  lit = mix(lit, pv, panel);
  a = max(a, panel * 0.95);
  float cloud = smoothstep(0.15, 0.95, texture2D(uClouds, vUv + vec2(uTime * 0.0006, 0.0)).r) * 0.8;
  a *= 1.0 - cloud * 0.85;
  if (a < 0.003) discard;
  gl_FragColor = vec4(lit, a);
  ${FRAG_TAIL}
}`;

/** Curtains of aurora around the magnetic pole. */
const AURORA_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uTime;
uniform float uOn;
varying vec2 vUv;
${NOISE}
void main() {
  float a = vUv.x * 6.2831853;
  float band = vnoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.15)) * 0.7 + vnoise(vec3(a * 9.0, 0.0, uTime * 0.4)) * 0.3;
  float folds = 0.75 + 0.25 * sin(a * 40.0 + band * 9.0 + uTime * 0.6);
  float h = vUv.y;
  float fade = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.25, 1.0, h));
  vec3 c = mix(vec3(0.1, 1.0, 0.45), vec3(0.75, 0.25, 1.0), smoothstep(0.35, 1.0, h));
  float k = fade * folds * smoothstep(0.2, 0.7, band) * uOn;
  gl_FragColor = vec4(c * k * 1.4, k);
  ${FRAG_TAIL}
}`;

const globe: Kind = (ctx) => {
  const T = ctx.three;
  const { scene, camera } = ctx;
  const look = choice(ctx, "look", LOOKS, "deserts");
  const solar = share(ctx, "solar", 0);
  const grid = share(ctx, "grid", 0);
  const lights = share(ctx, "lights", 0.8);
  const ice = share(ctx, "ice", 0);
  const green = share(ctx, "green", 0);
  const rings = share(ctx, "rings", 0);
  const [lon, lat, sunAngle] = REGION[look];
  const accent = ctx.colour;

  // The Earth's frame: tilted, turning. The Sun is placed relative to where the region starts.
  const TILT = (23.44 * Math.PI) / 180;
  const SPIN = 0.25;
  const tiltQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), TILT);
  const region0 = ll(T, lon, lat).applyQuaternion(tiltQ);
  const flat = new T.Vector3(region0.x, 0, region0.z).normalize();
  if (flat.lengthSq() < 0.5) flat.set(1, 0, 0);
  const sunPos = flat
    .applyAxisAngle(new T.Vector3(0, 1, 0), (sunAngle * Math.PI) / 180)
    .multiplyScalar(23481);

  const sky = makeBackdrop(ctx);
  const earth = makeEarth(ctx, { sun: sunPos });
  scene.add(earth.group);
  const tilt = new T.Group();
  tilt.rotation.z = TILT;
  const spin = new T.Group();
  tilt.add(spin);
  earth.group.add(tilt);

  // Forests and ice, painted over the map.
  const seg = ctx.detail < 1 ? 64 : 128;
  const overGeo = new T.SphereGeometry(1.0012, seg, seg / 2);
  const overU = {
    uDay: { value: map(ctx, "earth-day.jpg") },
    uClouds: { value: map(ctx, "earth-clouds.jpg") },
    uSun: earth.uniforms.uSun,
    uCam: earth.uniforms.uCam,
    uTime: { value: 0 },
    uGreen: { value: 0 },
    uIce: { value: 0 },
    uSolar: { value: 0 },
    cPower: { value: lin(ctx, "#ffb347", 1.2) },
    uHere: { value: ll(T, lon, lat) },
  };
  const overMat = new T.ShaderMaterial({
    vertexShader: OVERLAY_VERT,
    fragmentShader: OVERLAY_FRAG,
    uniforms: overU,
    transparent: true,
    depthWrite: false,
  });
  const over = new T.Mesh(overGeo, overMat);
  over.visible = green > 0 || ice > 0 || solar > 0;
  spin.add(over);

  // The grid: arcs between hubs, the nearest to the region first.
  const here = ll(T, lon, lat);
  const links = LINKS.map(([a, b]) => {
    const A = ll(T, ...(HUBS[a] as [number, number]));
    const B = ll(T, ...(HUBS[b] as [number, number]));
    return { A, B, near: A.clone().add(B).normalize().angleTo(here) };
  }).sort((x, y) => x.near - y.near);
  const gridLines = links.map(({ A, B }, i) => {
    const pts = [];
    const steps = 40;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = A.clone().lerp(B, t).normalize();
      pts.push(p.multiplyScalar(1.004 + 0.05 * Math.sin(Math.PI * t) * A.distanceTo(B)));
    }
    return { points: pts, born: (i / links.length) * 0.97, seed: i * 0.31 };
  });
  const gridR = makeRibbons(ctx, gridLines, {
    colour: "#ffb45e",
    pulse: accent,
    width: 1.3,
    pulses: 3,
    speed: 0.35,
    base: 0.55,
  });
  gridR.mesh.visible = grid > 0;
  spin.add(gridR.mesh);

  // New lights where villages join the grid, shown only on the night side.
  const r = rng(29);
  const nl: number[] = [];
  const nlBorn: number[] = [];
  // Towns, each a cluster of lights, scattered over the dark land.
  const towns = Math.round(260 * ctx.detail);
  for (let t = 0; t < towns; t++) {
    const box = NEW_LIGHTS[t % NEW_LIGHTS.length] as [number, number, number, number];
    const cLon = mix(box[0], box[1], r());
    const cLat = mix(box[2], box[3], r());
    const born = r() * 0.97;
    const n = 3 + Math.floor(r() ** 2 * 14);
    for (let i = 0; i < n; i++) {
      const p = ll(T, cLon + (r() - 0.5) * 0.9, cLat + (r() - 0.5) * 0.9, 1.002);
      nl.push(p.x, p.y, p.z);
      nlBorn.push(Math.min(0.99, born + r() * 0.02));
    }
  }
  const newLights = makeDots(ctx, {
    positions: nl,
    born: nlBorn,
    colour: "#ffc27a",
    colourB: "#ffe2b0",
    size: 0.0035,
    minPx: 1.2,
    maxPx: 3,
    gain: 1.6,
    twinkle: 0.35,
    night: earth.uniforms.uSun.value,
  });
  newLights.points.visible = lights > 0.7;
  spin.add(newLights.points);

  // The ring of industry over the equator, its stationary arc tethered to the ground.
  const ringR = 1.13;
  const ringGroup = new T.Group();
  ringGroup.visible = rings > 0;
  spin.add(ringGroup);
  const startLon = (lon * Math.PI) / 180;
  const ringPts = [];
  for (let i = 0; i <= 256; i++) {
    const a = startLon + (i / 256) * Math.PI * 2;
    ringPts.push(new T.Vector3(Math.cos(a) * ringR, 0, -Math.sin(a) * ringR));
  }
  const tethers = [];
  for (let i = 0; i < 24; i++) {
    const a = startLon + ((i + 0.5) / 24) * Math.PI * 2;
    const top = new T.Vector3(Math.cos(a) * ringR, 0, -Math.sin(a) * ringR);
    tethers.push({
      points: [top.clone().multiplyScalar(1.002 / ringR), top],
      born: (i + 0.5) / 24,
    });
  }
  const ringLine = makeRibbons(ctx, [{ points: ringPts }], {
    colour: "#ffd9a6",
    pulse: accent,
    width: 1.8,
    pulses: 14,
    speed: 0.05,
    base: 0.8,
  });
  const ringTethers = makeRibbons(ctx, tethers, {
    colour: "#9fc0ff",
    pulse: "#ffffff",
    width: 0.8,
    pulses: 2,
    speed: 0.6,
  });
  const fac: number[] = [];
  const facBorn: number[] = [];
  const facScale: number[] = [];
  const nFac = Math.round(3000 * ctx.detail);
  for (let i = 0; i < nFac; i++) {
    const t = r();
    const a = startLon + t * Math.PI * 2;
    const rr = ringR + (r() - 0.5) * 0.008;
    fac.push(Math.cos(a) * rr, (r() - 0.5) * 0.008, -Math.sin(a) * rr);
    facBorn.push(t * 0.98);
    facScale.push(0.5 + r() * 1.5);
  }
  const factories = makeDots(ctx, {
    positions: fac,
    born: facBorn,
    scales: facScale,
    colour: "#fff1d6",
    colourB: accent,
    size: 0.006,
    minPx: 1.2,
    maxPx: 6,
    gain: 1.5,
    twinkle: 0.4,
  });
  ringGroup.add(ringLine.mesh, ringTethers.mesh, factories.points);

  // Aurora round the magnetic pole, when the story looks at the poles.
  let aurora:
    | {
        geo: { dispose(): void };
        mat: { dispose(): void };
        u: { uTime: { value: number }; uOn: { value: number } };
      }
    | undefined;
  if (look === "poles") {
    const geo = new T.CylinderGeometry(0.36, 0.4, 0.09, 160, 1, true);
    const u = { uTime: { value: 0 }, uOn: { value: 1 } };
    const mat = new T.ShaderMaterial({
      vertexShader: OVERLAY_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    });
    const mesh = new T.Mesh(geo, mat);
    // The geomagnetic pole sits about ten degrees from the axis, toward Canada.
    const holder = new T.Group();
    holder.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), ll(T, -72, 80));
    mesh.position.y = 0.93;
    holder.add(mesh);
    spin.add(holder);
    aurora = { geo, mat, u };
  }

  // The first unit, marked: a ring in the record's colour on the region, fading as the change spreads.
  const markPts = [];
  const markC = ll(T, lon, lat);
  const e1 = new T.Vector3(0, 1, 0).cross(markC).normalize();
  const e2 = markC.clone().cross(e1).normalize();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    markPts.push(
      markC
        .clone()
        .addScaledVector(e1, Math.cos(a) * 0.05)
        .addScaledVector(e2, Math.sin(a) * 0.05)
        .normalize()
        .multiplyScalar(1.006),
    );
  }
  const mark = makeRibbons(ctx, [{ points: markPts }], {
    colour: accent,
    width: 1.4,
    pulses: 2,
    speed: 0.25,
    base: 0.9,
  });
  spin.add(mark.mesh);

  // --- The camera rides with the turning Earth --------------------------------------------------
  let spinAngle = 0;
  const bodyQ = new T.Quaternion();
  const yAxis = new T.Vector3(0, 1, 0);
  const far = rings > 0 ? 4.3 : 3.5;
  /** Camera keys: distance, camera offset in longitude and latitude, target latitude offset and height. */
  interface Key {
    at: number;
    d: number;
    dLon: number;
    dLat: number;
    tLat: number;
    tH: number;
  }
  const keys: Key[] = [
    { at: 0, d: 1.72, dLon: 3, dLat: -15, tLat: 5, tH: 1 },
    { at: 0.5, d: 2.6, dLon: 10, dLat: -18, tLat: 0, tH: 0.6 },
    { at: 1, d: far, dLon: 16, dLat: -10, tLat: 0, tH: 0 },
  ];
  const cam = new T.Vector3();
  const tgt = new T.Vector3();
  const pose = (p: number): View => {
    const B = keys.find((x) => x.at >= p && x.at > 0) ?? (keys[keys.length - 1] as Key);
    const A = keys[Math.max(0, keys.indexOf(B) - 1)] as Key;
    const k = ramp(p, A.at, B.at);
    const d = Math.exp(mix(Math.log(A.d), Math.log(B.d), k));
    const cLon = lon + mix(A.dLon, B.dLon, k);
    const cLat = Math.max(-80, Math.min(80, lat + mix(A.dLat, B.dLat, k)));
    const tLat = lat + mix(A.tLat, B.tLat, k);
    const tH = mix(A.tH, B.tH, k);
    bodyQ.setFromAxisAngle(yAxis, spinAngle).premultiply(tiltQ);
    cam.copy(ll(T, cLon, cLat, d)).applyQuaternion(bodyQ);
    tgt.copy(ll(T, lon, tLat, tH)).applyQuaternion(bodyQ);
    return {
      position: [cam.x, cam.y, cam.z],
      target: [tgt.x, tgt.y, tgt.z],
      near: 0.15,
      far: 9,
    };
  };

  const size = new T.Vector2();
  return {
    view: pose(0),
    beats: storyBeats(ctx),
    pose,
    update(time, _dt, p) {
      const et = time * SPIN;
      spinAngle = et * 0.05;
      spin.rotation.y = spinAngle;
      earth.update(et, camera);
      const px = pixelScale(ctx, size);
      const g = (first: number) => grow(p, first);
      // Earth's own panels stay off: the overlay draws the fields.
      earth.uniforms.uSolar.value = 0;
      overU.uSolar.value = solar * g(0.025);
      earth.uniforms.uLights.value = mix(Math.min(lights, 0.7), lights, ramp(p, 0, 0.8));
      overU.uTime.value = et;
      overU.uGreen.value = green * g(0.05);
      overU.uIce.value = ice * g(0.08);
      gridR.built.value = grid * g(1.02 / links.length);
      gridR.update(time);
      newLights.built.value = ramp(lights, 0.7, 1) * ramp(p, 0.05, 1);
      newLights.update(time, px);
      const arc = rings * g(0.06);
      ringLine.reveal.value = arc;
      ringLine.update(time);
      ringTethers.built.value = arc;
      ringTethers.update(time);
      factories.built.value = arc;
      factories.update(time, px);
      if (aurora) {
        aurora.u.uTime.value = time;
        aurora.u.uOn.value = 0.6 + 0.4 * ramp(p, 0, 1);
      }
      mark.on.value = 1 - ramp(p, 0.15, 0.55);
      mark.update(time);
    },
    dispose() {
      sky.dispose();
      earth.dispose();
      overGeo.dispose();
      overMat.dispose();
      gridR.dispose();
      newLights.dispose();
      ringLine.dispose();
      ringTethers.dispose();
      factories.dispose();
      aurora?.geo.dispose();
      aurora?.mat.dispose();
      mark.dispose();
    },
  };
};

export default globe;
