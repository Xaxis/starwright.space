/**
 * The parsed contents of data/, and the checks that tie them together: every reference names a real
 * record, the capability graph has no loops, and every {id} in the prose is a number the model makes.
 * Pure: load.ts reads the files and hands their text here.
 */
import { parse } from "yaml";
import type { z } from "zod";
import { type Model, run } from "./model.ts";
import { sceneProblems } from "./scenes.ts";
import {
  Assumption,
  Capability,
  Constant,
  Domain,
  Invention,
  Stage,
  type Assumption as TAssumption,
  type Capability as TCapability,
  type Constant as TConstant,
  type Domain as TDomain,
  type Invention as TInvention,
  type Stage as TStage,
} from "./schema.ts";

export interface Data {
  constants: Record<string, TConstant>;
  assumptions: Record<string, TAssumption>;
  domains: TDomain[];
  stages: TStage[];
  capabilities: TCapability[];
  inventions: TInvention[];
}

/** One file's text, by its path relative to data/. */
export type Files = { path: string; text: string }[];

export class DataError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`${problems.length} problem(s) in data/:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

function zodProblems(path: string, e: z.ZodError): string[] {
  return e.issues.map((i) => `${path}: ${i.path.join(".") || "(root)"}: ${i.message}`);
}

export interface ParseOptions {
  /** Return whatever parses and report nothing: for development and the model CLI, never a build. */
  lenient?: boolean;
}

/** Parses every file and checks every reference. Throws DataError listing every problem found. */
export function parseData(files: Files, opts: ParseOptions = {}): Data {
  const problems: string[] = [];
  const data: Data = {
    constants: {},
    assumptions: {},
    domains: [],
    stages: [],
    capabilities: [],
    inventions: [],
  };
  const read = (path: string): unknown => {
    const f = files.find((x) => x.path === path);
    if (!f) {
      problems.push(`${path}: missing`);
      return undefined;
    }
    try {
      return parse(f.text);
    } catch (e) {
      problems.push(`${path}: ${(e as Error).message}`);
      return undefined;
    }
  };
  const table = <T>(path: string, schema: z.ZodType<T>, into: Record<string, T>) => {
    const raw = read(path);
    if (!raw || typeof raw !== "object") return;
    for (const [k, x] of Object.entries(raw as Record<string, unknown>)) {
      const r = schema.safeParse(x);
      if (r.success) into[k] = r.data;
      else problems.push(...zodProblems(`${path} ${k}`, r.error));
    }
  };
  table("constants.yaml", Constant, data.constants);
  table("assumptions.yaml", Assumption, data.assumptions);
  for (const k of Object.keys(data.constants)) {
    if (k in data.assumptions) problems.push(`${k}: both a constant and an assumption`);
  }
  for (const [k, a] of Object.entries(data.assumptions)) {
    if (!(a.min <= a.value && a.value <= a.max))
      problems.push(`assumptions.yaml ${k}: value outside its range`);
    if (a.log && a.min <= 0)
      problems.push(`assumptions.yaml ${k}: a log range must start above zero`);
  }
  const list = <T>(path: string, schema: z.ZodType<T>, into: T[]) => {
    const raw = read(path);
    if (!Array.isArray(raw)) {
      if (raw !== undefined) problems.push(`${path}: expected a list`);
      return;
    }
    raw.forEach((x, i) => {
      const r = schema.safeParse(x);
      if (r.success) into.push(r.data);
      else problems.push(...zodProblems(`${path} [${i}]`, r.error));
    });
  };
  list("domains.yaml", Domain, data.domains);
  list("stages.yaml", Stage, data.stages);
  for (const f of files) {
    const one = <T extends { id: string }>(schema: z.ZodType<T>, into: T[]) => {
      let raw: unknown;
      try {
        raw = parse(f.text);
      } catch (e) {
        problems.push(`${f.path}: ${(e as Error).message}`);
        return;
      }
      const r = schema.safeParse(raw);
      if (!r.success) {
        problems.push(...zodProblems(f.path, r.error));
        return;
      }
      const name = f.path
        .split("/")
        .at(-1)
        ?.replace(/\.yaml$/, "");
      if (name !== r.data.id)
        problems.push(`${f.path}: the file name must be its id (${r.data.id})`);
      into.push(r.data);
    };
    if (f.path.startsWith("capabilities/")) one(Capability, data.capabilities);
    else if (f.path.startsWith("inventions/")) one(Invention, data.inventions);
  }
  if (opts.lenient) return data;
  if (problems.length === 0) problems.push(...crossCheck(data));
  if (problems.length > 0) throw new DataError(problems);
  return data;
}

const TEMPLATE = /\{([a-z0-9-]+)\}/g;

/** Every string anywhere inside x, with the dotted path to it. */
function strings(x: unknown, at: string, out: [string, string][]): [string, string][] {
  if (typeof x === "string") out.push([at, x]);
  else if (Array.isArray(x)) for (const [i, y] of x.entries()) strings(y, `${at}[${i}]`, out);
  else if (x && typeof x === "object")
    for (const [k, y] of Object.entries(x)) strings(y, at ? `${at}.${k}` : k, out);
  return out;
}

/** The references between records, the graph's shape and the templates. */
export function crossCheck(data: Data): string[] {
  const problems: string[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) problems.push(`${kind} ${i}: defined twice`);
      seen.add(i);
    }
  };
  dup(
    "domain",
    data.domains.map((x) => x.id),
  );
  dup(
    "stage",
    data.stages.map((x) => x.id),
  );
  dup(
    "capability/invention",
    [...data.capabilities, ...data.inventions].map((x) => x.id),
  );

  const domains = new Set(data.domains.map((x) => x.id));
  const stages = new Set(data.stages.map((x) => x.id));
  const caps = new Map(data.capabilities.map((x) => [x.id, x]));
  const invs = new Map(data.inventions.map((x) => [x.id, x]));
  const stageOrder = new Map(data.stages.map((s, i) => [s.id, i]));

  for (const c of data.capabilities) {
    const at = `capabilities/${c.domain}/${c.id}`;
    if (!domains.has(c.domain)) problems.push(`${at}: unknown domain ${c.domain}`);
    if (!stages.has(c.stage)) problems.push(`${at}: unknown stage ${c.stage}`);
    for (const n of c.needs) {
      const need = caps.get(n);
      if (!need) problems.push(`${at}: needs unknown capability ${n}`);
      else if ((stageOrder.get(need.stage) ?? 0) > (stageOrder.get(c.stage) ?? 0))
        problems.push(`${at}: needs ${n}, which is not needed until a later stage (${need.stage})`);
    }
    for (const i of c.inventions) {
      const inv = invs.get(i);
      if (!inv) problems.push(`${at}: lists unknown invention ${i}`);
      else if (!inv.for.includes(c.id))
        problems.push(`${at}: lists ${i}, whose "for" does not name it`);
    }
  }
  for (const inv of data.inventions) {
    const at = `inventions/${inv.domain}/${inv.id}`;
    if (!domains.has(inv.domain)) problems.push(`${at}: unknown domain ${inv.domain}`);
    for (const c of inv.for) {
      const cap = caps.get(c);
      if (!cap) problems.push(`${at}: for unknown capability ${c}`);
      else if (!cap.inventions.includes(inv.id))
        problems.push(`${at}: is for ${c}, which does not list it under inventions`);
    }
  }
  for (const s of data.stages) {
    for (const step of s.plan) {
      if (!caps.has(step.ref) && !invs.has(step.ref))
        problems.push(`stage ${s.id}: plan step names unknown ${step.ref}`);
    }
  }
  // Every scene's knobs must be ones its kind draws.
  const scened: [string, { scene: { kind: TStage["scene"]["kind"]; params: unknown } }][] = [
    ...data.stages.map((s) => [`stage ${s.id}`, s] as [string, TStage]),
    ...data.capabilities.map(
      (c) => [`capabilities/${c.domain}/${c.id}`, c] as [string, TCapability],
    ),
    ...data.inventions.map((i) => [`inventions/${i.domain}/${i.id}`, i] as [string, TInvention]),
  ];
  for (const [name, rec] of scened)
    for (const p of sceneProblems(rec.scene.kind, rec.scene.params)) problems.push(`${name}: ${p}`);

  // No capability may need itself, however far round.
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      problems.push(`capability loop: ${[...trail, id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const n of caps.get(id)?.needs ?? []) visit(n, [...trail, id]);
    state.set(id, 2);
  };
  for (const c of data.capabilities) visit(c.id, []);

  // Templates: every {id} must be a number the published model makes.
  let model: Model;
  try {
    model = run(data.constants, data.assumptions);
  } catch (e) {
    problems.push(`the model does not run: ${(e as Error).message}`);
    return problems;
  }
  for (const s of data.stages)
    if (!model.q.has(s.power))
      problems.push(`stage ${s.id}: power ${s.power} is not a model quantity`);
  const records: [string, unknown][] = [
    ...data.stages.map((s) => [`stage ${s.id}`, s] as [string, unknown]),
    ...data.capabilities.map((c) => [`capabilities/${c.domain}/${c.id}`, c] as [string, unknown]),
    ...data.inventions.map((i) => [`inventions/${i.domain}/${i.id}`, i] as [string, unknown]),
    ...data.domains.map((d) => [`domain ${d.id}`, d] as [string, unknown]),
    ...Object.entries(data.assumptions).map(
      ([k, a]) => [`assumption ${k}`, a] as [string, unknown],
    ),
  ];
  for (const [name, rec] of records) {
    for (const [path, text] of strings(rec, "", [])) {
      for (const m of text.matchAll(TEMPLATE)) {
        if (!model.q.has(m[1] as string))
          problems.push(`${name} ${path}: {${m[1]}} is not a model quantity`);
      }
    }
  }
  return problems;
}
