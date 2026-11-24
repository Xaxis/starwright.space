/**
 * The shape of everything in data/. Parsed once at the edge (load.ts); the rest of core trusts it.
 *
 * Four kinds of record:
 * - a constant: a measured number, with its source and the year it describes;
 * - an assumption: a number the plan chooses, with its basis and the range the builder may move it;
 * - a stage: a rung of the ladder, a power level with the capabilities it needs and the plan to get there;
 * - a capability (node): something civilization must be able to do, what exists toward it today, and
 *   the inventions that close the gap;
 * - an invention: a technology this project proposes where none exists, with the principle it works
 *   on, the first experiment that would prove it, and the steps from there to civilization scale.
 */
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ids are kebab-case");
const url = z.url({ protocol: /^https?$/ });

/** A fact about the world today, with where it was found. */
export const Source = z.strictObject({
  text: z.string().min(1),
  url,
  /** The year the fact describes, or the source was published. */
  year: z.number().int().min(1600).max(2100).optional(),
});
export type Source = z.infer<typeof Source>;

export const Constant = z.strictObject({
  label: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  year: z.number().int(),
  source: url,
  /** The words or table cell in the source that show the value. */
  quote: z.string().min(1),
  note: z.string().optional(),
});
export type Constant = z.infer<typeof Constant>;

/**
 * Why a chosen number is what it is. physics: follows from a law; precedent: something has done it;
 * invented: this project's own design target, untested; choice: a policy or plan decision.
 */
export const Basis = z.enum(["physics", "precedent", "invented", "choice"]);
export type Basis = z.infer<typeof Basis>;

export const Assumption = z.strictObject({
  label: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  basis: Basis,
  why: z.string().min(1),
  /** The builder's slider range. */
  min: z.number(),
  max: z.number(),
  /** Log sliders for quantities that span orders of magnitude. */
  log: z.boolean().optional(),
});
export type Assumption = z.infer<typeof Assumption>;

/** The 3D scene that shows a record. Kinds are drawn by web/components/scene/kinds/. */
export const SCENE_KINDS = [
  "ladder", // the whole climb, Earth to the swarm, in powers of ten
  "globe", // Earth: grids, deserts of panels, night lights, lines between continents
  "orbit", // Earth and what circles it: stations, collectors, factories, beams
  "moon", // the lunar surface: bases, mines, mass drivers
  "swarm", // the Sun and the collectors around it
  "mercury", // Mercury being mined and launched
  "replicator", // a factory that builds copies of itself
  "reactor", // a torus or chamber of plasma
  "lattice", // a material's atoms or a structure's repeating cell
  "machine", // a single device: a motor, a cell, a chip, an engine, drawn from primitives
  "field", // many identical units on the ground: farms, fabs, arrays
  "network", // people and institutions as nodes and links
  "cell", // a living cell or organism
  "habitat", // a rotating habitat or closed ecosystem
  "launch", // getting mass off a world: rockets, mass drivers, tethers
  "compute", // computation: wafers, racks, radiators in orbit
] as const;
export const SceneKind = z.enum(SCENE_KINDS);
export type SceneKind = z.infer<typeof SceneKind>;

export const Scene = z.strictObject({
  kind: SceneKind,
  /** What to look at first, in words a caption can use. */
  focus: z.string().min(1),
  /** Kind-specific knobs: counts, colours, sizes. Numbers may be model ids, as "{id}". */
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type Scene = z.infer<typeof Scene>;

export const Domain = z.strictObject({
  id,
  title: z.string().min(1),
  /** One sentence: what this area must do for the climb. */
  role: z.string().min(1),
  colour: z.string().regex(/^#[0-9a-f]{6}$/),
});
export type Domain = z.infer<typeof Domain>;

const PlanStep = z.strictObject({
  /** A capability or invention id. */
  ref: id,
  /** What happens at this step, in this stage. */
  does: z.string().min(1),
});

export const Stage = z.strictObject({
  id,
  title: z.string().min(1),
  /** The model id of the power this rung stands for. */
  power: id,
  /** What the civilization looks like here. */
  picture: z.string().min(1),
  /** What stops the climb here and must be overcome to reach the next rung. */
  limit: z.string().min(1),
  scene: Scene,
  /** The plan for this rung, in order. */
  plan: z.array(PlanStep).min(1),
});
export type Stage = z.infer<typeof Stage>;

export const Capability = z.strictObject({
  id,
  title: z.string().min(1),
  domain: id,
  /** The first stage that needs it. */
  stage: id,
  /** Capabilities that must exist first. */
  needs: z.array(id).default([]),
  summary: z.string().min(1),
  /** What it must achieve, with model ids in braces where a number applies. */
  target: z.string().min(1),
  /** What exists toward it today, so the work builds on it. */
  exists: z.array(Source).min(1),
  /** What is missing between what exists and the target. */
  gap: z.string().min(1),
  /** Inventions this project proposes to close the gap. */
  inventions: z.array(id).default([]),
  scene: Scene,
});
export type Capability = z.infer<typeof Capability>;

/** A rung of an invention's climb from the bench to civilization scale. */
export const Step = z.strictObject({
  phase: z.enum(["bench", "prototype", "pilot", "first-plant", "fleet", "civilization"]),
  what: z.string().min(1),
  /** The scale or throughput at this phase. */
  scale: z.string().min(1),
  /** What this phase proves, so the next can start. */
  proves: z.string().min(1),
});

export const Invention = z.strictObject({
  id,
  title: z.string().min(1),
  domain: id,
  /** The capabilities it serves. */
  for: z.array(id).min(1),
  pitch: z.string().min(1),
  /** How it works: the physics, chemistry, biology or social mechanism. */
  principle: z.string().min(1),
  /** Prior art it builds on, so nothing is reinvented. */
  buildsOn: z.array(Source).min(1),
  experiment: z.strictObject({
    goal: z.string().min(1),
    setup: z.string().min(1),
    measure: z.string().min(1),
    succeedsIf: z.string().min(1),
    /** An estimate in US dollars. */
    costUsd: z.number().positive(),
    months: z.number().positive(),
  }),
  path: z.array(Step).min(3),
  /** What could go wrong, and what the project would try next. Not a verdict. */
  risks: z.string().min(1),
  scene: Scene,
});
export type Invention = z.infer<typeof Invention>;
