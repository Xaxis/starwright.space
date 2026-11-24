import "server-only";
/**
 * The site's view of data/ and the model, read once per build. Pages import from here; client
 * components get plain objects (the builder re-runs the model in the browser from the same inputs).
 */
import { type Data, type Model, run } from "@starwright/core";
import { loadData } from "@starwright/core/load";

let cached: { data: Data; model: Model } | undefined;

export function site(): { data: Data; model: Model } {
  if (!cached) {
    const data = loadData();
    cached = { data, model: run(data.constants, data.assumptions) };
  }
  return cached;
}

export function domainOf(id: string) {
  const d = site().data.domains.find((x) => x.id === id);
  if (!d) throw new Error(`no domain ${id}`);
  return d;
}

export function stageOf(id: string) {
  const s = site().data.stages.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
}
