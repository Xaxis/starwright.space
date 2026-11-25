/**
 * How the site writes a number: by its unit, to three significant figures, in words a reader knows
 * (terawatts, million tonnes) until the numbers outgrow them, then in powers of ten.
 */

const SUP: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** x to n significant figures, with thousands separators and no trailing zeros. */
export function sig(x: number, n = 3): string {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "-∞";
  const r = Number(x.toPrecision(n));
  const digits = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(r))));
  return r.toLocaleString("en-US", { maximumFractionDigits: Math.min(digits, 20) });
}

/** a × 10ⁿ, with the mantissa to n significant figures. */
export function sci(x: number, n = 2): string {
  if (x === 0) return "0";
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = Number((x / 10 ** e).toPrecision(n));
  if (Math.abs(m) >= 10) {
    m /= 10;
    e += 1;
  }
  const exp = String(e)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("");
  return `${sig(m, n)} × 10${exp}`;
}

const PREFIX: [number, string][] = [
  [1e15, "P"],
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
];

function si(x: number, unit: string): string {
  for (const [f, p] of PREFIX) if (Math.abs(x) >= f) return `${sig(x / f)} ${p}${unit}`;
  return `${sig(x)} ${unit}`;
}

const WORDS: [number, string][] = [
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
];

function words(x: number): string {
  for (const [f, w] of WORDS) if (Math.abs(x) >= f) return `${sig(x / f)} ${w}`;
  return sig(x);
}

/** A value in its unit, as the site prints it. */
export function format(value: number, unit: string): string {
  if (unit === "year") return Number.isFinite(value) ? String(Math.round(value)) : "never";
  if (!Number.isFinite(value)) return "never";
  // Physics constants run far below a thousandth: Landauer's limit is a few zeptojoules.
  const tiny = value !== 0 && Math.abs(value) < 1e-3;
  switch (unit) {
    case "W":
      return Math.abs(value) >= 1e18 ? `${sci(value)} W` : si(value, "W");
    case "kg": {
      const t = value / 1000;
      if (Math.abs(t) >= 1e15) return `${sci(value)} kg`;
      if (Math.abs(t) >= 1) return `${words(t)} t`;
      return `${sig(value)} kg`;
    }
    case "m2": {
      const km2 = value / 1e6;
      if (Math.abs(km2) >= 1e9) return `${sci(value)} m²`;
      if (Math.abs(km2) >= 1) return `${words(km2)} km²`;
      return `${sig(value)} m²`;
    }
    case "W/m2":
      return `${tiny ? sci(value) : sig(value)} W/m²`;
    case "m": {
      if (Math.abs(value) >= 1e12) return `${sci(value)} m`;
      if (Math.abs(value) >= 1e4) return `${words(value / 1000)} km`;
      return `${tiny ? sci(value) : sig(value)} m`;
    }
    case "yr": {
      const s = sig(value, value < 10 ? 2 : 3);
      return `${s} ${s === "1" ? "year" : "years"}`;
    }
    case "1/yr":
      return `${sig(value * 100, 2)}% a year`;
    case "share":
      return value < 0.001 ? `${sci(value * 100, 2)}%` : `${sig(value * 100, 2)}%`;
    case "x":
      // Past a million a multiple reads better in words: "98 million times".
      for (const [f, w] of WORDS)
        if (Math.abs(value) >= f) return `${sig(value / f, 2)} ${w} times`;
      return `${sig(value, 2)}×`;
    case "K":
      // "K" is a Kardashev rating; temperatures use "kelvin".
      return value.toFixed(2);
    case "kelvin":
      return `${sig(value, 4)} K`;
    case "people":
      return `${words(value)} people`;
    case "":
      return tiny ? sci(value) : sig(value);
    default:
      return Math.abs(value) >= 1e15 || tiny ? `${sci(value)} ${unit}` : `${sig(value)} ${unit}`;
  }
}
