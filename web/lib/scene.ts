import "server-only";
/**
 * A record's scene as the page hands it to Scene3D: its params with every "{id}" replaced by the
 * model's value, and its story. A capability's story runs from what exists to its target; an
 * invention's through the phases of its path; a stage's through the ladder.
 */
import type { Capability, Invention, Scene, Stage } from "@starwright/core";
import type { Beat, Params } from "../components/scene/types";
import { fillText, firstSentence, ladderBeats, site, val } from "./data";

export function sceneParams(scene: Scene): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(scene.params)) {
    const m = typeof v === "string" ? /^\{([a-z0-9-]+)\}$/.exec(v) : null;
    out[k] = m ? val(m[1] as string) : v;
  }
  return out;
}

const PHASE: Record<string, string> = {
  bench: "On the bench",
  prototype: "Prototype",
  pilot: "Pilot",
  "first-plant": "First plant",
  fleet: "Fleet",
  civilization: "Civilization scale",
};

export function inventionBeats(i: Invention): Omit<Beat, "at">[] {
  return i.path.map((p) => ({
    title: PHASE[p.phase] ?? p.phase,
    caption: `${fillText(p.what)} ${fillText(p.scale)}.`.replace(/\.\.$/, "."),
    meter: PHASE[p.phase],
  }));
}

export function capabilityBeats(c: Capability): Omit<Beat, "at">[] {
  return [
    { title: "What exists", caption: firstSentence(c.exists[0]?.text ?? ""), meter: "Today" },
    { title: "The gap", caption: firstSentence(fillText(c.gap)), meter: "Missing" },
    { title: "The target", caption: firstSentence(fillText(c.target)), meter: "Needed" },
  ];
}

export function stageScene(s: Stage) {
  const { data } = site();
  if (s.scene.kind === "ladder") {
    const at = Number(s.scene.params.at ?? data.stages.indexOf(s));
    return {
      data: { beats: ladderBeats(), swarmAu: val("swarm-radius") },
      params: {},
      start: at / 7,
    };
  }
  return {
    data: { beats: [{ title: s.title, caption: firstSentence(fillText(s.picture)) }] },
    params: sceneParams(s.scene),
    start: 1,
  };
}
