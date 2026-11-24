/**
 * The ladder: how much power humanity uses, year by year, from the last measured year until the
 * whole Sun is harnessed, and which limit holds the climb back in each era.
 *
 * Two engines drive it.
 * - Earth grows its power use by a chosen rate until it meets the planet's own ceiling: sunlight on
 *   the land it gives to panels, plus whatever new heat the planet can shed without warming. Sunlight
 *   that panels catch would have warmed the ground anyway; every other source (fission, fusion, deep
 *   heat, power beamed down from orbit) adds heat, so the heat ceiling is a limit on those.
 * - Space industry starts from a seed factory and doubles its mass at a chosen interval, mining the
 *   Moon, the asteroids and Mercury. A share of what it makes becomes thin collectors around the Sun,
 *   each square metre turning sunlight into power where it is used: in orbit, by the industry itself
 *   and its computers. It stops when the collectors catch all of the Sun's light or the mass runs out.
 *
 * Every input is a constant (measured) or an assumption (chosen); everything else is derived here
 * and recorded in the ledger with its formula, so the site can show where each number comes from.
 */
import type { Assumption, Constant } from "./schema.ts";

export type Kind = "constant" | "assumption" | "derived";

export interface Quantity {
  id: string;
  label: string;
  value: number;
  unit: string;
  kind: Kind;
  /** For derived quantities: the formula in words and symbols, and the ids it reads. */
  formula?: string;
  inputs?: string[];
}

export interface Series {
  year: Float64Array;
  earth: Float64Array;
  space: Float64Array;
  total: Float64Array;
  k: Float64Array;
  /** Mass of space industry, kg. */
  mass: Float64Array;
}

/** The thresholds the ladder marks, in order. Each names the model id of its power. */
export const RUNGS = [
  { id: "now", power: "power-now" },
  { id: "k08", power: "power-k08" },
  { id: "k09", power: "power-k09" },
  { id: "type-1", power: "type-1-power" },
  { id: "planet", power: "earth-intercepted" },
  { id: "k15", power: "power-k15" },
  { id: "type-2", power: "type-2-power" },
  { id: "sun", power: "sun-harnessed" },
] as const;

export interface Model {
  q: Map<string, Quantity>;
  series: Series;
  /** Which limit holds the climb, era by era. */
  eras: { from: number; to: number; limit: Limit }[];
  /** Ids of quantities a reader changed from the published plan. */
  changed: string[];
}

export type Limit = "earth-growth" | "earth-ceiling" | "space-doubling" | "mass" | "sun";

export const SAGAN = (p: number) => (Math.log10(p) - 6) / 10;

const YEAR_STEP = 0.05;
const HORIZON = 1500; // years after the base year

export function run(
  constants: Record<string, Constant>,
  assumptions: Record<string, Assumption>,
  overrides: Record<string, number> = {},
): Model {
  const q = new Map<string, Quantity>();
  const changed: string[] = [];
  for (const [id, c] of Object.entries(constants)) {
    q.set(id, { id, label: c.label, value: c.value, unit: c.unit, kind: "constant" });
  }
  for (const [id, a] of Object.entries(assumptions)) {
    const value = overrides[id] ?? a.value;
    if (overrides[id] !== undefined && overrides[id] !== a.value) changed.push(id);
    q.set(id, { id, label: a.label, value, unit: a.unit, kind: "assumption" });
  }
  const v = (id: string): number => {
    const x = q.get(id);
    if (!x) throw new Error(`the model reads "${id}", which no constant, assumption or step defines`);
    return x.value;
  };
  const d = (
    id: string,
    label: string,
    unit: string,
    formula: string,
    inputs: string[],
    f: (...xs: number[]) => number,
  ): number => {
    const value = f(...inputs.map(v));
    if (!Number.isFinite(value)) throw new Error(`${id} is not finite (${value})`);
    q.set(id, { id, label, value, unit, kind: "derived", formula, inputs });
    return value;
  };

  // --- today -----------------------------------------------------------------------------------
  const supply = constants["energy-supply"];
  if (!supply) throw new Error('the model needs the constant "energy-supply"');
  d(
    "power-now",
    "Humanity's power use today",
    "W",
    "a year's energy supply / seconds in a year",
    ["energy-supply"],
    (ej) => (ej * 1e18) / 3.15576e7,
  );
  q.set("base-year", {
    id: "base-year",
    label: "The year the model starts from (the middle of the last measured year)",
    value: supply.year + 0.5,
    unit: "year",
    kind: "derived",
    formula: "year of energy-supply + 0.5",
    inputs: ["energy-supply"],
  });

  // --- the scale -------------------------------------------------------------------------------
  d("k-now", "Humanity's Kardashev rating today", "K", "(log10 P - 6) / 10", ["power-now"], SAGAN);
  d("power-k08", "Power at K 0.8", "W", "10^(6 + 10 K)", [], () => 1e14);
  d("power-k09", "Power at K 0.9", "W", "10^(6 + 10 K)", [], () => 1e15);
  d("power-k15", "Power at K 1.5", "W", "10^(6 + 10 K)", [], () => 1e21);

  // --- Earth -----------------------------------------------------------------------------------
  const R = v("earth-radius");
  d("earth-area", "Earth's surface area", "m2", "4 pi R^2", ["earth-radius"], (r) => 4 * Math.PI * r * r);
  d(
    "earth-intercepted",
    "Sunlight Earth intercepts",
    "W",
    "S pi R^2",
    ["solar-constant", "earth-radius"],
    (s, r) => s * Math.PI * r * r,
  );
  d(
    "earth-absorbed",
    "Sunlight Earth absorbs",
    "W",
    "intercepted x (1 - albedo)",
    ["earth-intercepted", "earth-albedo"],
    (i, a) => i * (1 - a),
  );
  d(
    "surface-solar-cap",
    "Most power panels on the land can give",
    "W",
    "land x share x mean sunlight x efficiency",
    ["earth-land-area", "land-share", "surface-insolation", "pv-efficiency"],
    (l, s, i, e) => l * s * i * e,
  );
  d(
    "heat-cap-power",
    "Most added heat Earth can shed at the chosen limit",
    "W",
    "heat limit x Earth's area",
    ["heat-limit", "earth-area"],
    (h, a) => h * a,
  );
  d(
    "heat-vs-co2",
    "The heat limit as a share of a CO2 doubling's forcing",
    "share",
    "heat limit / CO2 doubling forcing",
    ["heat-limit", "co2-doubling-forcing"],
    (h, c) => h / c,
  );
  const earthCap = d(
    "earth-cap",
    "Most power Earth's surface can use",
    "W",
    "surface solar ceiling + heat ceiling",
    ["surface-solar-cap", "heat-cap-power"],
    (a, b) => a + b,
  );
  d("k-earth-cap", "Kardashev rating at Earth's ceiling", "K", "(log10 P - 6) / 10", ["earth-cap"], SAGAN);
  d(
    "earth-cap-multiple",
    "Earth's ceiling as a multiple of today's use",
    "x",
    "ceiling / today",
    ["earth-cap", "power-now"],
    (c, p) => c / p,
  );
  d(
    "earth-cap-years",
    "Years of growth until Earth meets its ceiling",
    "yr",
    "ln(ceiling / today) / ln(1 + growth)",
    ["earth-cap", "power-now", "earth-growth"],
    (c, p, g) => (c > p ? Math.log(c / p) / Math.log(1 + g) : 0),
  );
  d(
    "type-1-earth-heat",
    "Type I power used on Earth, as heat per square metre",
    "W/m2",
    "Type I power / Earth's area",
    ["type-1-power", "earth-area"],
    (p, a) => p / a,
  );
  d(
    "type-1-heat-vs-co2",
    "Type I power used on Earth, against a CO2 doubling",
    "x",
    "(Type I power / Earth's area) / CO2 doubling forcing",
    ["type-1-earth-heat", "co2-doubling-forcing"],
    (h, c) => h / c,
  );

  // --- the Sun and the swarm -------------------------------------------------------------------
  d(
    "sun-harnessed",
    "All the Sun's light, turned to power",
    "W",
    "luminosity x collector efficiency",
    ["solar-luminosity", "collector-efficiency"],
    (l, e) => l * e,
  );
  d(
    "swarm-flux",
    "Sunlight on each square metre of the swarm",
    "W/m2",
    "L / (4 pi r^2)",
    ["solar-luminosity", "swarm-radius", "au"],
    (l, r, au) => l / (4 * Math.PI * (r * au) ** 2),
  );
  const specific = d(
    "collector-specific-power",
    "Power from each kilogram of collector",
    "W/kg",
    "flux x efficiency / areal density",
    ["swarm-flux", "collector-efficiency", "collector-density"],
    (f, e, s) => (f * e) / s,
  );
  d(
    "swarm-full-area",
    "Area of a swarm that catches all the Sun's light",
    "m2",
    "4 pi r^2",
    ["swarm-radius", "au"],
    (r, au) => 4 * Math.PI * (r * au) ** 2,
  );
  d(
    "swarm-full-mass",
    "Mass of that swarm's collectors",
    "kg",
    "area x areal density",
    ["swarm-full-area", "collector-density"],
    (a, s) => a * s,
  );
  d(
    "swarm-full-mined",
    "Mass the industry must process to build it",
    "kg",
    "collector mass / share of output that becomes collectors",
    ["swarm-full-mass", "collector-share"],
    (m, s) => m / s,
  );
  const massAvailable = d(
    "mass-available",
    "Mass the industry can reach",
    "kg",
    "Mercury x usable share + the asteroid belt x usable share",
    ["mercury-mass", "mercury-usable", "asteroid-belt-mass", "asteroid-usable"],
    (m, mu, a, au) => m * mu + a * au,
  );
  d(
    "swarm-mass-share",
    "Share of the reachable mass the full swarm uses",
    "share",
    "mined mass / reachable mass",
    ["swarm-full-mined", "mass-available"],
    (m, a) => m / a,
  );
  d(
    "doublings-to-sun",
    "Doublings from the seed factory to the full swarm",
    "",
    "log2(mined mass / seed mass)",
    ["swarm-full-mined", "seed-mass"],
    (m, s) => Math.log2(m / s),
  );
  d(
    "years-seed-to-sun",
    "Years from the seed factory to the full swarm",
    "yr",
    "doublings x doubling time",
    ["doublings-to-sun", "doubling-time"],
    (n, t) => n * t,
  );

  // --- the climb, year by year -----------------------------------------------------------------
  const y0 = v("base-year");
  const p0 = v("power-now");
  const g = v("earth-growth");
  const seedYear = v("seed-year");
  const seed = v("seed-mass");
  const td = v("doubling-time");
  const share = v("collector-share");
  const sunMax = v("sun-harnessed");
  const n = Math.round(HORIZON / YEAR_STEP) + 1;
  const series: Series = {
    year: new Float64Array(n),
    earth: new Float64Array(n),
    space: new Float64Array(n),
    total: new Float64Array(n),
    k: new Float64Array(n),
    mass: new Float64Array(n),
  };
  const limits: Limit[] = [];
  for (let i = 0; i < n; i++) {
    const t = y0 + i * YEAR_STEP;
    const grown = p0 * (1 + g) ** (t - y0);
    const earth = Math.min(grown, Math.max(earthCap, p0));
    const free = t < seedYear ? 0 : seed * 2 ** ((t - seedYear) / td);
    const mass = Math.min(free, massAvailable);
    const space = Math.min(mass * share * specific, sunMax);
    series.year[i] = t;
    series.earth[i] = earth;
    series.space[i] = space;
    series.mass[i] = mass;
    series.total[i] = earth + space;
    series.k[i] = SAGAN(earth + space);
    limits.push(
      space >= sunMax
        ? "sun"
        : free > massAvailable
          ? "mass"
          : space > earth
            ? "space-doubling"
            : grown > earthCap
              ? "earth-ceiling"
              : "earth-growth",
    );
  }
  const eras: Model["eras"] = [];
  for (let i = 0; i < n; i++) {
    const limit = limits[i] as Limit;
    const last = eras.at(-1);
    if (last && last.limit === limit) last.to = series.year[i] as number;
    else eras.push({ from: series.year[i] as number, to: series.year[i] as number, limit });
  }

  /** The first moment total power reaches p, interpolated in log power; Infinity if never. */
  const reach = (p: number): number => {
    const tot = series.total;
    if ((tot[0] as number) >= p) return y0;
    for (let i = 1; i < n; i++) {
      const b = tot[i] as number;
      if (b >= p) {
        const a = tot[i - 1] as number;
        const f = (Math.log(p) - Math.log(a)) / (Math.log(b) - Math.log(a));
        return (series.year[i - 1] as number) + f * YEAR_STEP;
      }
    }
    return Number.POSITIVE_INFINITY;
  };
  for (const rung of RUNGS) {
    if (rung.id === "now") continue;
    const p = v(rung.power);
    const at = reach(p);
    q.set(`year-${rung.id}`, {
      id: `year-${rung.id}`,
      label: `Year the climb reaches ${rung.id === "sun" ? "all of the Sun" : rung.id}`,
      value: at,
      unit: "year",
      kind: "derived",
      formula: `first year total power >= ${rung.power}`,
      inputs: [rung.power],
    });
  }
  let overtakes = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    if ((series.space[i] as number) > (series.earth[i] as number)) {
      overtakes = series.year[i] as number;
      break;
    }
  }
  q.set("year-space-overtakes", {
    id: "year-space-overtakes",
    label: "Year power used in space overtakes power used on Earth",
    value: overtakes,
    unit: "year",
    kind: "derived",
    formula: "first year space power > Earth power",
    inputs: ["earth-cap", "seed-year", "doubling-time"],
  });
  return { q, series, eras, changed };
}

/** A quantity's value, or a thrown error naming the missing id. */
export function value(m: Model, id: string): number {
  const x = m.q.get(id);
  if (!x) throw new Error(`no quantity "${id}"`);
  return x.value;
}
