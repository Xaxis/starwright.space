import assert from "node:assert/strict";
import { test } from "node:test";
import { SCENE_KINDS, sceneProblems } from "@starwright/core";
import { KINDS } from "../components/scene/kinds/index.ts";
import { LAB_DEFAULTS } from "../lib/lab.ts";

test("every scene kind data may ask for has a kind that loads", async () => {
  for (const k of [...SCENE_KINDS, "tower"] as const) {
    const load = KINDS[k];
    assert.ok(load, `no loader for ${k}`);
    const mod = await load();
    assert.equal(typeof mod.default, "function", `${k} has no default kind`);
  }
});

test("the lab's default params are valid for their kinds", () => {
  for (const [k, p] of Object.entries(LAB_DEFAULTS)) {
    if (k === "tower") continue;
    assert.deepEqual(sceneProblems(k as (typeof SCENE_KINDS)[number], p), [], k);
  }
});
