/**
 * A mass driver: a straight track of coils on a world's surface, slugs racing up it in packets,
 * then flung off into space as a spreading stream. Shared by the Moon, Mercury and launch scenes.
 */
import type * as THREE from "three";
import type { KindContext } from "../../types.ts";
import { type Bag, type Materials, makeTrack, type Shapes } from "./craft.ts";
import { type Flow, makeFlow } from "./points.ts";
import { makeRibbons, type Ribbons } from "./ribbons.ts";

export interface Driver {
  group: THREE.Group;
  /** Share of the track's coils laid, 0 to 1. */
  laid(share: number): void;
  /** Whether slugs fly, 0 to 1. */
  firing(on: number): void;
  update(time: number, pixel: number): void;
  dispose(): void;
}

export interface DriverOptions {
  /** The track's ends, just above the surface. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Where the stream goes once it leaves the track, and how it bows. */
  to: THREE.Vector3;
  bend: THREE.Vector3;
  coils: number;
  coilSize: number;
  /** Slug size on the track, and the stream's width at its far end. */
  slug: number;
  width: number;
  /** Launches: 0 to 1, more packets in flight and faster. */
  cadence: number;
  colour: string;
  accent: string;
  seed: number;
  /** Points in the stream, before detail. */
  count?: number;
}

export function makeDriver(
  ctx: KindContext,
  s: Shapes,
  m: Materials,
  bag: Bag,
  o: DriverOptions,
): Driver {
  const T = ctx.three;
  const group = new T.Group();
  const coils = makeTrack(ctx, s, m, bag, o.coils, o.a.distanceTo(o.b), o.coilSize);
  const holder = new T.Group();
  holder.position.copy(o.a);
  holder.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), o.b.clone().sub(o.a).normalize());
  holder.add(coils);
  group.add(holder);
  const rail: Ribbons = makeRibbons(ctx, [{ points: [o.a, o.b] }], {
    colour: o.accent,
    width: 1.1,
    pulses: 4,
    speed: 1.5,
    base: 0.8,
  });
  group.add(rail.mesh);
  const packets = Math.round(3 + o.cadence * 9);
  const run: Flow = makeFlow(ctx, {
    count: 40 * packets,
    colour: "#fff2d0",
    colourB: "#ffffff",
    size: o.slug,
    minPx: 1.8,
    maxPx: 6,
    rate: 0.25 + o.cadence * 0.35,
    width: 0,
    seed: o.seed,
    accel: 2.4,
    packets,
    gain: 1.7,
  });
  run.from.copy(o.a);
  run.to.copy(o.b);
  const fling: Flow = makeFlow(ctx, {
    count: o.count ?? 900,
    colour: o.colour,
    colourB: o.accent,
    size: o.slug * 2.5,
    minPx: 1.3,
    maxPx: 5,
    rate: 0.035 + o.cadence * 0.03,
    width: o.width,
    fan: 1,
    seed: o.seed + 1,
    packets: Math.round(12 + o.cadence * 40),
    gain: 1.4,
  });
  fling.from.copy(o.b);
  fling.to.copy(o.to);
  fling.bend.copy(o.bend);
  group.add(run.points, fling.points);
  return {
    group,
    laid(share) {
      coils.count = Math.round(o.coils * share);
      rail.reveal.value = share * 1.02;
    },
    firing(on) {
      run.on.value = on;
      fling.on.value = on;
    },
    update(time, pixel) {
      rail.update(time);
      run.update(time, pixel);
      fling.update(time, pixel);
    },
    dispose() {
      rail.dispose();
      run.dispose();
      fling.dispose();
    },
  };
}
