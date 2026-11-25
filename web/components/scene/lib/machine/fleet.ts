/**
 * The machine multiplied. Every mesh of the assembled machine becomes one instanced mesh holding
 * all its copies, so a fleet of hundreds costs a draw call per part, not per machine. Copies are
 * ordered nearest first and grow in as the story asks for more of them. Parts marked as spinners
 * turn in each copy at its own phase; parts marked live follow the machine's own motion.
 */
import type * as THREE from "three";
import type { Kit, Layout } from "./kit.ts";

export interface Fleet {
  group: THREE.Group;
  /** How many copies there can be. */
  max: number;
  /** How far from the machine the v-th nearest copy stands. */
  reach(v: number): number;
  /** Show this many copies (fractional: the newest grow in). */
  show(v: number): void;
  /** Follow the machine's moving parts; call after the machine has moved. */
  update(): void;
  dispose(): void;
}

interface Copy {
  geo: THREE.BufferGeometry;
  mat: THREE.Material | THREE.Material[];
  mesh: THREE.InstancedMesh;
  /** Pose relative to the machine's root, or per inner instance for a mesh that is itself instanced. */
  rel: THREE.Matrix4[];
  source: THREE.Mesh;
  spin?: { obj: THREE.Object3D; axis: "x" | "y" | "z" };
  live: boolean;
}

/** The most instances one mesh of the fleet may hold. */
const CAP = 60000;

export function makeFleet(kit: Kit, root: THREE.Group, layout: Layout, fwd: THREE.Vector2): Fleet {
  const { T } = kit;
  const r = kit.rand;
  const n = kit.count(layout.count, 1);
  const [sx, sz] =
    typeof layout.spacing === "number" ? [layout.spacing, layout.spacing] : layout.spacing;
  const jitter = layout.jitter ?? 0.2;

  // Places, nearest first. Copies behind the far camera are worth less than those ahead of it.
  type Place = {
    p: THREE.Vector3;
    yaw: number;
    tilt: THREE.Euler;
    s: number;
    phase: number;
    d: number;
  };
  const places: Place[] = [];
  const yawOf = () =>
    layout.yaw === "random"
      ? r() * Math.PI * 2
      : typeof layout.yaw === "number"
        ? (r() * 2 - 1) * layout.yaw
        : 0;
  const scaleOf = () =>
    layout.scale ? layout.scale[0] + r() * (layout.scale[1] - layout.scale[0]) : 1;
  const tumble = layout.tumble ?? 0;
  const tiltOf = () => new T.Euler((r() * 2 - 1) * tumble, 0, (r() * 2 - 1) * tumble);
  if (layout.kind === "line") {
    const axis = new T.Vector3(...(layout.axis ?? [0, 1, 0])).normalize();
    for (let i = 1; places.length < n; i++) {
      for (const side of [1, -1]) {
        if (places.length >= n) break;
        const p = axis.clone().multiplyScalar(side * i * sx * (1 + (r() * 2 - 1) * jitter));
        places.push({
          p,
          yaw: yawOf(),
          tilt: tiltOf(),
          s: scaleOf(),
          phase: r() * Math.PI * 2,
          d: p.length(),
        });
      }
    }
  } else {
    const side = Math.ceil(Math.sqrt(n * 4.2) / 2) + 1;
    const [y0, y1] = layout.height ?? [0, 0];
    const dir = new T.Vector2();
    for (let gx = -side; gx <= side; gx++) {
      for (let gz = -side; gz <= side; gz++) {
        if (gx === 0 && gz === 0) continue;
        const x = gx * sx + (r() * 2 - 1) * jitter * sx;
        const z = gz * sz + (r() * 2 - 1) * jitter * sz;
        const y = y0 + r() * (y1 - y0);
        dir.set(x, z);
        const flat = dir.length();
        const ahead = flat > 0 ? dir.dot(fwd) / flat : 0;
        // The first few copies stand round the machine; the rest stretch away ahead of the camera.
        const d = flat * (1 - 0.5 * ahead) + (layout.kind === "volume" ? Math.abs(y) * 0.3 : 0);
        places.push({
          p: new T.Vector3(x, y, z),
          yaw: yawOf(),
          tilt: tiltOf(),
          s: scaleOf(),
          phase: r() * Math.PI * 2,
          d,
        });
      }
    }
    places.sort((a, b) => a.d - b.d);
    places.length = Math.min(places.length, n);
  }
  const max = places.length;
  const reachOf = places.map((x) => Math.hypot(x.p.x, x.p.z, layout.kind === "line" ? x.p.y : 0));
  for (let i = 1; i < reachOf.length; i++)
    reachOf[i] = Math.max(reachOf[i] as number, reachOf[i - 1] as number);

  // Each copy's own frame: where it stands, which way it faces, how big it is.
  const frames = places.map(() => new T.Matrix4());
  const q = new T.Quaternion();
  const e = new T.Euler();
  const sv = new T.Vector3();
  const frame = (i: number, grow: number) => {
    const x = places[i] as Place;
    e.set(x.tilt.x, x.yaw, x.tilt.z, "YXZ");
    q.setFromEuler(e);
    const s = x.s * Math.max(1e-4, grow);
    sv.set(s, s, s);
    (frames[i] as THREE.Matrix4).compose(x.p, q, sv);
  };

  // One instanced mesh per mesh of the machine.
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const group = new T.Group();
  const copies: Copy[] = [];
  root.traverse((o) => {
    const src = o as THREE.Mesh;
    if (!src.isMesh || src.userData.solo) return;
    let spin: Copy["spin"];
    let live = false;
    for (let a: THREE.Object3D | null = o; a && a !== root.parent; a = a.parent) {
      if (a.userData.solo) return;
      if (a.userData.spin && !spin) spin = { obj: a, axis: a.userData.spin };
      if (a.userData.live) live = true;
    }
    const base = inv.clone().multiply(src.matrixWorld);
    const inner = src as THREE.InstancedMesh;
    const rel: THREE.Matrix4[] = [];
    if (inner.isInstancedMesh) {
      for (let j = 0; j < inner.count; j++) {
        const m = new T.Matrix4();
        inner.getMatrixAt(j, m);
        rel.push(base.clone().multiply(m));
      }
    } else rel.push(base);
    const total = Math.min(CAP, rel.length * max);
    if (total < rel.length) return;
    const mesh = new T.InstancedMesh(src.geometry, src.material, total);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = src.renderOrder;
    group.add(mesh);
    copies.push({ geo: src.geometry, mat: src.material, mesh, rel, source: src, spin, live });
  });

  const m = new T.Matrix4();
  const relNow = new T.Matrix4();
  const innerM = new T.Matrix4();
  const spinM = new T.Matrix4();
  const write = (c: Copy, i: number, rel: THREE.Matrix4, j: number) => {
    const k = i * c.rel.length + j;
    if (k >= c.mesh.instanceMatrix.count) return;
    m.multiplyMatrices(frames[i] as THREE.Matrix4, rel);
    c.mesh.setMatrixAt(k, m);
  };
  const writeStatic = (c: Copy, lo: number, hi: number) => {
    for (let i = lo; i < hi; i++)
      for (let j = 0; j < c.rel.length; j++) write(c, i, c.rel[j] as THREE.Matrix4, j);
    c.mesh.instanceMatrix.needsUpdate = true;
  };

  let shown = 0;
  let visible = 0;
  const band = (v: number) => Math.max(1, v * 0.18);
  const scaleAt = (v: number, i: number) => Math.min(1, Math.max(0, (v - i) / band(v)));

  function moving(c: Copy, hi: number) {
    if (c.spin) {
      const s = c.spin.obj;
      relNow.multiplyMatrices(inv, s.matrixWorld);
      innerM.copy(s.matrixWorld).invert().multiply(c.source.matrixWorld);
      for (let i = 0; i < hi; i++) {
        const ph = (places[i] as Place).phase;
        if (c.spin.axis === "x") spinM.makeRotationX(ph);
        else if (c.spin.axis === "y") spinM.makeRotationY(ph);
        else spinM.makeRotationZ(ph);
        m.multiplyMatrices(relNow, spinM).multiply(innerM);
        m.premultiply(frames[i] as THREE.Matrix4);
        if (c.rel.length === 1) c.mesh.setMatrixAt(i, m);
      }
    } else {
      relNow.multiplyMatrices(inv, c.source.matrixWorld);
      for (let i = 0; i < hi; i++) if (c.rel.length === 1) write(c, i, relNow, 0);
    }
    c.mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    max,
    reach: (v) =>
      v <= 0 || !max ? 0 : (reachOf[Math.min(max - 1, Math.max(0, Math.ceil(v) - 1))] as number),
    show(v) {
      v = Math.min(max, Math.max(0, v));
      if (v === shown) return;
      const lo = Math.max(0, Math.floor(Math.min(v - band(v), shown - band(shown))) - 1);
      const hi = Math.min(max, Math.ceil(Math.max(v, shown)));
      for (let i = lo; i < hi; i++) frame(i, scaleAt(v, i));
      visible = Math.ceil(v);
      for (const c of copies) {
        c.mesh.count = Math.min(c.mesh.instanceMatrix.count, visible * c.rel.length);
        if (!c.spin && !c.live) writeStatic(c, lo, hi);
        else if (c.rel.length > 1) writeStatic(c, lo, hi);
      }
      shown = v;
    },
    update() {
      if (!visible) return;
      for (const c of copies) if ((c.spin || c.live) && c.rel.length === 1) moving(c, visible);
    },
    dispose() {
      for (const c of copies) c.mesh.dispose();
    },
  };
}
