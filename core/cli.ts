/**
 * The model from the command line.
 *   node core/cli.ts                 the ladder: each rung's power and year, and the eras' limits
 *   node core/cli.ts --check         parse and cross-check data/; exit 1 listing every problem
 *   node core/cli.ts --only ID       one quantity: value, formula and inputs
 *   node core/cli.ts --ids           every quantity prose may cite as {id}, with its value
 *   node core/cli.ts --set ID=VALUE  a variant (repeatable)
 */
import { DataError, format, RUNGS, run } from "./src/index.ts";
import { loadData } from "./src/load.ts";

const args = process.argv.slice(2);
// Only --check insists on every reference; the other commands run on whatever parses.
const lenient = !args.includes("--check");
let data: ReturnType<typeof loadData>;
try {
  data = loadData(undefined, { lenient });
} catch (e) {
  if (e instanceof DataError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
if (args.includes("--check")) {
  console.log(
    `data ok: ${Object.keys(data.constants).length} constants, ${Object.keys(data.assumptions).length} assumptions, ${data.domains.length} domains, ${data.stages.length} stages, ${data.capabilities.length} capabilities, ${data.inventions.length} inventions`,
  );
  process.exit(0);
}
const overrides: Record<string, number> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--set") {
    const [k, v] = (args[++i] ?? "").split("=");
    if (!k || v === undefined || !(k in data.assumptions)) {
      console.error(`--set needs ASSUMPTION=VALUE; ${k} is not an assumption`);
      process.exit(1);
    }
    overrides[k] = Number(v);
  }
}
const m = run(data.constants, data.assumptions, overrides);
if (args.includes("--ids")) {
  for (const q of m.q.values())
    console.log(`${q.id.padEnd(30)} ${format(q.value, q.unit).padEnd(18)} ${q.label}`);
  process.exit(0);
}
const only = args.indexOf("--only");
if (only >= 0) {
  const id = args[only + 1] ?? "";
  const q = m.q.get(id);
  if (!q) {
    console.error(`no quantity ${id}`);
    process.exit(1);
  }
  console.log(`${q.id}: ${format(q.value, q.unit)}  (${q.value} ${q.unit}, ${q.kind})`);
  console.log(`  ${q.label}`);
  if (q.formula) console.log(`  = ${q.formula}`);
  for (const i of q.inputs ?? []) {
    const x = m.q.get(i);
    if (x) console.log(`    ${i}: ${format(x.value, x.unit)}`);
  }
  process.exit(0);
}
console.log(`K today: ${format(m.q.get("k-now")?.value ?? 0, "K")}`);
for (const r of RUNGS) {
  const p = m.q.get(r.power);
  const y = m.q.get(`year-${r.id}`);
  console.log(
    `${r.id.padEnd(8)} ${format(p?.value ?? 0, "W").padEnd(16)} ${y ? format(y.value, "year") : ""}`,
  );
}
console.log("eras:");
for (const e of m.eras) console.log(`  ${Math.round(e.from)} to ${Math.round(e.to)}: ${e.limit}`);
