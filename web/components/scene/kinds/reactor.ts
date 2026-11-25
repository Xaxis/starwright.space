/**
 * A power source from first light to a fleet. The story starts close on the machine, cold, its
 * field or beams or drill just coming alive; it lights (a tokamak's or stellarator's plasma, a laser
 * shot igniting its target, a fission core going critical in Cherenkov blue, water running through
 * rock hot enough to glow, a vessel of melt heating to white), then the camera pulls back to the
 * plant built round it and rises over the land as copies spread and the grid joins them.
 *
 * Units: the machine is about 2 across at the origin; the fleet spreads over some 3,500.
 * Progress: ignition by 0.3, the plant to 0.6, the fleet to 1. Glow scales how bright it burns.
 */
import {
  Bin,
  flight,
  lin,
  makeBackdrop,
  pixelScale,
  ramp,
  type Shot,
  share,
  storyBeats,
} from "../lib/matter/common.ts";
import { makeSite } from "../lib/matter/plant.ts";
import { makeMachine, type ReactorType } from "../lib/matter/reactors.ts";
import type { Kind } from "../types.ts";

const TYPES: ReactorType[] = [
  "tokamak",
  "stellarator",
  "laser",
  "fission",
  "geothermal",
  "thermal",
];

const reactor: Kind = (ctx) => {
  const T = ctx.three;
  const bin = new Bin();
  const { scene, camera } = ctx;
  const type = (
    TYPES.includes(ctx.params.type as ReactorType) ? ctx.params.type : "tokamak"
  ) as ReactorType;
  const glow = share(ctx.params.glow, 0.8);

  const back = makeBackdrop(ctx, bin, {
    top: "#0a1020",
    bottom: "#05070d",
    haze: ctx.colour,
    amount: 0.04,
  });
  scene.add(back.mesh);
  const machine = makeMachine(ctx, bin, type, glow);
  scene.add(machine.group);
  const geo = type === "geothermal";
  const site = makeSite(ctx, bin, {
    floor: machine.floor,
    hall: geo ? 0 : machine.radius * 1.7,
    tower: type !== "geothermal" && type !== "thermal",
    core: machine.core,
    xray: geo ? [0, 3, 9] : undefined,
  });
  scene.add(site.group);
  // A faint light of the machine's own colour on the floor under it once it burns.
  const pool = new T.Mesh(
    bin.add(new T.CircleGeometry(machine.radius * 2.2, 48)),
    bin.add(
      new T.MeshBasicMaterial({
        color: lin(ctx, machine.core, 0.08),
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = machine.floor + 0.004;
  if (!geo) scene.add(pool);
  const poolK = 0.25;

  // The camera: close on the machine, closer as it lights, back to the plant, up over the fleet.
  const r = machine.radius;
  const f = machine.floor;
  const shots: Shot[] = geo
    ? [
        { at: 0, d: 10.5, target: [0, -1.6, 0], az: 1.25, el: 0.3 },
        { at: 0.3, d: 9.5, target: [0, -1.9, 0], az: 1.1, el: 0.24 },
        { at: 0.6, d: 30, target: [0, -1, -3], az: 1.0, el: 0.4 },
        { at: 1, d: 1900, target: [0, 0, -500], az: 1.2, el: 0.36 },
      ]
    : [
        { at: 0, d: r * 3.3, target: [0, machine.centre, 0], az: 1.1, el: 0.32 },
        { at: 0.3, d: r * 3.0, target: [0, machine.centre, 0], az: 1.45, el: 0.26 },
        { at: 0.6, d: r * 18, target: [r * 0.6, f + r * 1.5, -r * 1.5], az: 1.85, el: 0.42 },
        { at: 1, d: 1900, target: [0, f, -400], az: 2.2, el: 0.36 },
      ];
  const pose = flight(T, shots);
  const beats = storyBeats(ctx);
  const px = new T.Vector2();

  return {
    view: pose(0),
    beats,
    pose,
    update(time, _dt, p) {
      const pixels = pixelScale(ctx, px);
      (back.uniforms.uTime as { value: number }).value = time;
      const heat = geo ? ramp(p, 0.14, 0.32) : ramp(p, 0.03, 0.28);
      machine.update(time, heat, p, pixels);
      (pool.material as InstanceType<typeof T.MeshBasicMaterial>).opacity = heat * glow * poolK;
      site.update(time, ramp(p, 0.33, 0.58), ramp(p, 0.6, 0.98), pixels, camera.position.length());
    },
    dispose() {
      bin.dispose();
    },
  };
};

export default reactor;
