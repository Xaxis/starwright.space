/**
 * Compute: the smallest working part close up, then the installation growing to its full count.
 * Five machines (lib/systems/computers.ts): halls of racks on a desert at night with glowing dry
 * coolers, or modules in orbit behind red radiator wings; wafers written by electron beams in
 * sealed chambers, or turning in a shield's shadow in orbit; a swarm of compute leaves with laser
 * links; dilution-fridge chandeliers with their qubits; photonic chips threaded with light.
 */
import { COMPUTERS } from "../lib/systems/computers.ts";
import { clamp01, grouped, storyBeats } from "../lib/systems/kit.ts";
import type { Kind } from "../types.ts";

const compute: Kind = (ctx) => {
  const P = ctx.params;
  const name = String(P.kind ?? "datacentre") as keyof typeof COMPUTERS;
  const build = COMPUTERS[name] ?? COMPUTERS.datacentre;
  const racks = Math.max(1, Math.round(Number(P.racks ?? 200)));
  const world = build(ctx, {
    racks,
    radiators: clamp01(Number(P.radiators ?? 0.3)),
    orbit: P.orbit === true || P.orbit === "true",
  });
  const beats = storyBeats(ctx).map((b) => {
    const k = Math.max(1, Math.round(1 + (racks - 1) * world.built(b.at)));
    return { ...b, meter: `${b.meter ?? b.title} · ${grouped(k)} ${world.noun[k === 1 ? 0 : 1]}` };
  });
  const size = new ctx.three.Vector2();
  return {
    view: world.pose(0),
    beats,
    pose: (p) => world.pose(p),
    update(time, _dt, p) {
      ctx.renderer.getSize(size);
      world.update(time, p, size.y * ctx.renderer.getPixelRatio());
    },
    dispose: () => world.dispose(),
  };
};

export default compute;
