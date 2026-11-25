/**
 * The Tower: every capability the climb needs, as one structure. Each floor is a rung of the ladder,
 * each spoke an area; a capability sits where its area meets the rung it is first needed on, and
 * lines rise from what it needs. The story climbs floor by floor: capabilities light as their rung
 * is reached and power runs up the links that feed them. Point at a capability to name it; click
 * to open it.
 */
import type * as THREE from "three";
import { glowTexture } from "../lib/bodies.ts";
import { FRAG_HEAD, FRAG_TAIL, VERT_HEAD, VERT_TAIL } from "../lib/glsl.ts";
import type { Beat, Kind, View } from "../types.ts";

export interface TowerData {
  beats: Omit<Beat, "at">[];
  stages: string[];
  domains: { title: string; colour: string }[];
  /** d: the area's index, s: the rung's index. */
  nodes: { id: string; title: string; d: number; s: number; inventions: number }[];
  /** Node indexes: from what is needed to what needs it. */
  edges: [number, number][];
  /** An area to bring forward (its index): the rest of the tower dims, and the camera stays on its spoke. */
  focus?: number;
}

const FLOOR = 1.7;
const R = 5.2;

const ramp = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const EDGE_VERT = /* glsl */ `
${VERT_HEAD}
attribute float aT;
attribute float aStage;
attribute float aWeight;
attribute vec3 aColour;
uniform float uLevel;
varying float vT;
varying float vLit;
varying vec3 vColour;
varying float vWeight;
void main() {
  vT = aT;
  vWeight = aWeight;
  vLit = smoothstep(aStage - 0.7, aStage, uLevel);
  vColour = aColour;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_TAIL}
}`;

const EDGE_FRAG = /* glsl */ `
${FRAG_HEAD}
uniform float uTime;
varying float vT;
varying float vLit;
varying vec3 vColour;
varying float vWeight;
void main() {
  // Power runs from what is needed up to what needs it.
  float pulse = pow(max(0.0, 1.0 - abs(fract(vT * 1.5 - uTime * 0.45) - 0.5) * 6.0), 2.0);
  float a = (0.06 + vLit * (0.22 + 0.9 * pulse)) * vWeight;
  gl_FragColor = vec4(vColour * a * (0.6 + 1.6 * pulse * vLit), a);
  ${FRAG_TAIL}
}`;

function textSprite(T: typeof THREE, text: string, colour: string, height: number, weight = 600) {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no 2D canvas");
  const font = `${weight} 56px Inter, ui-sans-serif, system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = 80;
  g.font = font;
  g.fillStyle = colour;
  g.textBaseline = "middle";
  g.fillText(text, 12, 42);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new T.Sprite(mat);
  sprite.scale.set((height * w) / 80, height, 1);
  return {
    sprite,
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}

const tower: Kind = (ctx) => {
  const T = ctx.three;
  const { scene } = ctx;
  const data = (ctx.data ?? {
    beats: [],
    stages: [],
    domains: [],
    nodes: [],
    edges: [],
  }) as TowerData;
  const n = Math.max(2, data.stages.length);
  const nd = Math.max(1, data.domains.length);
  const disposers: (() => void)[] = [];

  // Where each capability sits: on its area's spoke at its rung's floor, fanned out when several
  // share a cell.
  const cell = new Map<string, number>();
  const pos = data.nodes.map((nd0) => {
    const key = `${nd0.d}:${nd0.s}`;
    const k = cell.get(key) ?? 0;
    cell.set(key, k + 1);
    const a = ((nd0.d + 0.5) / nd) * Math.PI * 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.07;
    const r = R + (k % 3) * 0.55 - 0.3;
    return new T.Vector3(Math.cos(a) * r, nd0.s * FLOOR + (k % 2) * 0.18, Math.sin(a) * r);
  });
  const colours = data.domains.map((d) => new T.Color(d.colour));

  // Capabilities: solid cores for picking, glows for bloom.
  const coreGeo = new T.IcosahedronGeometry(0.2, 2);
  const coreMat = new T.MeshBasicMaterial({ color: 0xffffff });
  const cores = new T.InstancedMesh(coreGeo, coreMat, Math.max(1, data.nodes.length));
  cores.count = data.nodes.length;
  const m4 = new T.Matrix4();
  const tmp = new T.Color();
  data.nodes.forEach((_, i) => {
    m4.makeTranslation(pos[i] as THREE.Vector3);
    cores.setMatrixAt(i, m4);
    cores.setColorAt(i, tmp.set(0x333333));
  });
  scene.add(cores);
  disposers.push(() => {
    coreGeo.dispose();
    coreMat.dispose();
    cores.dispose();
  });

  const glowGeo = new T.BufferGeometry();
  glowGeo.setAttribute(
    "position",
    new T.BufferAttribute(new Float32Array(pos.flatMap((p) => [p.x, p.y, p.z])), 3),
  );
  const glowCol = new Float32Array(data.nodes.length * 3);
  glowGeo.setAttribute("color", new T.BufferAttribute(glowCol, 3));
  const glowMat = new T.PointsMaterial({
    size: 1.3,
    map: glowTexture(ctx),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const glows = new T.Points(glowGeo, glowMat);
  scene.add(glows);
  disposers.push(() => {
    glowGeo.dispose();
    glowMat.dispose();
  });

  // Links: a gentle arc from each need up (or across) to what needs it.
  const SEG = 16;
  const ePos: number[] = [];
  const eT: number[] = [];
  const eStage: number[] = [];
  const eCol: number[] = [];
  const eWeight: number[] = [];
  const focus = data.focus;
  /** How bright an area is drawn: all fully, or the focused one over a dim rest. */
  const weight = (d: number) => (focus === undefined || d === focus ? 1 : 0.08);
  const mid = new T.Vector3();
  const pt = new T.Vector3();
  const prev = new T.Vector3();
  for (const [a, b] of data.edges) {
    const pa = pos[a];
    const pb = pos[b];
    const na = data.nodes[a];
    const nb = data.nodes[b];
    if (!pa || !pb || !na || !nb) continue;
    // Bow inward, toward the core, so links read as one structure rather than a tangle.
    mid.copy(pa).add(pb).multiplyScalar(0.5);
    mid.set(mid.x * 0.55, mid.y + 0.4, mid.z * 0.55);
    const ca = colours[na.d] ?? tmp;
    const cb = colours[nb.d] ?? tmp;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      pt.set(0, 0, 0)
        .addScaledVector(pa, (1 - t) * (1 - t))
        .addScaledVector(mid, 2 * t * (1 - t))
        .addScaledVector(pb, t * t);
      if (i > 0) {
        for (const [p, tt] of [
          [prev, (i - 1) / SEG],
          [pt, t],
        ] as const) {
          ePos.push(p.x, p.y, p.z);
          eT.push(tt);
          eStage.push(nb.s);
          eWeight.push(Math.max(weight(na.d), weight(nb.d)));
          eCol.push(
            ca.r + (cb.r - ca.r) * tt,
            ca.g + (cb.g - ca.g) * tt,
            ca.b + (cb.b - ca.b) * tt,
          );
        }
      }
      prev.copy(pt);
    }
  }
  const edgeGeo = new T.BufferGeometry();
  edgeGeo.setAttribute("position", new T.Float32BufferAttribute(ePos, 3));
  edgeGeo.setAttribute("aT", new T.Float32BufferAttribute(eT, 1));
  edgeGeo.setAttribute("aStage", new T.Float32BufferAttribute(eStage, 1));
  edgeGeo.setAttribute("aWeight", new T.Float32BufferAttribute(eWeight, 1));
  edgeGeo.setAttribute("aColour", new T.Float32BufferAttribute(eCol, 3));
  const edgeU = { uTime: { value: 0 }, uLevel: { value: 0 } };
  const edgeMat = new T.ShaderMaterial({
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    uniforms: edgeU,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const edges = new T.LineSegments(edgeGeo, edgeMat);
  edges.frustumCulled = false;
  scene.add(edges);
  disposers.push(() => {
    edgeGeo.dispose();
    edgeMat.dispose();
  });

  // Floors: a ring per rung, named; spokes per area, named at the top.
  const ringGeo = new T.BufferGeometry();
  const ring: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    ring.push(Math.cos(a) * (R + 1.4), 0, Math.sin(a) * (R + 1.4));
  }
  ringGeo.setAttribute("position", new T.Float32BufferAttribute(ring, 3));
  const floors: { line: THREE.LineLoop; mat: THREE.LineBasicMaterial; label: THREE.Sprite }[] = [];
  data.stages.forEach((title, s) => {
    const mat = new T.LineBasicMaterial({ color: 0xf3c463, transparent: true, opacity: 0.12 });
    const line = new T.LineLoop(ringGeo, mat);
    line.position.y = s * FLOOR;
    scene.add(line);
    const t = textSprite(T, `${s + 1}  ${title}`, "#f3e3bd", 0.34);
    t.sprite.center.set(0, 0.5);
    t.sprite.position.set(R + 1.7, s * FLOOR, 0);
    scene.add(t.sprite);
    floors.push({ line, mat, label: t.sprite });
    disposers.push(() => {
      mat.dispose();
      t.dispose();
    });
  });
  disposers.push(() => ringGeo.dispose());

  const top = (n - 1) * FLOOR;
  const spokeGeo = new T.BufferGeometry();
  const spoke: number[] = [];
  const spokeCol: number[] = [];
  data.domains.forEach((d, i) => {
    const a = ((i + 0.5) / nd) * Math.PI * 2;
    const c = colours[i] ?? tmp;
    spoke.push(Math.cos(a) * R, -0.4, Math.sin(a) * R, Math.cos(a) * R, top + 0.6, Math.sin(a) * R);
    spokeCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    const t = textSprite(T, d.title, d.colour, 0.34, 500);
    t.sprite.position.set(Math.cos(a) * (R + 0.2), top + 1.0, Math.sin(a) * (R + 0.2));
    scene.add(t.sprite);
    disposers.push(t.dispose);
  });
  spokeGeo.setAttribute("position", new T.Float32BufferAttribute(spoke, 3));
  spokeGeo.setAttribute("color", new T.Float32BufferAttribute(spokeCol, 3));
  const spokeMat = new T.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.16,
  });
  scene.add(new T.LineSegments(spokeGeo, spokeMat));
  disposers.push(() => {
    spokeGeo.dispose();
    spokeMat.dispose();
  });

  // The core: power rising through the tower as the climb goes on.
  const beamGeo = new T.CylinderGeometry(0.09, 0.09, 1, 16, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beamMat = new T.MeshBasicMaterial({
    color: new T.Color("#f3c463").multiplyScalar(1.6),
    transparent: true,
    opacity: 0.85,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const beam = new T.Mesh(beamGeo, beamMat);
  scene.add(beam);
  const headMat = new T.SpriteMaterial({
    map: glowTexture(ctx),
    color: new T.Color("#ffd98a"),
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const head = new T.Sprite(headMat);
  head.scale.setScalar(2.2);
  scene.add(head);
  disposers.push(() => {
    beamGeo.dispose();
    beamMat.dispose();
    headMat.dispose();
  });

  const at = (i: number) => i / (n - 1);
  const target = new T.Vector3();
  const pose = (p: number): View => {
    const level = Math.min(n - 1, p * (n - 1));
    if (focus !== undefined) {
      // Stay outside the focused spoke, swinging a little either side of it as the climb rises.
      const a = ((focus + 0.5) / nd) * Math.PI * 2;
      const angle = Math.PI / 2 - a + Math.sin(p * Math.PI * 2) * 0.35;
      const out = ramp(p, 0.86, 1);
      target.set(
        Math.cos(a) * R * 0.55,
        level * FLOOR * (1 - out) + (top / 2) * out,
        Math.sin(a) * R * 0.55,
      );
      const dist = 14 + out * 7;
      return {
        position: [
          target.x + Math.sin(angle) * dist,
          target.y + 2 + out * 3,
          target.z + Math.cos(angle) * dist,
        ],
        target: [target.x, target.y, target.z],
        near: 3,
        far: 60,
      };
    }
    const out = ramp(p, 0.86, 1);
    const angle = 0.9 + p * 4.4;
    const dist = 12.5 + out * 9;
    target.set(0, level * FLOOR * (1 - out) + (top / 2) * out, 0);
    return {
      position: [
        target.x + Math.sin(angle) * dist,
        target.y + 2.6 + out * 4,
        target.z + Math.cos(angle) * dist,
      ],
      target: [target.x, target.y, target.z],
      near: 3,
      far: 60,
    };
  };

  return {
    view: pose(0),
    beats: data.beats.map((b, i) => ({ ...b, at: at(i) })),
    pose,
    update(time, _dt, p) {
      const level = p * (n - 1);
      edgeU.uTime.value = time;
      edgeU.uLevel.value = level;
      data.nodes.forEach((node, i) => {
        const on = ramp(level, node.s - 0.7, node.s);
        const c = colours[node.d] ?? tmp;
        const w = weight(node.d);
        const k = (0.18 + on * 0.82) * (0.35 + 0.65 * w);
        cores.setColorAt(i, tmp.copy(c).multiplyScalar(k * (1 + on * 0.6)));
        const glow = on * (0.75 + 0.25 * Math.sin(time * 1.7 + i * 2.3)) * 1.4 * w;
        glowCol[i * 3] = c.r * glow;
        glowCol[i * 3 + 1] = c.g * glow;
        glowCol[i * 3 + 2] = c.b * glow;
      });
      if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
      (glowGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      floors.forEach((f, s) => {
        const on = ramp(level, s - 0.7, s);
        f.mat.opacity = 0.08 + on * 0.3;
        (f.label.material as THREE.SpriteMaterial).opacity = 0.35 + on * 0.65;
      });
      const h = Math.max(0.05, Math.min(level, n - 1) * FLOOR + 0.3);
      beam.scale.set(1, h, 1);
      head.position.set(0, h, 0);
      head.scale.setScalar(2 + Math.sin(time * 2) * 0.2);
    },
    pick(ray) {
      const hit = ray.intersectObject(cores, false)[0];
      const node = hit?.instanceId !== undefined ? data.nodes[hit.instanceId] : undefined;
      if (!node) return undefined;
      const area = data.domains[node.d]?.title ?? "";
      const rung = data.stages[node.s] ?? "";
      const inv = node.inventions
        ? ` · ${node.inventions} invention${node.inventions > 1 ? "s" : ""}`
        : "";
      return {
        label: node.title,
        detail: `${area} · ${rung}${inv}`,
        href: `/capabilities/${node.id}`,
      };
    },
    dispose() {
      for (const f of disposers) f();
    },
  };
};

export default tower;
