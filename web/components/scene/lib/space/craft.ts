/**
 * The things built in space, modelled just well enough to read at a glance up close: a station, a
 * propellant depot, a collector, a mass driver's coil track, a rocket. Each is a group of a few
 * lit meshes (sized about 1 across; scale it), with its geometries and materials kept in a bag so
 * the kind can dispose them. They share one set of materials per kind of surface.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";

/** Everything a kind made, disposed together. */
export class Bag {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose() {
    for (const x of this.items) x.dispose();
    this.items.length = 0;
  }
}

export interface Materials {
  hull: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  film: THREE.MeshStandardMaterial;
  radiator: THREE.MeshStandardMaterial;
  tank: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  accent: THREE.MeshBasicMaterial;
  /** How hot the radiators glow, 0 to 1. */
  setHeat(h: number): void;
}

export function materials(ctx: KindContext, bag: Bag): Materials {
  const T = ctx.three;
  const m = {
    hull: bag.add(
      new T.MeshStandardMaterial({ color: "#d9dde4", metalness: 0.35, roughness: 0.45 }),
    ),
    dark: bag.add(new T.MeshStandardMaterial({ color: "#3a3f48", metalness: 0.6, roughness: 0.5 })),
    panel: bag.add(
      new T.MeshStandardMaterial({
        color: "#1b2f6b",
        metalness: 0.7,
        roughness: 0.28,
        emissive: "#0d1d4a",
        emissiveIntensity: 0.6,
        side: T.DoubleSide,
      }),
    ),
    film: bag.add(
      new T.MeshStandardMaterial({
        color: "#f4dca0",
        metalness: 0.9,
        roughness: 0.18,
        emissive: "#c8963c",
        emissiveIntensity: 0.55,
        side: T.DoubleSide,
      }),
    ),
    radiator: bag.add(
      new T.MeshStandardMaterial({
        color: "#e8e6e2",
        metalness: 0.1,
        roughness: 0.7,
        emissive: "#ff3a12",
        emissiveIntensity: 0,
        side: T.DoubleSide,
      }),
    ),
    tank: bag.add(
      new T.MeshStandardMaterial({ color: "#eef3f8", metalness: 0.25, roughness: 0.35 }),
    ),
    glow: bag.add(new T.MeshBasicMaterial({ color: new T.Color("#fff2d8").multiplyScalar(4) })),
    accent: bag.add(new T.MeshBasicMaterial({ color: new T.Color(ctx.colour).multiplyScalar(3) })),
  };
  return {
    ...m,
    setHeat(h) {
      m.radiator.emissiveIntensity = h * 1.1;
      m.radiator.color.setRGB(0.85 - h * 0.45, 0.85 - h * 0.65, 0.84 - h * 0.7);
    },
  };
}

/** Shared unit geometries, scaled per mesh. */
export interface Shapes {
  box: THREE.BoxGeometry;
  cyl: THREE.CylinderGeometry;
  ball: THREE.SphereGeometry;
  hex: THREE.CylinderGeometry;
  ring: THREE.TorusGeometry;
  cone: THREE.ConeGeometry;
}

export function shapes(ctx: KindContext, bag: Bag): Shapes {
  const T = ctx.three;
  return {
    box: bag.add(new T.BoxGeometry(1, 1, 1)),
    cyl: bag.add(new T.CylinderGeometry(0.5, 0.5, 1, 20)),
    ball: bag.add(new T.SphereGeometry(0.5, 20, 14)),
    hex: bag.add(new T.CylinderGeometry(0.5, 0.5, 1, 6)),
    ring: bag.add(new T.TorusGeometry(0.5, 0.08, 8, 24)),
    cone: bag.add(new T.ConeGeometry(0.5, 1, 20)),
  };
}

function part(
  T: typeof THREE,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number],
  scale: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new T.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  return m;
}

/** A station: a truss with modules at its middle, four solar wings and two radiators. */
export function makeStation(ctx: KindContext, s: Shapes, m: Materials): THREE.Group {
  const T = ctx.three;
  const g = new T.Group();
  const H = Math.PI / 2;
  g.add(part(T, s.box, m.dark, [0, 0, 0], [1.0, 0.025, 0.025]));
  g.add(part(T, s.cyl, m.hull, [0, 0, 0.13], [0.07, 0.26, 0.07], [H, 0, 0]));
  g.add(part(T, s.cyl, m.hull, [0, 0, -0.12], [0.06, 0.22, 0.06], [H, 0, 0]));
  g.add(part(T, s.cyl, m.hull, [0, 0.1, 0], [0.055, 0.2, 0.055]));
  g.add(part(T, s.ball, m.hull, [0, 0, 0], [0.09, 0.09, 0.09]));
  g.add(part(T, s.cyl, m.hull, [0.12, 0, 0], [0.05, 0.16, 0.05], [0, 0, H]));
  for (const x of [-0.46, -0.3, 0.3, 0.46])
    for (const z of [-1, 1]) g.add(part(T, s.box, m.panel, [x, 0, z * 0.2], [0.13, 0.004, 0.34]));
  for (const x of [-0.14, 0.18])
    g.add(part(T, s.box, m.radiator, [x, -0.1, 0], [0.12, 0.17, 0.004]));
  g.add(part(T, s.ball, m.glow, [0.5, 0, 0], [0.012, 0.012, 0.012]));
  g.add(part(T, s.ball, m.accent, [-0.5, 0, 0], [0.012, 0.012, 0.012]));
  return g;
}

/** A propellant depot: a spine, four spherical tanks, a sunshade and a tanker docked at its end. */
export function makeDepot(ctx: KindContext, s: Shapes, m: Materials): THREE.Group {
  const T = ctx.three;
  const g = new T.Group();
  g.add(part(T, s.cyl, m.dark, [0, 0, 0], [0.06, 0.9, 0.06]));
  for (const y of [-0.22, 0.12])
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      g.add(part(T, s.ball, m.tank, [Math.cos(a) * 0.12, y, Math.sin(a) * 0.12], [0.2, 0.2, 0.2]));
    }
  g.add(part(T, s.hex, m.film, [0, 0.42, 0], [0.6, 0.01, 0.6]));
  g.add(part(T, s.cyl, m.hull, [0, -0.58, 0], [0.08, 0.28, 0.08]));
  g.add(part(T, s.cone, m.dark, [0, -0.76, 0], [0.1, 0.1, 0.1], [Math.PI, 0, 0]));
  for (const x of [-1, 1]) g.add(part(T, s.box, m.panel, [x * 0.24, -0.58, 0], [0.3, 0.004, 0.1]));
  g.add(part(T, s.ball, m.accent, [0, -0.44, 0.09], [0.02, 0.02, 0.02]));
  return g;
}

/** A collector: a wide hexagon of reflective film on a light frame, a power unit at its back. */
export function makeCollector(ctx: KindContext, s: Shapes, m: Materials): THREE.Group {
  const T = ctx.three;
  const g = new T.Group();
  g.add(part(T, s.hex, m.film, [0, 0, 0], [1, 0.004, 1]));
  for (let i = 0; i < 3; i++)
    g.add(part(T, s.box, m.dark, [0, -0.004, 0], [1.0, 0.006, 0.012], [0, (i * Math.PI) / 3, 0]));
  g.add(part(T, s.cyl, m.hull, [0, -0.05, 0], [0.06, 0.1, 0.06]));
  g.add(part(T, s.box, m.radiator, [0, -0.12, 0], [0.22, 0.004, 0.22]));
  return g;
}

/** A coil of a mass driver's track, as instances along a line from the origin up +x. */
export function makeTrack(
  ctx: KindContext,
  s: Shapes,
  m: Materials,
  bag: Bag,
  coils: number,
  length: number,
  size: number,
): THREE.InstancedMesh {
  const T = ctx.three;
  const mesh = new T.InstancedMesh(s.ring, m.dark, coils);
  const mat = new T.Matrix4();
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
  for (let i = 0; i < coils; i++) {
    mat.compose(
      new T.Vector3((i / (coils - 1)) * length, size * 0.6, 0),
      q,
      new T.Vector3(size, size, size),
    );
    mesh.setMatrixAt(i, mat);
  }
  bag.add({ dispose: () => mesh.dispose() });
  return mesh;
}

/** A rocket standing up +y, about 1 tall. */
export function makeRocket(ctx: KindContext, s: Shapes, m: Materials): THREE.Group {
  const T = ctx.three;
  const g = new T.Group();
  g.add(part(T, s.cyl, m.hull, [0, 0.42, 0], [0.09, 0.84, 0.09]));
  g.add(part(T, s.cone, m.hull, [0, 0.92, 0], [0.09, 0.16, 0.09]));
  g.add(part(T, s.box, m.dark, [0, 0.1, 0], [0.24, 0.12, 0.012]));
  g.add(part(T, s.box, m.dark, [0, 0.1, 0], [0.012, 0.12, 0.24]));
  return g;
}
