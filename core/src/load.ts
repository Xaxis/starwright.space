/** Node only: reads data/ from disk and parses it. Everything else in core is pure. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { type Data, type Files, type ParseOptions, parseData } from "./data.ts";

export const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".yaml") && e.name !== "spine.yaml") out.push(p);
  }
  return out;
}

export function readFiles(dir = DATA_DIR): Files {
  return walk(dir)
    .sort()
    .map((p) => ({ path: relative(dir, p), text: readFileSync(p, "utf8") }));
}

export function loadData(dir = DATA_DIR, opts: ParseOptions = {}): Data {
  return parseData(readFiles(dir), opts);
}

/** The ids data/spine.yaml plans, for a lane's partial check. Empty once the spine is gone. */
export function plannedIds(dir = DATA_DIR): string[] {
  try {
    const raw = parse(readFileSync(join(dir, "spine.yaml"), "utf8")) as { id: string }[];
    return raw.map((x) => x.id);
  } catch {
    return [];
  }
}
