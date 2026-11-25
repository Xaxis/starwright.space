/**
 * Where a reactor goes once it works: the ground at night, a power plant built round the machine
 * (a glass hall, a turbine hall with its windows lit, a cooling tower and its plume), and then a
 * fleet of plants spreading over the land, their cores glowing and the grid between them lighting
 * up as each one joins.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { FRAG_HEAD, FRAG_TAIL, NOISE, VERT_HEAD, VERT_TAIL } from "../glsl.ts";
import { type Bin, glowPoints, LIGHT, lin, type Points, rng } from "./common.ts";

/** Walls with rows of windows, some lit; instanced or not. */
function buildingMat(
  ctx: KindContext,
  bin: Bin,
  colour: string,
  lights: string,
  fog: { value: number },
) {
  const T = ctx.three;
  const uniforms = {
    cBase: { value: lin(ctx, colour) },
    cLight: { value: lin(ctx, lights) },
    cFog: { value: lin(ctx, "#070a12") },
    uFog: fog,
    uOn: { value: 1 },
  };
  const mat = bin.add(
    new T.ShaderMaterial({
      vertexShader: /* glsl */ `
        ${VERT_HEAD}
        varying vec3 vW;
        varying vec3 vN;
        varying vec3 vL;
        void main() {
          #ifdef USE_INSTANCING
          mat4 m = modelMatrix * instanceMatrix;
          #else
          mat4 m = modelMatrix;
          #endif
          vL = position;
          vec4 w = m * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(m) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
          ${VERT_TAIL}
        }`,
      fragmentShader: /* glsl */ `
        ${FRAG_HEAD}
        ${NOISE}
        ${LIGHT}
        uniform vec3 cBase;
        uniform vec3 cLight;
        uniform vec3 cFog;
        uniform float uFog;
        uniform float uOn;
        varying vec3 vW;
        varying vec3 vN;
        varying vec3 vL;
        void main() {
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          vec3 c = lit(cBase, N, V, vec3(0.05, 0.07, 0.1)) * 0.6;
          // Strip windows high on an industrial wall, a share of them lit.
          if (abs(N.y) < 0.5) {
            vec2 w = vec2(vW.x + vW.z, vW.y) * vec2(0.7, 0.55);
            vec2 f = abs(fract(w) - 0.5);
            float win = step(f.x, 0.44) * step(f.y, 0.09) * step(0.5, fract(w.y * 0.5));
            float on = step(0.35, hash13(vec3(floor(w), floor(vW.x * 0.05))));
            c += cLight * win * on * uOn;
          }
          float d = length(cameraPosition - vW);
          c = mix(c, cFog, 1.0 - exp(-d / uFog));
          gl_FragColor = vec4(c, 1.0);
          ${FRAG_TAIL}
        }`,
      uniforms,
    }),
  );
  return { mat, on: uniforms.uOn };
}

/** A hyperbolic cooling tower, base at y 0. */
function towerGeometry(T: typeof THREE): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 9;
    const r = 1.9 + 1.4 * ((t - 0.72) / 0.72) ** 2;
    pts.push(new T.Vector2(r, y));
  }
  return new T.LatheGeometry(pts, 40);
}

export interface Site {
  group: THREE.Group;
  update(time: number, plant: number, fleet: number, pixels: number, camD: number): void;
}

export interface SiteOptions {
  floor: number;
  /** The hall's half width, round the machine; 0 for none (geothermal's plant stands on the rock). */
  hall: number;
  tower: boolean;
  core: string;
  /** See through the ground round a buried section: its centre x, z and radius. */
  xray?: [number, number, number];
}

export function makeSite(ctx: KindContext, bin: Bin, o: SiteOptions): Site {
  const T = ctx.three;
  const g = new T.Group();
  const fog = { value: 800 };
  const rand = rng(97);
  const accent = ctx.colour;

  // The ground: dark land with fields, fading to the horizon.
  const groundU = {
    uFog: fog,
    cFog: { value: lin(ctx, "#070a12") },
    uXray: { value: new T.Vector3(...(o.xray ?? [0, 0, 0])) },
    uShow: { value: 1 },
  };
  const ground = new T.Mesh(
    bin.add(new T.CircleGeometry(9000, 96)),
    bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: /* glsl */ `
          ${FRAG_HEAD}
          ${NOISE}
          uniform float uFog;
          uniform vec3 cFog;
          uniform vec3 uXray;
          uniform float uShow;
          varying vec3 vW;
          void main() {
            float n = vnoise(vec3(vW.xz * 0.004, 0.0)) * 0.6 + vnoise(vec3(vW.xz * 0.03, 1.0)) * 0.4;
            vec2 f = abs(fract(vW.xz * 0.012 + n * 0.3) - 0.5);
            float field = smoothstep(0.47, 0.5, max(f.x, f.y));
            vec3 c = mix(vec3(0.028, 0.034, 0.03), vec3(0.05, 0.055, 0.045), n) + vec3(0.02) * field;
            float d = length(cameraPosition - vW);
            c = mix(c, cFog, 1.0 - exp(-d / uFog));
            // Over a buried section the ground turns to glass, its rim lit.
            float x = uXray.z > 0.0 ? length(vW.xz - uXray.xy) / uXray.z : 2.0;
            float a = mix(0.06, 1.0, smoothstep(0.75, 1.0, x));
            c += vec3(0.5, 0.3, 0.15) * 0.25 * smoothstep(0.08, 0.0, abs(x - 0.88));
            a *= uShow;
            if (a < 0.002) discard;
            gl_FragColor = vec4(c, a);
            ${FRAG_TAIL}
          }`,
        uniforms: groundU,
        transparent: !!o.xray,
        depthWrite: !o.xray,
      }),
    ),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = o.floor - 0.002;
  g.add(ground);

  // The plant round the machine.
  const plant = new T.Group();
  g.add(plant);
  let glass: THREE.ShaderMaterial | undefined;
  const glassU = { uOn: { value: 0 }, cColour: { value: lin(ctx, "#9fc4ff") } };
  if (o.hall > 0) {
    const W = o.hall * 2;
    const H = o.hall * 1.35;
    const box = bin.add(new T.BoxGeometry(W, H, W));
    glass = bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nvarying vec3 vW; varying vec3 vN;\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; ${VERT_TAIL} }`,
        fragmentShader: `${FRAG_HEAD}\nuniform float uOn; uniform vec3 cColour; varying vec3 vW; varying vec3 vN;\nvoid main(){ if (vN.y > 0.5) discard; float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW))); gl_FragColor = vec4(cColour * (0.015 + 0.05 * pow(1.0 - mu, 3.0)) * uOn, 1.0); ${FRAG_TAIL} }`,
        uniforms: glassU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      }),
    );
    const hall = new T.Mesh(box, glass);
    hall.position.y = o.floor + H / 2;
    const frame = new T.LineSegments(
      bin.add(new T.EdgesGeometry(box)),
      bin.add(
        new T.ShaderMaterial({
          vertexShader: `${VERT_HEAD}\nvoid main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
          fragmentShader: `${FRAG_HEAD}\nuniform float uOn; uniform vec3 cColour; void main(){ gl_FragColor = vec4(cColour * 0.5 * uOn, 1.0); ${FRAG_TAIL} }`,
          uniforms: glassU,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      ),
    );
    frame.position.copy(hall.position);
    plant.add(hall, frame);
  }
  const bm = buildingMat(ctx, bin, "#8c929c", accent, fog);
  // Cooling towers are bare concrete: no windows.
  const concrete = buildingMat(ctx, bin, "#9a9ea6", accent, fog);
  concrete.on.value = 0;
  const hallW = Math.max(o.hall, 2.5);
  const turbine = new T.Mesh(
    bin.add(new T.BoxGeometry(hallW * 2.6, hallW * 0.9, hallW * 1.1)),
    bm.mat,
  );
  turbine.position.set(hallW * 0.4, o.floor + hallW * 0.45, -hallW * 2.4);
  plant.add(turbine);
  const annex = new T.Mesh(
    bin.add(new T.BoxGeometry(hallW * 0.9, hallW * 1.6, hallW * 0.9)),
    bm.mat,
  );
  annex.position.set(-hallW * 1.8, o.floor + hallW * 0.8, -hallW * 1.2);
  plant.add(annex);
  const towerGeo = bin.add(towerGeometry(T));
  let plume: Points | undefined;
  if (o.tower) {
    const tower = new T.Mesh(towerGeo, concrete.mat);
    // Behind the halls as the camera first sees them, so it frames the plant rather than hiding it.
    tower.position.set(hallW * 3.4, o.floor, -hallW * 2.6);
    tower.scale.setScalar(hallW / 3.2);
    plant.add(tower);
    const top = tower.position.clone().add(new T.Vector3(0, 9 * (hallW / 3.2), 0));
    plume = glowPoints(ctx, bin, {
      count: 700,
      seed: 71,
      colour: "#c8d0dc",
      size: hallW * 0.9,
      maxPx: 40,
      additive: false,
      uniforms: { uOn: { value: 0 }, uTop: { value: top }, uS: { value: hallW / 3.2 } },
      decl: "uniform float uOn; uniform vec3 uTop; uniform float uS;",
      body: /* glsl */ `
        float s = fract(aSeed.x + uTime * 0.05);
        pos = uTop + vec3((aSeed.y - 0.5) * 2.5 * (1.0 + s * 2.0) + s * 6.0, s * 14.0, (aSeed.z - 0.5) * 2.5 * (1.0 + s * 2.0)) * uS;
        alpha = uOn * 0.1 * (1.0 - s) * smoothstep(0.0, 0.08, s);
        col = mix(vec3(0.75, 0.8, 0.88), cColour, 0.3);
        size = 0.5 + s * 1.5;`,
    });
    plant.add(plume.points);
  }
  // Lamps round the site.
  const lampPos = new Float32Array(60 * 3);
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = hallW * (1.6 + rand() * 3.5);
    lampPos.set([Math.cos(a) * r, o.floor + 0.3, Math.sin(a) * r], i * 3);
  }
  const lamps = glowPoints(ctx, bin, {
    count: 60,
    seed: 73,
    colour: "#ffd9a0",
    size: hallW * 0.07,
    maxPx: 6,
    attributes: { aPos: { array: lampPos, size: 3 } },
    uniforms: { uOn: { value: 0 } },
    decl: "attribute vec3 aPos; uniform float uOn;",
    body: "pos = aPos; alpha = uOn * (0.5 + 0.5 * aSeed.x);",
  });
  plant.add(lamps.points);

  // The fleet: plants spreading over the land, the grid joining them.
  const n = Math.round(70 + 160 * ctx.detail);
  const sites: { x: number; z: number; born: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = 60 + 1700 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    sites.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, born: (r / 1760) * 0.75 + rand() * 0.25 });
  }
  sites.sort((p, q) => p.born - q.born);
  const halls = bin.add(new T.InstancedMesh(bin.add(new T.BoxGeometry(1, 1, 1)), bm.mat, n));
  const towers = bin.add(new T.InstancedMesh(towerGeo, concrete.mat, n));
  const dummy = new T.Object3D();
  const corePos = new Float32Array(n * 3);
  const coreBorn = new Float32Array(n);
  const hide = new T.Matrix4().makeScale(0, 0, 0);
  const fleetMats: THREE.Matrix4[] = [];
  const towerMats: THREE.Matrix4[] = [];
  sites.forEach((s, i) => {
    const k = 0.8 + rand() * 0.5;
    dummy.position.set(s.x, o.floor + 3 * k, s.z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(9 * k, 6 * k, 9 * k);
    dummy.updateMatrix();
    fleetMats.push(dummy.matrix.clone());
    dummy.position.set(s.x + 9 * k, o.floor, s.z + 4 * k);
    dummy.scale.setScalar(o.tower ? k * 0.9 : k * 0.5);
    dummy.updateMatrix();
    towerMats.push(dummy.matrix.clone());
    corePos.set([s.x, o.floor + 7 * k, s.z], i * 3);
    coreBorn[i] = s.born;
    halls.setMatrixAt(i, hide);
    towers.setMatrixAt(i, hide);
  });
  g.add(halls);
  if (o.tower) g.add(towers);
  const cores = glowPoints(ctx, bin, {
    count: n,
    seed: 79,
    colour: o.core,
    size: 16,
    maxPx: 14,
    attributes: { aPos: { array: corePos, size: 3 }, aBorn: { array: coreBorn, size: 1 } },
    uniforms: { uFleet: { value: 0 } },
    decl: "attribute vec3 aPos; attribute float aBorn; uniform float uFleet;",
    body: /* glsl */ `
      pos = aPos;
      float on = smoothstep(aBorn, aBorn + 0.03, uFleet);
      alpha = on * (0.7 + 0.3 * sin(uTime * 2.0 + aSeed.x * 20.0));
      size = 1.0 + 0.5 * aSeed.y;`,
  });
  g.add(cores.points);
  // Each plant's yard lights and the town that grows up beside it.
  const per = Math.round(14 + 20 * ctx.detail);
  const townPos = new Float32Array(n * per * 3);
  const townBorn = new Float32Array(n * per);
  sites.forEach((s, i) => {
    for (let k = 0; k < per; k++) {
      const a = rand() * Math.PI * 2;
      const r = 10 + rand() ** 2 * 70;
      townPos.set([s.x + Math.cos(a) * r, o.floor + 1, s.z + Math.sin(a) * r], (i * per + k) * 3);
      townBorn[i * per + k] = s.born + rand() * 0.05;
    }
  });
  const town = glowPoints(ctx, bin, {
    count: 0,
    seed: 83,
    colour: "#ffcf8a",
    size: 4,
    maxPx: 5,
    attributes: { aPos: { array: townPos, size: 3 }, aBorn: { array: townBorn, size: 1 } },
    uniforms: { uFleet: { value: 0 } },
    decl: "attribute vec3 aPos; attribute float aBorn; uniform float uFleet;",
    body: "pos = aPos; alpha = smoothstep(aBorn, aBorn + 0.03, uFleet) * (0.35 + 0.65 * aSeed.x);",
  });
  g.add(town.points);
  // The grid: each new plant wires itself to the nearest one already built.
  const linePos: number[] = [];
  const lineBorn: number[] = [];
  const lineAlong: number[] = [];
  sites.forEach((s, i) => {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let j = 0; j < i; j++) {
      const t = sites[j] as (typeof sites)[number];
      const d = Math.hypot(t.x - s.x, t.z - s.z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    const to = best >= 0 ? (sites[best] as (typeof sites)[number]) : { x: 0, z: 0 };
    if (best < 0) bd = Math.hypot(s.x, s.z);
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      for (const t of [k / steps, (k + 1) / steps]) {
        const x = s.x + (to.x - s.x) * t;
        const z = s.z + (to.z - s.z) * t;
        linePos.push(x, o.floor + 2 + Math.sin(t * Math.PI) * bd * 0.02, z);
        lineBorn.push(s.born);
        lineAlong.push(t * bd * 0.02);
      }
    }
  });
  const lineGeo = bin.add(new T.BufferGeometry());
  lineGeo.setAttribute("position", new T.Float32BufferAttribute(linePos, 3));
  lineGeo.setAttribute("aBorn", new T.Float32BufferAttribute(lineBorn, 1));
  lineGeo.setAttribute("aAlong", new T.Float32BufferAttribute(lineAlong, 1));
  const gridU = { uFleet: { value: 0 }, uTime: { value: 0 }, cColour: { value: lin(ctx, accent) } };
  const grid = new T.LineSegments(
    lineGeo,
    bin.add(
      new T.ShaderMaterial({
        vertexShader: `${VERT_HEAD}\nattribute float aBorn; attribute float aAlong; varying float vBorn; varying float vAlong;\nvoid main(){ vBorn = aBorn; vAlong = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${VERT_TAIL} }`,
        fragmentShader: `${FRAG_HEAD}\nuniform float uFleet; uniform float uTime; uniform vec3 cColour; varying float vBorn; varying float vAlong;\nvoid main(){ float on = smoothstep(vBorn, vBorn + 0.04, uFleet); float pulse = pow(max(0.5 + 0.5 * sin((vAlong - uTime * 0.6) * 6.2832), 0.0), 6.0); gl_FragColor = vec4(cColour * (0.1 + 0.9 * pulse) * on, 1.0); ${FRAG_TAIL} }`,
        uniforms: gridU,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
  );
  grid.frustumCulled = false;
  g.add(grid);

  let shown = -1;
  return {
    group: g,
    update(time, plantOn, fleet, pixels, camD) {
      fog.value = Math.max(60, camD * 2.2);
      // Over a buried section, the land itself arrives with the plant.
      if (o.xray) groundU.uShow.value = plantOn;
      glassU.uOn.value = plantOn;
      plant.visible = plantOn > 0.001;
      plant.scale.setScalar(0.001 + 0.999 * Math.min(1, plantOn * 1.5));
      if (glass) glass.visible = plantOn > 0.001;
      bm.on.value = 1;
      if (plume) {
        (plume.uniforms.uOn as THREE.IUniform).value = plantOn;
        plume.update(time, fleet, pixels);
      }
      (lamps.uniforms.uOn as THREE.IUniform).value = plantOn;
      lamps.update(time, fleet, pixels);
      // Show the fleet's buildings as they are born (a matrix write only when the count changes).
      const count = sites.filter((s) => s.born < fleet).length;
      if (count !== shown) {
        shown = count;
        sites.forEach((_, i) => {
          halls.setMatrixAt(i, i < count ? (fleetMats[i] as THREE.Matrix4) : hide);
          towers.setMatrixAt(i, i < count ? (towerMats[i] as THREE.Matrix4) : hide);
        });
        halls.instanceMatrix.needsUpdate = true;
        towers.instanceMatrix.needsUpdate = true;
      }
      halls.visible = count > 0;
      towers.visible = count > 0 && o.tower;
      (cores.uniforms.uFleet as THREE.IUniform).value = fleet;
      cores.update(time, fleet, pixels);
      (town.uniforms.uFleet as THREE.IUniform).value = fleet;
      town.update(time, fleet, pixels);
      gridU.uFleet.value = fleet;
      gridU.uTime.value = time;
      grid.visible = fleet > 0.001;
    },
  };
}
