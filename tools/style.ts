/**
 * The house rules a reviewer would otherwise have to remember. Adapted from Phosphoros
 * tools/style.ts (see UPSTREAM.md).
 *
 *   1. No em dashes anywhere: copy, code, comments, docs, data. A spaced en dash used as a dash
 *      counts too. Use commas, colons, parentheses or separate sentences.
 *   2. No copy of a model number typed into data prose. A value the model holds is written {id}, so
 *      the two can never drift apart. Facts quoted from the world (exists, buildsOn, quotes) are fine.
 *
 *   node tools/style.ts          report and fail on any breach
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { run } from "../core/src/model.ts";
import { loadData } from "../core/src/load.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEXT = /\.(md|ts|tsx|mts|js|mjs|css|yaml|yml|json|html|txt|sh|svg)$/;
const SKIP = /(^|\/)(node_modules|\.next|out|pnpm-lock\.yaml)(\/|$)/;
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && TEXT.test(f) && !SKIP.test(f) && f !== "tools/style.ts");

const problems: string[] = [];
const EM = new RegExp(`${String.fromCharCode(0x2014)}|\\s${String.fromCharCode(0x2013)}\\s`);
for (const f of files) {
  let text: string;
  try {
    text = readFileSync(path.join(ROOT, f), "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    if (EM.test(line)) problems.push(`${f}:${i + 1}: em dash: ${line.trim().slice(0, 100)}`);
  });
}

// --- 2. Model numbers copied into data prose -----------------------------------------------------
const SI: Record<string, [string, number]> = {
  W: ["W", 1],
  kW: ["W", 1e3],
  MW: ["W", 1e6],
  GW: ["W", 1e9],
  TW: ["W", 1e12],
  PW: ["W", 1e15],
  EW: ["W", 1e18],
  kg: ["kg", 1],
  t: ["kg", 1e3],
  "W/m²": ["W/m2", 1],
  "W/m2": ["W/m2", 1],
  "km²": ["m2", 1e6],
  "m²": ["m2", 1],
};
const NUM = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s?(thousand|million|billion|trillion)?\\s?(${Object.keys(SI)
    .map((u) => u.replace(/[/.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![\\w²/])`,
  "g",
);
const WORD: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
// References are the data check's job; this reads whatever parses, so it runs while lanes work.
const data = loadData(undefined, { lane: { domains: [], planned: [] } });
const m = run(data.constants, data.assumptions);
const model = [...m.q.values()].filter((q) => Number.isFinite(q.value) && q.value !== 0);
const QUOTED = new Set(["exists", "buildsOn", "url", "quote", "source"]);
const scan = (where: string, x: unknown, key = "") => {
  if (QUOTED.has(key)) return;
  if (typeof x === "string") {
    for (const hit of x.matchAll(NUM)) {
      const [unit, f] = SI[hit[3] as string] as [string, number];
      const v = Number((hit[1] as string).replaceAll(",", "")) * (WORD[hit[2] ?? ""] ?? 1) * f;
      const same = model.find((q) => q.unit === unit && Math.abs(q.value - v) / q.value < 0.01);
      if (same) problems.push(`${where} ${key}: "${hit[0]}" copies ${same.id}; write {${same.id}}`);
    }
  } else if (Array.isArray(x)) x.forEach((y) => scan(where, y, key));
  else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) scan(where, y, k);
};
for (const s of data.stages) scan(`stage ${s.id}`, s);
for (const c of data.capabilities) scan(`capability ${c.id}`, c);
for (const i of data.inventions) scan(`invention ${i.id}`, i);

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} style problem(s)`);
  process.exit(1);
}
console.log(`style ok (${files.length} files)`);
