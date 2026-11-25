import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import { parseData } from "../src/data.ts";
import { readFiles } from "../src/load.ts";
import { sceneProblems } from "../src/scenes.ts";

const files = readFiles();

/** The files with one record changed, through its parsed form so the test survives reformatting. */
const swap = (path: string, f: (r: Record<string, unknown>) => void) => {
  assert.ok(
    files.some((x) => x.path === path),
    `no file ${path}`,
  );
  return files.map((x) => {
    if (x.path !== path) return x;
    const r = parse(x.text) as Record<string, unknown>;
    f(r);
    return { ...x, text: stringify(r) };
  });
};

test("the exemplar capability parses and links both ways to its invention", () => {
  const d = parseData(files);
  const c = d.capabilities.find((x) => x.id === "self-replicating-factory");
  const i = d.inventions.find((x) => x.id === "seed-foundry");
  assert.ok(c && i);
  assert.ok(c.inventions.includes(i.id));
  assert.ok(i.for.includes(c.id));
});

test("an invention without its first experiment is rejected", () => {
  const broken = swap("inventions/manufacturing/seed-foundry.yaml", (r) => {
    delete r.experiment;
  });
  assert.throws(() => parseData(broken), /seed-foundry/);
});

test("a template naming no model quantity is rejected", () => {
  const broken = swap("inventions/manufacturing/seed-foundry.yaml", (r) => {
    r.pitch = `${r.pitch} {no-such-number}`;
  });
  assert.throws(() => parseData(broken), /no-such-number/);
});

test("a capability needing something nobody defines is rejected", () => {
  const broken = swap("capabilities/manufacturing/self-replicating-factory.yaml", (r) => {
    (r.needs as string[]).push("no-such-capability");
  });
  assert.throws(() => parseData(broken), /no-such-capability/);
});

test("scene params are checked against their kind", () => {
  assert.deepEqual(sceneProblems("reactor", { type: "tokamak", glow: 0.5 }), []);
  assert.ok(sceneProblems("reactor", { type: "warp" }).length > 0);
  assert.ok(sceneProblems("orbit", { colour: "red" }).length > 0);
  assert.deepEqual(sceneProblems("swarm", { built: "{swarm-mass-share}" }), []);
});
