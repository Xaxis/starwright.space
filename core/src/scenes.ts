/**
 * What each 3D scene kind accepts. Data picks a kind and sets these knobs; web/components/scene/kinds
 * draws them. Every kind also tells a story along its progress, 0 to 1: a capability's scene grows
 * from what exists today to its target, and an invention's through the phases of its path, from the
 * bench to civilization scale. Shares are 0 to 1; a number may also be "{id}", a model value.
 */
import { z } from "zod";
import type { SceneKind } from "./schema.ts";

const share = z.union([z.number().min(0).max(1), z.string().regex(/^\{[a-z0-9-]+\}$/)]);
const count = (max: number) => z.number().int().min(1).max(max);

export const SCENE_PARAMS = {
  ladder: z.strictObject({ at: z.number().int().min(0).max(7).optional() }),
  globe: z.strictObject({
    solar: share.optional(),
    grid: share.optional(),
    lights: share.optional(),
    /** Ice, forests and farms restored or grown; 1 is the most the scene draws. */
    ice: share.optional(),
    green: share.optional(),
    /** A ring of industry in orbit, seen from the ground. */
    rings: share.optional(),
    /** What the camera looks at first. */
    look: z.enum(["deserts", "oceans", "cities", "poles", "forests", "farms", "coasts"]).optional(),
  }),
  orbit: z.strictObject({
    stations: share.optional(),
    collectors: share.optional(),
    radiators: share.optional(),
    beams: z.boolean().optional(),
    elevator: z.boolean().optional(),
    depots: share.optional(),
  }),
  moon: z.strictObject({
    bases: share.optional(),
    mines: share.optional(),
    driver: z.boolean().optional(),
    domes: share.optional(),
    telescopes: z.boolean().optional(),
  }),
  swarm: z.strictObject({
    built: share.optional(),
    radiusAu: z.number().min(0.1).max(2).optional(),
    mercury: z.boolean().optional(),
  }),
  mercury: z.strictObject({ mined: share.optional(), drivers: count(12).optional() }),
  replicator: z.strictObject({
    unit: z.enum(["cube", "arm", "cell", "fab"]).optional(),
    generations: count(12).optional(),
    /** The share of its own parts each copy makes; the rest arrives from outside. */
    closure: share.optional(),
  }),
  reactor: z.strictObject({
    type: z.enum(["tokamak", "stellarator", "laser", "fission", "geothermal", "thermal"]),
    glow: share.optional(),
  }),
  lattice: z.strictObject({
    structure: z.enum([
      "nanotube",
      "graphene",
      "diamond",
      "metal",
      "perovskite",
      "silicate",
      "polymer",
      "protein",
      "ice",
    ]),
    defects: share.optional(),
  }),
  machine: z.strictObject({
    shape: z.enum([
      "turbine",
      "chip",
      "motor",
      "engine",
      "panel",
      "battery",
      "arm",
      "printer",
      "tether",
      "electrolyser",
      "membrane",
      "telescope",
      "antenna",
      "drone",
      "vehicle",
      "sail",
    ]),
    spin: share.optional(),
  }),
  field: z.strictObject({
    unit: z.enum([
      "panel",
      "mirror",
      "turbine",
      "greenhouse",
      "tank",
      "fab",
      "rack",
      "house",
      "tower",
      "well",
      "farm",
      "kelp",
    ]),
    count: count(20000).optional(),
    terrain: z.enum(["desert", "sea", "plain", "ice", "regolith", "city"]).optional(),
  }),
  network: z.strictObject({
    nodes: count(5000).optional(),
    clusters: count(40).optional(),
    links: share.optional(),
    pulses: share.optional(),
    shape: z.enum(["globe", "flat", "system"]).optional(),
  }),
  cell: z.strictObject({
    type: z.enum(["microbe", "plant", "animal", "algae", "neuron"]),
    organelles: share.optional(),
    divide: z.boolean().optional(),
    glow: share.optional(),
  }),
  habitat: z.strictObject({
    type: z.enum(["cylinder", "torus", "dome", "sphere", "ship"]),
    spin: share.optional(),
    green: share.optional(),
  }),
  launch: z.strictObject({
    method: z.enum(["rocket", "mass-driver", "tether", "elevator", "loop", "sail"]),
    cadence: share.optional(),
    world: z.enum(["earth", "moon", "mercury", "asteroid"]).optional(),
  }),
  compute: z.strictObject({
    kind: z.enum(["datacentre", "wafer", "swarm", "quantum", "optical"]),
    racks: count(5000).optional(),
    radiators: share.optional(),
    orbit: z.boolean().optional(),
  }),
} satisfies Record<SceneKind, z.ZodType>;

export function sceneProblems(kind: SceneKind, params: unknown): string[] {
  const r = SCENE_PARAMS[kind].safeParse(params);
  return r.success
    ? []
    : r.error.issues.map((i) => `scene.params.${i.path.join(".")}: ${i.message}`);
}
