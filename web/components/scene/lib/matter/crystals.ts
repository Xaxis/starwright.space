/**
 * Atom by atom, the structures the lattice kind can draw, in units of a bond length. Each is real
 * geometry: graphene's honeycomb, a nanotube rolled from it along a chiral vector (n, m), the
 * diamond cubic (also silicon's), a close-packed metal, the ABX3 perovskite with its corner-sharing
 * octahedra, a silicate network of SiO4 tetrahedra, polyethylene's zigzag chains, a cross-beta
 * protein fibre, and hexagonal ice. Each atom also gets the order it arrives in and where it flies
 * in from, so the scene can assemble it.
 */
import { onSphere, rng } from "./common.ts";

export type Structure =
  | "nanotube"
  | "graphene"
  | "diamond"
  | "metal"
  | "perovskite"
  | "silicate"
  | "polymer"
  | "protein"
  | "ice";

/** How the crystal becomes something you can hold: a sheet, a fibre, a film or a block. */
export type Form = "sheet" | "strand" | "film" | "block";

export interface Element {
  colour: string;
  radius: number;
}

/** Bond types: 0 a lattice bond, drawn once both atoms are in place; 1 a chain bond, drawn while
 * the chain is still moving; 2 a weak bond (hydrogen), dashed. */
export type BondType = 0 | 1 | 2;

export interface Crystal {
  n: number;
  /** xyz per atom. */
  site: Float32Array;
  /** Offset from the site to where the atom starts its flight. */
  from: Float32Array;
  /** Per atom: arrival (0 to 1), element, defect (0 none, 1 vacancy, 2 displaced), seed. */
  info: Float32Array;
  /** Triples: atom i, atom j, type. */
  bonds: number[];
  elements: Element[];
  /** Atoms at the centre of an octahedron (perovskite), each with its six corners in place. */
  octa: number[];
  /** Atoms in arrival order. */
  order: number[];
  /** Half the cluster's extent and the y of its underside. */
  radius: number;
  base: number;
  /** For strands: the fibre's radius and the cluster's length along x. */
  fibre: number;
  length: number;
  form: Form;
  /** How much of the build an atom spends in flight. */
  window: number;
  jiggle: number;
  ripple: number;
  /** Where new atoms come from, for the feedstock drifting in. */
  source: [number, number, number];
}

interface Raw {
  site: number[];
  from: number[];
  el: number[];
  key: number[];
  /** Atoms that arrive with another (a water molecule's hydrogens): index of their leader, or -1. */
  lead: number[];
  bonds: number[];
}

const raw = (): Raw => ({ site: [], from: [], el: [], key: [], lead: [], bonds: [] });
const S3 = Math.sqrt(3);

function add(
  r: Raw,
  x: number,
  y: number,
  z: number,
  el: number,
  key: number,
  from: [number, number, number],
) {
  r.site.push(x, y, z);
  r.from.push(...from);
  r.el.push(el);
  r.key.push(key);
  r.lead.push(-1);
  return r.el.length - 1;
}

/** Bonds between atoms closer than a cutoff, by element pair, found on a grid. */
function bondsWithin(r: Raw, rules: [number, number, number, BondType][]) {
  const cut = Math.max(...rules.map((x) => x[2]));
  const cells = new Map<string, number[]>();
  const n = r.el.length;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let i = 0; i < n; i++) {
    const k = key(
      Math.floor((r.site[i * 3] as number) / cut),
      Math.floor((r.site[i * 3 + 1] as number) / cut),
      Math.floor((r.site[i * 3 + 2] as number) / cut),
    );
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  for (let i = 0; i < n; i++) {
    const x = r.site[i * 3] as number;
    const y = r.site[i * 3 + 1] as number;
    const z = r.site[i * 3 + 2] as number;
    const cx = Math.floor(x / cut);
    const cy = Math.floor(y / cut);
    const cz = Math.floor(z / cut);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          for (const j of cells.get(key(cx + a, cy + b, cz + c)) ?? []) {
            if (j <= i) continue;
            const d = Math.hypot(
              (r.site[j * 3] as number) - x,
              (r.site[j * 3 + 1] as number) - y,
              (r.site[j * 3 + 2] as number) - z,
            );
            const ei = r.el[i] as number;
            const ej = r.el[j] as number;
            for (const [p, q, max, type] of rules) {
              if (d < max && d > 0.2 && ((ei === p && ej === q) || (ei === q && ej === p))) {
                r.bonds.push(i, j, type);
                break;
              }
            }
          }
        }
  }
}

/** Arrival from a sort key: an even rate, so each beat adds the same share of atoms. */
function finish(
  r: Raw,
  o: Omit<Crystal, "n" | "site" | "from" | "info" | "bonds" | "order" | "octa"> & {
    octa?: number[];
  },
  defects: number,
  seed: number,
  /** Chains have kinks rather than holes: a chain atom is knocked aside, never missing. */
  holes = true,
): Crystal {
  const n = r.el.length;
  const rand = rng(seed);
  const leaders = [...Array(n).keys()].filter((i) => (r.lead[i] as number) < 0);
  leaders.sort((a, b) => (r.key[a] as number) - (r.key[b] as number));
  const born = new Float32Array(n);
  leaders.forEach((i, k) => {
    born[i] = (k / Math.max(1, leaders.length - 1)) * 0.98;
  });
  const seedOf = new Float32Array(n);
  for (const i of leaders) seedOf[i] = rand();
  for (let i = 0; i < n; i++) {
    const l = r.lead[i] as number;
    if (l >= 0) {
      born[i] = born[l] as number;
      seedOf[i] = seedOf[l] as number;
    }
  }
  // Defects: a share of the leaders is missing (a vacancy) or knocked off its site.
  const defect = new Float32Array(n);
  const site = new Float32Array(r.site);
  const want = Math.round(defects * leaders.length);
  const pool = leaders.filter((i) => !(o.octa ?? []).includes(i));
  for (let k = 0; k < want && pool.length; k++) {
    const pick = pool.splice(Math.floor(rand() * pool.length), 1)[0] as number;
    if (holes && rand() < 0.55) defect[pick] = 1;
    else {
      defect[pick] = 2;
      const [a, b, c] = onSphere(rand);
      site[pick * 3] = (site[pick * 3] as number) + a * 0.42;
      site[pick * 3 + 1] = (site[pick * 3 + 1] as number) + b * 0.42;
      site[pick * 3 + 2] = (site[pick * 3 + 2] as number) + c * 0.42;
    }
  }
  const info = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    info[i * 4] = born[i] as number;
    info[i * 4 + 1] = r.el[i] as number;
    info[i * 4 + 2] = defect[i] as number;
    info[i * 4 + 3] = seedOf[i] as number;
  }
  // A bond to a missing atom is missing too.
  const bonds: number[] = [];
  for (let k = 0; k < r.bonds.length; k += 3) {
    const i = r.bonds[k] as number;
    const j = r.bonds[k + 1] as number;
    if (defect[i] === 1 || defect[j] === 1) continue;
    bonds.push(i, j, r.bonds[k + 2] as number);
  }
  const order = [...Array(n).keys()].sort((a, b) => (born[a] as number) - (born[b] as number));
  return { ...o, n, site, from: new Float32Array(r.from), info, bonds, order, octa: o.octa ?? [] };
}

/** A flight in from above: a random direction in the upper half, some distance out. */
function fromAbove(rand: () => number, d: number, spread = 1): [number, number, number] {
  const [x, y, z] = onSphere(rand);
  const v: [number, number, number] = [x * spread, Math.abs(y) + 0.4, z * spread];
  const l = Math.hypot(...v);
  const k = (d * (0.6 + rand() * 0.8)) / l;
  return [v[0] * k, v[1] * k, v[2] * k];
}

function graphene(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(11);
  const R = 9 + 5 * detail;
  const K = Math.ceil(R / 1.2) + 2;
  for (let i = -K; i <= K; i++)
    for (let j = -K; j <= K; j++)
      for (const [bx, bz] of [
        [0, 0],
        [0, 1],
      ] as const) {
        // Lattice vectors (sqrt 3, 0) and (sqrt 3 / 2, 3 / 2); a hexagon's centre at the origin.
        const x = i * S3 + j * (S3 / 2) + bx - S3 / 2;
        const z = j * 1.5 + bz - 0.5;
        const d = Math.hypot(x, z);
        if (d > R) continue;
        add(r, x, 0, z, 0, (d / R) ** 2 + rand() * 0.12, fromAbove(rand, 9, 0.8));
      }
  bondsWithin(r, [[0, 0, 1.1, 0]]);
  return finish(
    r,
    {
      elements: [{ colour: "#aab4c8", radius: 0.27 }],
      radius: R,
      base: 0,
      fibre: 0,
      length: 0,
      form: "sheet",
      window: 0.12,
      jiggle: 0.03,
      ripple: 0.35,
      source: [0, 9, 0],
    },
    defects,
    12,
  );
}

function nanotube(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(21);
  // A (10, 5) tube: chiral, its hexagons winding round the axis.
  const n = 10;
  const m = 5;
  const a1: [number, number] = [S3, 0];
  const a2: [number, number] = [S3 / 2, 1.5];
  const ch: [number, number] = [n * a1[0] + m * a2[0], n * a1[1] + m * a2[1]];
  const C = Math.hypot(...ch);
  const cu: [number, number] = [ch[0] / C, ch[1] / C];
  const tv: [number, number] = [-cu[1], cu[0]];
  const rad = C / (2 * Math.PI);
  const L = 26 + 18 * detail;
  const K = Math.ceil((C + L) / 1.2) + 4;
  for (let i = -K; i <= K; i++)
    for (let j = -K; j <= K; j++)
      for (const [bx, bz] of [
        [0, 0],
        [0, 1],
      ] as const) {
        const px = i * a1[0] + j * a2[0] + bx;
        const pz = i * a1[1] + j * a2[1] + bz;
        const u = px * cu[0] + pz * cu[1];
        const v = px * tv[0] + pz * tv[1];
        if (u < -1e-6 || u >= C - 1e-6 || v < 0 || v >= L) continue;
        const th = (u / C) * Math.PI * 2;
        const x = v - L / 2;
        // Carbon arrives at the growing end, out of the feed gas around the catalyst.
        const [fx, fy, fz] = onSphere(rand);
        add(r, x, Math.cos(th) * rad, Math.sin(th) * rad, 0, v + rand() * 0.6, [
          fx * 4 + 5,
          fy * 6,
          fz * 6,
        ]);
      }
  bondsWithin(r, [[0, 0, 1.18, 0]]);
  return finish(
    r,
    {
      elements: [{ colour: "#aab4c8", radius: 0.25 }],
      radius: L / 2,
      base: -rad,
      fibre: rad,
      length: L,
      form: "strand",
      window: 0.1,
      jiggle: 0.025,
      ripple: 0,
      source: [L / 2 + 4, 0, 0],
    },
    defects,
    22,
  );
}

function diamond(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(31);
  // The diamond cubic: two face-centred cubic lattices, one shifted a quarter of the way along
  // the cube's diagonal. Cube edge a = 4 / sqrt 3 for a bond of 1.
  const a = 4 / S3;
  const N = 3 + Math.round(2 * detail);
  const H = 2;
  const fcc = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];
  const half = N * a;
  for (let i = -N; i < N; i++)
    for (let j = 0; j < H; j++)
      for (let k = -N; k < N; k++)
        for (const s of [0, 0.25])
          for (const f of fcc) {
            const x = (i + (f[0] as number) + s) * a;
            const y = (j + (f[1] as number) + s) * a;
            const z = (k + (f[2] as number) + s) * a;
            // Terraces: each layer a step smaller, as a surface built layer by layer looks.
            const layer = Math.round(y / (a / 4));
            const reach = half - 0.9 * a * Math.max(0, layer - 2) * 0.5;
            if (Math.abs(x) > reach || Math.abs(z) > reach) continue;
            // One at a time, row by row: a raster within each layer, as a tip would place them.
            const row = Math.round(z / (a / 2));
            const snake = row % 2 === 0 ? x : -x;
            add(r, x, y, z, 0, layer * 1e4 + row * 100 + snake, [
              rand() * 0.6 - 0.3,
              3 + rand() * 1.5,
              rand() * 0.6 - 0.3,
            ]);
          }
  // Centre the slab on the origin, its underside at the base.
  const H0 = (H * a) / 2;
  for (let i = 1; i < r.site.length; i += 3) r.site[i] = (r.site[i] as number) - H0;
  bondsWithin(r, [[0, 0, 1.1, 0]]);
  return finish(
    r,
    {
      elements: [{ colour: "#d8ecff", radius: 0.26 }],
      radius: half,
      base: -H0,
      fibre: 0,
      length: 0,
      form: "block",
      window: 0.05,
      jiggle: 0.02,
      ripple: 0,
      source: [0, 6, 0],
    },
    defects,
    32,
  );
}

function metal(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(41);
  // Face-centred cubic, the spheres touching: a = sqrt 2 for neighbours 1 apart.
  const a = Math.SQRT2;
  const R = 3.6 + 1.6 * detail;
  const N = Math.ceil(R / a) + 1;
  const fcc = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];
  for (let i = -N; i <= N; i++)
    for (let j = -N; j <= N; j++)
      for (let k = -N; k <= N; k++)
        for (const f of fcc) {
          const x = (i + (f[0] as number)) * a;
          const y = (j + (f[1] as number)) * a;
          const z = (k + (f[2] as number)) * a;
          // A truncated octahedron: the shape a small metal crystal takes.
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > R) continue;
          if (Math.abs(x) + Math.abs(y) + Math.abs(z) > R * 1.6) continue;
          // It freezes outward from a nucleus at its foot, fastest along the cube axes.
          const d = Math.hypot(x, y + R, z);
          add(
            r,
            x,
            y,
            z,
            0,
            d * (1 + 0.15 * Math.sin(Math.atan2(z, x) * 4)) + rand() * 1.2,
            fromAbove(rand, 8),
          );
        }
  return finish(
    r,
    {
      elements: [{ colour: "#c9cfdb", radius: 0.5 }],
      radius: R,
      base: -R,
      fibre: 0,
      length: 0,
      form: "block",
      window: 0.1,
      jiggle: 0.03,
      ripple: 0,
      source: [0, R + 6, 0],
    },
    defects,
    42,
  );
}

function perovskite(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(51);
  // ABX3: the B metal at the cube corners, X halides at the edge midpoints, A in each cage.
  const N = 4 + Math.round(detail);
  const NY = 3;
  const off = ((N - 1) * 2) / 2;
  const offY = ((NY - 1) * 2) / 2;
  const seen = new Set<string>();
  const octa: number[] = [];
  const layerKey = (y: number) => (y + offY) * 10 + rand() * 6;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < NY; j++)
      for (let k = 0; k < N; k++) {
        const x = i * 2 - off;
        const y = j * 2 - offY;
        const z = k * 2 - off;
        octa.push(add(r, x, y, z, 0, layerKey(y), fromAbove(rand, 8)));
        for (const [dx, dy, dz] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as const) {
          const id = `${x + dx},${y + dy},${z + dz}`;
          if (seen.has(id)) continue;
          seen.add(id);
          add(r, x + dx, y + dy, z + dz, 1, layerKey(y + dy * 0.5), fromAbove(rand, 8));
        }
        if (i < N - 1 && j < NY - 1 && k < N - 1)
          add(r, x + 1, y + 1, z + 1, 2, layerKey(y + 1), fromAbove(rand, 8));
      }
  bondsWithin(r, [[0, 1, 1.05, 0]]);
  return finish(
    r,
    {
      elements: [
        { colour: "#9fb0c8", radius: 0.26 },
        { colour: "#a77bff", radius: 0.36 },
        { colour: "#ffad5c", radius: 0.48 },
      ],
      radius: off + 1,
      base: -offY - 1,
      fibre: 0,
      length: 0,
      form: "film",
      window: 0.1,
      jiggle: 0.035,
      ripple: 0,
      source: [0, offY + 7, 0],
      octa,
    },
    defects,
    52,
  );
}

function silicate(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(61);
  // SiO4 tetrahedra joined at their corners: silicon on diamond sites, an oxygen bridging each
  // pair, bent off the line between them as in quartz and glass. Disorder is the glass.
  const a = (2 * 4) / S3;
  const N = 2 + Math.round(detail);
  const fcc = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];
  const half = (N * a) / 2;
  const disorder = 0.12 + defects * 1.4;
  const si: [number, number, number][] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++)
        for (const s of [0, 0.25])
          for (const f of fcc) {
            si.push([
              (i + (f[0] as number) + s) * a - half,
              (j + (f[1] as number) + s) * a - half,
              (k + (f[2] as number) + s) * a - half,
            ]);
          }
  const key = (y: number) => (y + half) * 3 + rand() * 4;
  const jit = (): [number, number, number] => {
    const [x, y, z] = onSphere(rand);
    const k = disorder * rand();
    return [x * k, y * k, z * k];
  };
  const siIdx = si.map(([x, y, z]) => {
    const j = jit();
    return add(r, x + j[0], y + j[1], z + j[2], 0, key(y), fromAbove(rand, 9));
  });
  // An oxygen between each pair of silicons 2 apart.
  for (let p = 0; p < si.length; p++)
    for (let q = p + 1; q < si.length; q++) {
      const A = si[p] as [number, number, number];
      const B = si[q] as [number, number, number];
      if (Math.abs(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) - 2) > 0.05) continue;
      const [bx, by, bz] = onSphere(rand);
      const j = jit();
      const mid: [number, number, number] = [
        (A[0] + B[0]) / 2 + bx * 0.3 + j[0],
        (A[1] + B[1]) / 2 + by * 0.3 + j[1],
        (A[2] + B[2]) / 2 + bz * 0.3 + j[2],
      ];
      const o = add(r, ...mid, 1, key(mid[1]), fromAbove(rand, 9));
      r.bonds.push(siIdx[p] as number, o, 0, siIdx[q] as number, o, 0);
    }
  // Calcium (cement) or calcium and sodium (glass) in some of the open cages.
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++)
        for (const f of fcc) {
          if (rand() > 0.35) continue;
          const x = (i + (f[0] as number) + 0.5) * a - half;
          const y = (j + (f[1] as number) + 0.5) * a - half;
          const z = (k + (f[2] as number) + 0.5) * a - half;
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > half - 0.4) continue;
          add(r, x, y, z, 2, key(y), fromAbove(rand, 9));
        }
  return finish(
    r,
    {
      elements: [
        { colour: "#f2c46d", radius: 0.3 },
        { colour: "#ff5a48", radius: 0.32 },
        { colour: "#6ee0a8", radius: 0.46 },
      ],
      radius: half,
      base: -half - 0.4,
      fibre: 0,
      length: 0,
      form: "block",
      window: 0.1,
      jiggle: 0.03 + defects * 0.05,
      ripple: 0,
      source: [0, half + 7, 0],
    },
    defects,
    62,
  );
}

/** A random coil for a chain to start from: a walk with some persistence, one bond per step. */
function coil(
  rand: () => number,
  start: [number, number, number],
  steps: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  let p = start;
  let d = onSphere(rand);
  for (let i = 0; i < steps; i++) {
    out.push(p);
    const q = onSphere(rand);
    const nx = d[0] + q[0] * 0.9;
    const ny = d[1] + q[1] * 0.9;
    const nz = d[2] + q[2] * 0.9;
    const l = Math.hypot(nx, ny, nz);
    d = [nx / l, ny / l, nz / l];
    p = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  }
  return out;
}

function polymer(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(71);
  // Polyethylene's crystal: zigzag carbon chains along x, packed in an orthorhombic cell, each
  // chain's plane set at an angle that alternates through the cell.
  const NY = 3 + Math.round(detail);
  const NZ = 4 + Math.round(detail);
  const NC = 26 + Math.round(10 * detail);
  const A = 2.4;
  const B = 1.6;
  const L = NC * 0.83;
  const chains: { y: number; z: number; set: number }[] = [];
  for (let iy = 0; iy < NY; iy++)
    for (let iz = 0; iz < NZ; iz++) {
      chains.push({ y: (iy - (NY - 1) / 2) * B * 2, z: (iz - (NZ - 1) / 2) * A, set: 0.75 });
      if (iy < NY - 1 && iz < NZ - 1)
        chains.push({
          y: (iy - (NY - 1) / 2 + 0.5) * B * 2,
          z: (iz - (NZ - 1) / 2 + 0.5) * A,
          set: -0.75,
        });
    }
  // Chains crystallise from the middle of the bundle outward.
  chains.sort((p, q) => Math.hypot(p.y, p.z) - Math.hypot(q.y, q.z));
  chains.forEach((c, ci) => {
    const dir: [number, number, number] = [0, Math.cos(c.set), Math.sin(c.set)];
    const nrm: [number, number, number] = [0, -Math.sin(c.set), Math.cos(c.set)];
    const out = Math.hypot(c.y, c.z) + 0.01;
    const start: [number, number, number] = [
      -L / 2 - 4 - rand() * 6,
      (c.y / out) * 10 + (rand() - 0.5) * 8,
      (c.z / out) * 10 + (rand() - 0.5) * 8,
    ];
    const path = coil(rand, start, NC);
    let prev = -1;
    for (let k = 0; k < NC; k++) {
      const s = k % 2 === 0 ? 0.28 : -0.28;
      const x = k * 0.83 - L / 2;
      const y = c.y + dir[1] * s;
      const z = c.z + dir[2] * s;
      const pp = path[k] as [number, number, number];
      const from: [number, number, number] = [pp[0] - x, pp[1] - y, pp[2] - z];
      const ci0 = add(r, x, y, z, 0, ci * 100 + k * 0.4, from);
      if (prev >= 0) r.bonds.push(prev, ci0, 1);
      prev = ci0;
      // Two hydrogens on each carbon, either side of the chain's plane.
      for (const side of [1, -1]) {
        const hx = 0;
        const hy = dir[1] * s * 1.1 + nrm[1] * side * 0.58;
        const hz = dir[2] * s * 1.1 + nrm[2] * side * 0.58;
        const h = add(r, x + hx, y + hy, z + hz, 1, 0, from);
        r.lead[h] = ci0;
        r.bonds.push(ci0, h, 1);
      }
    }
  });
  const half = Math.max((NY * B * 2) / 2, (NZ * A) / 2);
  return finish(
    r,
    {
      elements: [
        { colour: "#9aa6ba", radius: 0.24 },
        { colour: "#f4f6ff", radius: 0.15 },
      ],
      radius: L / 2,
      base: -half,
      fibre: half,
      length: L,
      form: "strand",
      window: 0.22,
      jiggle: 0.03,
      ripple: 0,
      source: [-L / 2 - 8, 0, 0],
    },
    defects,
    72,
    false,
  );
}

function protein(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(81);
  // A cross-beta fibre, as in silk and amyloid: strands run across the fibre (z), stack along it
  // (x) held by hydrogen bonds, and pleated sheets stack face to face (y). One bead per residue,
  // its side chain alternating above and below the sheet.
  const NS = 3;
  const NST = 8 + Math.round(4 * detail);
  const NR = 12 + Math.round(4 * detail);
  const DX = 1.3;
  const DY = 2.4;
  const W = NR * 0.95;
  const L = NST * DX;
  const side = ["#ffd36b", "#6fd0ff", "#ff6f91", "#9bf08a"];
  const grid: number[][][] = [];
  for (let st = 0; st < NST; st++) {
    grid.push([]);
    for (let sh = 0; sh < NS; sh++) {
      const row: number[] = [];
      const y = (sh - (NS - 1) / 2) * DY;
      const x = st * DX - L / 2 + DX / 2;
      const start: [number, number, number] = [
        x + (rand() - 0.5) * 6 + 6,
        y + (rand() - 0.5) * 10,
        -W / 2 - 6 - rand() * 6,
      ];
      const path = coil(rand, start, NR);
      let prev = -1;
      for (let k = 0; k < NR; k++) {
        const kk = st % 2 === 0 ? k : NR - 1 - k;
        const z = kk * 0.95 - W / 2;
        const pleat = kk % 2 === 0 ? 0.22 : -0.22;
        const pp = path[k] as [number, number, number];
        const from: [number, number, number] = [pp[0] - x, pp[1] - y - pleat, pp[2] - z];
        // The fibre grows by adding strands at its end, each strand zipping in residue by residue.
        const a = add(r, x, y + pleat, z, 0, st * 1000 + sh * 100 + k, from);
        row[kk] = a;
        if (prev >= 0) r.bonds.push(prev, a, 1);
        prev = a;
        const up = kk % 2 === 0 ? 1 : -1;
        const sc = add(r, x, y + pleat + up * 0.75, z, 1 + Math.floor(rand() * 4), 0, from);
        r.lead[sc] = a;
        r.bonds.push(a, sc, 1);
      }
      (grid[st] as number[][]).push(row);
    }
  }
  // Hydrogen bonds between neighbouring strands in a sheet.
  for (let st = 0; st < NST - 1; st++)
    for (let sh = 0; sh < NS; sh++)
      for (let k = 0; k < NR; k += 1)
        r.bonds.push(
          (grid[st] as number[][])[sh]?.[k] as number,
          (grid[st + 1] as number[][])[sh]?.[k] as number,
          2,
        );
  return finish(
    r,
    {
      elements: [
        { colour: "#e6e8f2", radius: 0.3 },
        ...side.map((c) => ({ colour: c, radius: 0.24 })),
      ],
      radius: Math.max(L, W) / 2,
      base: -((NS - 1) / 2) * DY - 1,
      fibre: W / 2,
      length: L,
      form: "strand",
      window: 0.16,
      jiggle: 0.035,
      ripple: 0,
      source: [L / 2 + 6, 0, -W / 2 - 6],
    },
    defects,
    82,
    false,
  );
}

function ice(detail: number, defects: number): Crystal {
  const r = raw();
  const rand = rng(91);
  // Ice Ih: oxygens on a hexagonal (wurtzite) lattice, c along y, 1 apart; each oxygen holds two
  // hydrogens, one on each of two of its four bonds, and the other two hydrogen-bond to it.
  const d = 1;
  const c = (8 / 3) * d;
  const a = c / Math.sqrt(8 / 3);
  const u = 3 / 8;
  const R = 4 + 2.5 * detail;
  const NH = 2;
  const K = Math.ceil(R / a) + 2;
  const basis: [number, number, number][] = [
    [1 / 3, 2 / 3, 0],
    [2 / 3, 1 / 3, 0.5],
    [1 / 3, 2 / 3, u],
    [2 / 3, 1 / 3, 0.5 + u],
  ];
  const hex = (x: number, z: number) => {
    let m = 0;
    for (let k = 0; k < 3; k++) {
      const t = (k * Math.PI) / 3;
      m = Math.max(m, Math.abs(x * Math.cos(t) + z * Math.sin(t)));
    }
    return m;
  };
  for (let i = -K; i <= K; i++)
    for (let j = -K; j <= K; j++)
      for (let k = 0; k < NH; k++)
        for (const [bu, bv, bw] of basis) {
          const x = (i + bu + (j + bv) * 0.5) * a;
          const z = (j + bv) * a * (S3 / 2);
          const y = (k + bw) * c - (NH * c) / 2;
          if (hex(x, z) > R * (S3 / 2)) continue;
          // A snowflake: growth fastest toward the hexagon's corners, then filling in.
          const th = Math.atan2(z, x);
          const key = hex(x, z) * (1 - 0.18 * Math.cos(6 * th)) + Math.abs(y) * 0.6 + rand() * 0.5;
          add(r, x, y, z, 0, key, fromAbove(rand, 9));
        }
  const nO = r.el.length;
  bondsWithin(r, [[0, 0, 1.05, 2]]);
  // Hand out hydrogens: two per oxygen where it can, one per bond.
  const count = new Array(nO).fill(0) as number[];
  const pairs: [number, number][] = [];
  for (let k = 0; k < r.bonds.length; k += 3)
    pairs.push([r.bonds[k] as number, r.bonds[k + 1] as number]);
  for (let k = pairs.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [pairs[k], pairs[j]] = [pairs[j] as [number, number], pairs[k] as [number, number]];
  }
  r.bonds.length = 0;
  for (const [p, q] of pairs) {
    const cp = count[p] as number;
    const cq = count[q] as number;
    const own = cp < 2 && (cq >= 2 || rand() < 0.5) ? p : cq < 2 ? q : -1;
    if (own < 0) continue;
    const other = own === p ? q : p;
    count[own] = (count[own] as number) + 1;
    const t = 0.36;
    const ox = r.site[own * 3] as number;
    const oy = r.site[own * 3 + 1] as number;
    const oz = r.site[own * 3 + 2] as number;
    const h = add(
      r,
      ox + ((r.site[other * 3] as number) - ox) * t,
      oy + ((r.site[other * 3 + 1] as number) - oy) * t,
      oz + ((r.site[other * 3 + 2] as number) - oz) * t,
      1,
      0,
      [r.from[own * 3] as number, r.from[own * 3 + 1] as number, r.from[own * 3 + 2] as number],
    );
    r.lead[h] = own;
    r.bonds.push(own, h, 1, h, other, 2);
  }
  return finish(
    r,
    {
      elements: [
        // Oxygen red and hydrogen white, as water is drawn.
        { colour: "#e8493c", radius: 0.27 },
        { colour: "#eef3ff", radius: 0.12 },
      ],
      radius: R,
      base: -(NH * c) / 2 - 0.3,
      fibre: 0,
      length: 0,
      form: "block",
      window: 0.1,
      jiggle: 0.03,
      ripple: 0,
      source: [0, 7, 0],
    },
    defects,
    92,
  );
}

const MAKERS: Record<Structure, (detail: number, defects: number) => Crystal> = {
  graphene,
  nanotube,
  diamond,
  metal,
  perovskite,
  silicate,
  polymer,
  protein,
  ice,
};

export function makeCrystal(structure: Structure, detail: number, defects: number): Crystal {
  return (MAKERS[structure] ?? graphene)(detail, defects);
}
