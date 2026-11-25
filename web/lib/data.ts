import "server-only";
/**
 * The site's view of data/ and the model, read once per build. Pages import from here; client
 * components get plain objects (the builder re-runs the model in the browser from the same inputs).
 * A production build insists on every reference; the dev server shows whatever parses, so pages
 * can be worked on while content is still being written.
 */
import { type Data, format, type Model, run, SAGAN } from "@starwright/core";
import { loadData } from "@starwright/core/load";
import type { Beat } from "../components/scene/types";

let cached: { data: Data; model: Model } | undefined;

export function site(): { data: Data; model: Model } {
  if (!cached) {
    const lenient = process.env.NODE_ENV === "development";
    const data = loadData(undefined, { lenient });
    cached = { data, model: run(data.constants, data.assumptions) };
  }
  return cached;
}

export const val = (id: string): number => {
  const q = site().model.q.get(id);
  if (!q) throw new Error(`no quantity ${id}`);
  return q.value;
};
export const show = (id: string): string => {
  const q = site().model.q.get(id);
  if (!q) throw new Error(`no quantity ${id}`);
  return format(q.value, q.unit);
};

/** A stage's year in the published plan ("today" for the first). */
export function stageYear(id: string): string {
  if (id === "now") return String(Math.floor(val("base-year")));
  return show(`year-${id}`);
}
export function stageK(power: string): string {
  return SAGAN(val(power)).toFixed(2);
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
export function capability(id: string) {
  return site().data.capabilities.find((x) => x.id === id);
}
export function invention(id: string) {
  return site().data.inventions.find((x) => x.id === id);
}

/** The ladder's story, one beat per rung, for the hero and the Builder. */
export function ladderBeats(): Omit<Beat, "at">[] {
  return site().data.stages.map((s) => ({
    title: s.title,
    caption: firstSentence(fillText(s.picture)),
    meter: `K ${stageK(s.power)} · ${stageYear(s.id)}`,
  }));
}

export function fillText(text: string): string {
  const { model } = site();
  return text.replace(/\{([a-z0-9-]+)\}/g, (_, id: string) => {
    const q = model.q.get(id);
    return q ? format(q.value, q.unit) : `{${id}}`;
  });
}
export function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? (m[1] as string) : text;
}
