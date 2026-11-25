/**
 * The workshop every machine is built in: a shared set of materials, geometry helpers, and the
 * bookkeeping that lets a shape say which parts fly into place, which parts spin and which parts
 * move, so the kind can assemble it, run it and copy it into a fleet without knowing what it is.
 *
 * Units are free; a shape says how big it is (Model.size) and the kind frames the camera on that.
 * The ground, where there is one, is y = 0.
 */
import type * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { KindContext } from "../../types.ts";
import { glowTexture } from "../bodies.ts";
import { rng } from "../particles.ts";

/** 0 before a, 1 after b, smooth between. */
export const ramp = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** Fast at first, settling at the end: a part snapping into place. */
export const settle = (x: number) => 1 - (1 - clamp01(x)) ** 3;

export type Vec = [number, number, number];

/** Where the machine stands: outdoors at dusk, on a lit factory floor, or in space. */
export type Setting = "ground" | "floor" | "space";

/** How the fleet is laid out at the end of the story. */
export interface Layout {
  /** grid: copies on the ground; volume: spread through a slab of air or space; line: along an
   * axis, both ways from the machine. */
  kind: "grid" | "volume" | "line";
  /** Between neighbours, along x and z (or along the axis, for a line). */
  spacing: number | [number, number];
  /** Most copies, at full detail. */
  count: number;
  /** Random offset, as a share of the spacing. */
  jitter?: number;
  /** Turn about y: all the same, any way, or up to this many radians either side. */
  yaw?: "same" | "random" | number;
  /** volume: the y range copies spread through. */
  height?: [number, number];
  /** volume: random tilt, radians. */
  tumble?: number;
  /** Random size range. */
  scale?: [number, number];
  /** line: the axis. */
  axis?: Vec;
}

export interface Model {
  /** The assembled machine, standing at the origin. */
  root: THREE.Group;
  /** Radius of a sphere round the assembled machine, and where it is centred. */
  size: number;
  centre: Vec;
  setting: Setting;
  layout: Layout;
  /** Azimuth and elevation of the close shots, radians. Azimuth 0 looks from +x, PI/2 from +z. */
  look?: [number, number];
  /** Elevation of the last, far shot, radians. */
  lookFar?: number;
  /** How big the machine is at the very start, when that differs (a sail still furled). */
  start?: number;
  /** Called every frame. run: 0 still to 1 at full work; p: the story's progress. */
  update(time: number, dt: number, run: number, p: number): void;
  dispose?(): void;
}

export interface Part {
  obj: THREE.Object3D;
  rest: THREE.Vector3;
  restQ: THREE.Quaternion;
  from: THREE.Vector3;
  turn: THREE.Euler;
  order: number;
}

/** One instance of an instanced mesh, flying home like a part. */
export interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  from: THREE.Vector3;
  turn: THREE.Euler;
  order: number;
}

/** For a ShaderMaterial that may be drawn instanced (every fleet copy is): the vertex's local
 * position, with the instance's matrix applied when there is one. */
export const LOCAL = /* glsl */ `
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
`;

export interface Materials {
  /** White painted metal: towers, robot links, housings. */
  paint: THREE.MeshStandardMaterial;
  /** Bright machined steel. */
  steel: THREE.MeshStandardMaterial;
  /** Brushed aluminium. */
  alu: THREE.MeshStandardMaterial;
  /** Dark anodised metal, graphite. */
  dark: THREE.MeshStandardMaterial;
  /** Near black: rubber, cable, gaskets. */
  rubber: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  /** Clear, faintly reflective. */
  glass: THREE.MeshPhysicalMaterial;
  /** The record's colour, lit from within: bloom catches it. For small lamps. */
  accent: THREE.MeshStandardMaterial;
  /** The same light, softer: for strips and rings, which would bloom too wide at full strength. */
  strip: THREE.MeshStandardMaterial;
  /** The record's colour as paint, not light. */
  trim: THREE.MeshStandardMaterial;
  /** A small white lamp. */
  lamp: THREE.MeshStandardMaterial;
}

export interface Kit {
  T: typeof THREE;
  ctx: KindContext;
  /** 0.3 on software renderers, 1 on GPUs. */
  detail: number;
  /** The record's colour in linear light. */
  accent: THREE.Color;
  /** How fast the machine's main motion runs, from params.spin. */
  speed: number;
  /** Toward the key light, once the stage has set it. */
  sun: THREE.Vector3;
  /** 1 close up, lower as the fleet grows: hundreds of glowing copies would bloom into a haze, so
   * every glow is multiplied by this. The kind sets it each frame. */
  fade: number;
  rand: () => number;
  m: Materials;
  parts: Part[];
  slots: Slot[];
  /** Curve segments, scaled by detail. */
  seg(n: number, min?: number): number;
  /** A count, scaled by detail. */
  count(n: number, min?: number): number;
  /** Track anything with dispose() for the end. */
  keep<X extends { dispose(): void }>(x: X): X;
  /** A mesh, placed, added to a parent; its geometry is kept for disposal. */
  mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D,
    at?: Vec,
    rot?: Vec,
  ): THREE.Mesh;
  group(parent: THREE.Object3D, at?: Vec, rot?: Vec): THREE.Group;
  box(w: number, h: number, d: number, r?: number): THREE.BufferGeometry;
  cyl(rTop: number, rBottom: number, h: number, seg?: number, open?: boolean): THREE.BufferGeometry;
  /** A surface of revolution about y from [radius, y] pairs, rings bottom to top. */
  lathe(profile: [number, number][], seg?: number): THREE.BufferGeometry;
  tube(
    points: Vec[],
    radius: number,
    seg?: number,
    radial?: number,
    closed?: boolean,
  ): THREE.BufferGeometry;
  /** A standard material with its own colour, kept for disposal. */
  std(o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  /** A canvas texture drawn once. */
  canvas(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D) => void,
    srgb?: boolean,
  ): THREE.CanvasTexture;
  /** A soft additive glow in a colour, as a sprite. */
  glow(
    colour: THREE.Color,
    size: number,
    parent: THREE.Object3D,
    at?: Vec,
    opacity?: number,
  ): THREE.Sprite;
  /** A dark soft disc under the machine, standing in for a shadow. */
  shadow(rx: number, rz: number, parent: THREE.Object3D, at?: Vec, opacity?: number): THREE.Mesh;
  /** The part starts displaced by `from` (in its parent's frame) and flies home as the machine
   * assembles. Call after the part is placed at rest. */
  part(obj: THREE.Object3D, from: Vec, turn?: Vec, order?: number): void;
  /** One instance of an instanced mesh flies home like a part. Call after its matrix is set at rest. */
  partAt(mesh: THREE.InstancedMesh, index: number, from: Vec, turn?: Vec, order?: number): void;
  /** Mark an object that turns about one of its own axes, so each fleet copy turns at its own phase. */
  spinner(obj: THREE.Object3D, axis: "x" | "y" | "z"): void;
  /** Mark an object whose pose changes as the machine works, so the fleet copies follow it. */
  live(obj: THREE.Object3D): void;
  /** Leave an object out of the fleet (particles, small details). */
  solo(obj: THREE.Object3D): void;
  dispose(): void;
}

export function makeKit(ctx: KindContext): Kit {
  const T = ctx.three;
  const detail = ctx.detail;
  const bin: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    bin.push(x);
    return x;
  };
  const accent = new T.Color(ctx.colour);
  const raw = Number(ctx.params.spin);
  const spin = Number.isFinite(raw) ? clamp01(raw) : 0.4;
  const std = (o: THREE.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial(o));
  const m: Materials = {
    paint: std({ color: "#cfccc6", roughness: 0.5, metalness: 0.05 }),
    steel: std({ color: "#c9ccd1", roughness: 0.22, metalness: 1 }),
    alu: std({ color: "#aab0b8", roughness: 0.38, metalness: 0.9 }),
    dark: std({ color: "#2b2f36", roughness: 0.5, metalness: 0.6 }),
    rubber: std({ color: "#121316", roughness: 0.85, metalness: 0 }),
    copper: std({ color: "#d07a3c", roughness: 0.28, metalness: 1 }),
    gold: std({ color: "#e0b24f", roughness: 0.25, metalness: 1 }),
    glass: keep(
      new T.MeshPhysicalMaterial({
        color: "#dfeaf2",
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    ),
    accent: std({ color: "#111111", emissive: accent, emissiveIntensity: 3, roughness: 0.4 }),
    strip: std({ color: "#111111", emissive: accent, emissiveIntensity: 1.3, roughness: 0.4 }),
    trim: std({ color: accent, roughness: 0.4, metalness: 0.3 }),
    lamp: std({ color: "#ffffff", emissive: "#fff4e6", emissiveIntensity: 4 }),
  };
  const parts: Part[] = [];
  const slots: Slot[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => keep(g);
  const place = (o: THREE.Object3D, at?: Vec, rot?: Vec) => {
    if (at) o.position.set(...at);
    if (rot) o.rotation.set(...rot);
  };

  const kit: Kit = {
    T,
    ctx,
    detail,
    accent,
    speed: 0.15 + 1.85 * spin,
    sun: new T.Vector3(0, 1, 0),
    fade: 1,
    rand: rng(7),
    m,
    parts,
    slots,
    seg: (n, min = 6) => Math.max(min, Math.round(n * (0.45 + 0.55 * detail))),
    count: (n, min = 1) => Math.max(min, Math.round(n * detail)),
    keep,
    mesh(g, mat, parent, at, rot) {
      const x = new T.Mesh(geo(g), mat);
      place(x, at, rot);
      parent.add(x);
      return x;
    },
    group(parent, at, rot) {
      const g = new T.Group();
      place(g, at, rot);
      parent.add(g);
      return g;
    },
    box(w, h, d, r = 0) {
      if (r <= 0) return geo(new T.BoxGeometry(w, h, d));
      return geo(
        new RoundedBoxGeometry(w, h, d, detail < 1 ? 1 : 2, Math.min(r, w / 2, h / 2, d / 2)),
      );
    },
    cyl(rTop, rBottom, h, seg = 32, open = false) {
      return geo(new T.CylinderGeometry(rTop, rBottom, h, kit.seg(seg), 1, open));
    },
    lathe(profile, seg = 48) {
      const s = kit.seg(seg, 8);
      const rings = profile.length;
      const pos = new Float32Array(rings * (s + 1) * 3);
      const uv = new Float32Array(rings * (s + 1) * 2);
      for (let j = 0; j < rings; j++) {
        const [r, y] = profile[j] as [number, number];
        for (let i = 0; i <= s; i++) {
          const a = (i / s) * Math.PI * 2;
          const k = j * (s + 1) + i;
          pos[k * 3] = Math.sin(a) * r;
          pos[k * 3 + 1] = y;
          pos[k * 3 + 2] = Math.cos(a) * r;
          uv[k * 2] = i / s;
          uv[k * 2 + 1] = j / Math.max(1, rings - 1);
        }
      }
      const idx: number[] = [];
      for (let j = 0; j < rings - 1; j++) {
        for (let i = 0; i < s; i++) {
          const a = j * (s + 1) + i;
          const b = a + 1;
          const c = a + s + 2;
          const d = a + s + 1;
          idx.push(a, b, d, c, d, b);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(pos, 3));
      g.setAttribute("uv", new T.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return geo(g);
    },
    tube(points, radius, seg = 48, radial = 8, closed = false) {
      const curve = new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(...p)),
        closed,
        "catmullrom",
        0.2,
      );
      return geo(
        new T.TubeGeometry(curve, kit.seg(seg), radius, Math.max(4, kit.seg(radial, 4)), closed),
      );
    },
    std,
    canvas(w, h, draw, srgb = true) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      draw(c.getContext("2d") as CanvasRenderingContext2D);
      const t = keep(new T.CanvasTexture(c));
      if (srgb) t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    },
    glow(colour, size, parent, at, opacity = 1) {
      const mat = keep(
        new T.SpriteMaterial({
          map: glowTexture(ctx),
          color: colour,
          blending: T.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity,
        }),
      );
      const s = new T.Sprite(mat);
      s.scale.setScalar(size);
      place(s, at);
      parent.add(s);
      return s;
    },
    shadow(rx, rz, parent, at = [0, 0.005, 0], opacity = 0.75) {
      const mat = keep(
        new T.MeshBasicMaterial({
          color: "#000000",
          alphaMap: shadowMap(),
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      );
      const x = kit.mesh(new T.PlaneGeometry(rx * 2, rz * 2), mat, parent, at, [
        -Math.PI / 2,
        0,
        0,
      ]);
      x.renderOrder = -1;
      return x;
    },
    part(obj, from, turn = [0, 0, 0], order = parts.length + slots.length) {
      parts.push({
        obj,
        rest: obj.position.clone(),
        restQ: obj.quaternion.clone(),
        from: new T.Vector3(...from),
        turn: new T.Euler(...turn),
        order,
      });
    },
    partAt(mesh, index, from, turn = [0, 0, 0], order = parts.length + slots.length) {
      const mat = new T.Matrix4();
      mesh.getMatrixAt(index, mat);
      const pos = new T.Vector3();
      const quat = new T.Quaternion();
      const scale = new T.Vector3();
      mat.decompose(pos, quat, scale);
      slots.push({
        mesh,
        index,
        pos,
        quat,
        scale,
        from: new T.Vector3(...from),
        turn: new T.Euler(...turn),
        order,
      });
    },
    spinner(obj, axis) {
      obj.userData.spin = axis;
    },
    live(obj) {
      obj.userData.live = true;
    },
    solo(obj) {
      obj.userData.solo = true;
    },
    dispose() {
      for (const x of bin) x.dispose();
      bin.length = 0;
    },
  };

  let shadowTex: THREE.Texture | undefined;
  function shadowMap() {
    shadowTex ??= kit.canvas(
      128,
      128,
      (g) => {
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, "rgb(255,255,255)");
        r.addColorStop(0.45, "rgb(150,150,150)");
        r.addColorStop(1, "rgb(0,0,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, 128, 128);
      },
      false,
    );
    return shadowTex;
  }
  return kit;
}

/** Moves every part between its exploded place (a = 0) and home (a = 1), one after another.
 * Call once the shape is built; the result takes a. */
export function assembler(kit: Kit): (a: number) => void {
  const { T } = kit;
  const q = new T.Quaternion();
  const e = new T.Euler();
  const p = new T.Vector3();
  const mat = new T.Matrix4();
  const touched = new Set<THREE.InstancedMesh>();
  const all = [
    ...kit.parts.map((x) => ({
      order: x.order,
      go(off: number) {
        x.obj.position.copy(x.rest).addScaledVector(x.from, off);
        e.set(x.turn.x * off, x.turn.y * off, x.turn.z * off);
        x.obj.quaternion.copy(x.restQ).multiply(q.setFromEuler(e));
      },
    })),
    ...kit.slots.map((x) => ({
      order: x.order,
      go(off: number) {
        p.copy(x.pos).addScaledVector(x.from, off);
        e.set(x.turn.x * off, x.turn.y * off, x.turn.z * off);
        q.setFromEuler(e).premultiply(x.quat);
        x.mesh.setMatrixAt(x.index, mat.compose(p, q, x.scale));
        touched.add(x.mesh);
      },
    })),
  ].sort((x, y) => x.order - y.order);
  // Orders are a timeline: each part starts when its order comes round, and takes `span` to land.
  const lo = all.length ? (all[0] as (typeof all)[number]).order : 0;
  const hi = all.length ? (all[all.length - 1] as (typeof all)[number]).order : 1;
  const span = 0.4;
  let last = -1;
  return (a) => {
    if (a === last) return;
    last = a;
    for (const x of all) {
      const start = hi > lo ? ((x.order - lo) / (hi - lo)) * (1 - span) : 0;
      x.go(1 - settle((a - start) / span));
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    touched.clear();
  };
}
