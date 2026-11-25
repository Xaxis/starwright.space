import "server-only";
/** The tower's graph: every capability placed by area and rung, and the links between them. */
import type { TowerData } from "../components/scene/kinds/tower";
import { ladderBeats, site } from "./data";

export function towerData(focus?: string): TowerData {
  const { data } = site();
  const d = new Map(data.domains.map((x, i) => [x.id, i]));
  const s = new Map(data.stages.map((x, i) => [x.id, i]));
  const index = new Map(data.capabilities.map((c, i) => [c.id, i]));
  const edges: [number, number][] = [];
  data.capabilities.forEach((c, i) => {
    for (const need of c.needs) {
      const j = index.get(need);
      if (j !== undefined) edges.push([j, i]);
    }
  });
  return {
    beats: ladderBeats(),
    stages: data.stages.map((x) => x.title),
    domains: data.domains.map((x) => ({ title: x.title, colour: x.colour })),
    nodes: data.capabilities.map((c) => ({
      id: c.id,
      title: c.title,
      d: d.get(c.domain) ?? 0,
      s: s.get(c.stage) ?? 0,
      inventions: c.inventions.length,
    })),
    edges,
    focus: focus === undefined ? undefined : d.get(focus),
  };
}
