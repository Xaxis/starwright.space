/**
 * Every scene kind, loaded on demand so a page downloads only the kinds it shows. The names are
 * core's SCENE_KINDS (what data/ may ask for) plus the tower, which only its page uses.
 */
import type { SceneKind } from "@starwright/core";
import type { Kind } from "../types.ts";

export type KindName = SceneKind | "tower";

type Loader = () => Promise<{ default: Kind }>;

export const KINDS: Record<KindName, Loader> = {
  ladder: () => import("./ladder.ts"),
  globe: () => import("./globe.ts"),
  orbit: () => import("./orbit.ts"),
  moon: () => import("./moon.ts"),
  swarm: () => import("./swarm.ts"),
  mercury: () => import("./mercury.ts"),
  replicator: () => import("./replicator.ts"),
  reactor: () => import("./reactor.ts"),
  lattice: () => import("./lattice.ts"),
  machine: () => import("./machine.ts"),
  field: () => import("./field.ts"),
  network: () => import("./network.ts"),
  cell: () => import("./cell.ts"),
  habitat: () => import("./habitat.ts"),
  launch: () => import("./launch.ts"),
  compute: () => import("./compute.ts"),
  tower: () => import("./tower.ts"),
};
