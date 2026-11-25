/**
 * The lab: every scene kind on its own page, for building and reviewing scenes. Each kind has a
 * default set of params (the required ones filled in) and two stories to scrub through: an
 * invention's six phases and a capability's three steps.
 */
import { SCENE_KINDS } from "@starwright/core";
import type { KindName } from "../components/scene/kinds/index";
import type { Params } from "../components/scene/types";

export const LAB_KINDS: KindName[] = [
  "ladder",
  ...SCENE_KINDS.filter((k) => k !== "ladder"),
  "tower",
];

export const LAB_DEFAULTS: Partial<Record<KindName, Params>> = {
  reactor: { type: "tokamak", glow: 0.8 },
  lattice: { structure: "graphene", defects: 0.05 },
  machine: { shape: "turbine" },
  field: { unit: "panel", count: 2000, terrain: "desert" },
  network: { nodes: 300, clusters: 6, links: 0.5, shape: "globe" },
  cell: { type: "microbe" },
  habitat: { type: "cylinder" },
  launch: { method: "rocket", world: "earth" },
  compute: { kind: "datacentre" },
  replicator: { unit: "fab", generations: 8, closure: 0.9 },
};

export const STORIES = {
  invention: [
    {
      title: "On the bench",
      caption: "One unit on a lab bench, proving the principle.",
      meter: "On the bench",
    },
    { title: "Prototype", caption: "A working prototype at a useful size.", meter: "Prototype" },
    { title: "Pilot", caption: "A pilot runs for a year in the real setting.", meter: "Pilot" },
    {
      title: "First plant",
      caption: "The first full-size plant, built to be copied.",
      meter: "First plant",
    },
    { title: "Fleet", caption: "Hundreds of copies, each cheaper than the last.", meter: "Fleet" },
    {
      title: "Civilization scale",
      caption: "Enough of them to carry a civilization.",
      meter: "Civilization scale",
    },
  ],
  capability: [
    { title: "What exists", caption: "Where the world is today.", meter: "Today" },
    { title: "The gap", caption: "What is still missing.", meter: "Missing" },
    { title: "The target", caption: "What the climb needs.", meter: "Needed" },
  ],
};
