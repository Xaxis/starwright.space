/** Node only: reads data/ from disk and parses it. Everything else in core is pure. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { type Data, type Files, type ParseOptions, parseData } from "./data.ts";

/** The workspace root: the nearest folder up holding pnpm-workspace.yaml. Starts from this file under
 * Node, and from the working directory when a bundler (the site's build) hides where it lives. */
function findRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  while (!existsSync(join(/*turbopackIgnore: true*/ dir, "pnpm-workspace.yaml"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("load: no pnpm-workspace.yaml above; run from the repository");
    dir = up;
  }
  return dir;
}

export const DATA_DIR = join(/*turbopackIgnore: true*/ findRoot(), "data");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
    const p = join(/*turbopackIgnore: true*/ dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".yaml")) out.push(p);
  }
  return out;
}

export function readFiles(dir = DATA_DIR): Files {
  return walk(dir)
    .sort()
    .map((p) => ({
      path: relative(dir, p),
      text: readFileSync(/*turbopackIgnore: true*/ p, "utf8"),
    }));
}

export function loadData(dir = DATA_DIR, opts: ParseOptions = {}): Data {
  return parseData(readFiles(dir), opts);
}
