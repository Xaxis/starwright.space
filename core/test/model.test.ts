import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../src/load.ts";
import { type Model, run, SAGAN } from "../src/model.ts";

const data = loadData();
const base = run(data.constants, data.assumptions);
const v = (m: Model, id: string) => {
  const q = m.q.get(id);
  assert.ok(q, `no quantity ${id}`);
  return q.value;
};

test("today's rating comes from today's measured energy supply", () => {
  const ej = data.constants["energy-supply"]?.value ?? 0;
  const watts = (ej * 1e18) / 3.15576e7;
  assert.equal(v(base, "power-now"), watts);
  assert.equal(v(base, "k-now"), SAGAN(watts));
  assert.ok(v(base, "k-now") > 0.7 && v(base, "k-now") < 0.75);
});

test("the rungs are reached in order, each after the last", () => {
  const ids = ["k08", "k09", "type-1", "planet", "k15", "type-2"];
  const years = ids.map((id) => v(base, `year-${id}`));
  for (let i = 1; i < years.length; i++) {
    assert.ok(
      (years[i] as number) >= (years[i - 1] as number),
      `${ids[i]} comes before ${ids[i - 1]}`,
    );
  }
  assert.ok(v(base, "year-k08") > v(base, "base-year"));
});

test("Earth's ceiling is its land's sunlight plus the heat it may shed", () => {
  assert.equal(v(base, "earth-cap"), v(base, "surface-solar-cap") + v(base, "heat-cap-power"));
  // The ceiling sits below Type I: Type I has to be climbed in space.
  assert.ok(v(base, "earth-cap") < v(base, "type-1-power"));
});

test("faster-copying factories reach Type II sooner", () => {
  const fast = run(data.constants, data.assumptions, { "doubling-time": 1 });
  assert.ok(v(fast, "year-type-2") < v(base, "year-type-2"));
  assert.deepEqual(fast.changed, ["doubling-time"]);
});

test("collectors as heavy as a published design run out of mass before Type II", () => {
  const heavy = data.constants["armstrong-sandberg-density"]?.value ?? 3.92;
  const m = run(data.constants, data.assumptions, { "collector-density": heavy });
  assert.equal(v(m, "year-type-2"), Number.POSITIVE_INFINITY);
  assert.ok(v(m, "swarm-mass-share") > 1);
});

test("power never falls and K follows power", () => {
  const { total, k } = base.series;
  for (let i = 1; i < total.length; i++)
    assert.ok((total[i] as number) >= (total[i - 1] as number) * (1 - 1e-12));
  for (let i = 0; i < total.length; i += 997)
    assert.ok(Math.abs((k[i] as number) - SAGAN(total[i] as number)) < 1e-9);
});

test("the limits of physics follow from their constants", () => {
  // Landsberg: sunlight from 5,772 K worked against a 300 K sink gives about 93 percent.
  const x = 300 / 5772;
  assert.equal(v(base, "landsberg-limit"), 1 - (4 / 3) * x + x ** 4 / 3);
  assert.ok(Math.abs(v(base, "landsberg-limit") - 0.9307) < 1e-4);
  // A colder sink lets more of the light become work.
  const cold = run(data.constants, data.assumptions, { "sink-temperature": 100 });
  assert.ok(v(cold, "landsberg-limit") > v(base, "landsberg-limit"));
  // Mercury's sunlight from the inverse square matches NASA's 9,082.7 W/m2 to a part in a thousand.
  assert.ok(Math.abs(v(base, "mercury-irradiance") / 9082.7 - 1) < 1e-3);
  assert.equal(v(base, "lunar-night"), v(base, "lunar-synodic-day") / 2);
  assert.equal(v(base, "gpu-vs-landauer"), v(base, "gpu-energy-per-op") / v(base, "landauer-300k"));
});
