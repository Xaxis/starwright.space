"use client";
/**
 * The Builder: the plan's choices as sliders. Every change reruns the model here in the browser
 * (core is browser-safe), re-dates every rung, redraws the power curve and moves the ladder scene to
 * the year the reader picks. The choices live in the link (?set=id=value,...), so a variant can be
 * shared.
 */
import { type Assumption, type Constant, format, type Model, run, SAGAN } from "@starwright/core";
import { useEffect, useMemo, useState } from "react";
import { Scene3D } from "../scene/Scene3D";
import { PowerChart } from "./PowerChart";

interface Props {
  constants: Record<string, Constant>;
  assumptions: Record<string, Assumption>;
  stages: { id: string; title: string; power: string }[];
}

const GROUPS: { title: string; ids: string[] }[] = [
  {
    title: "Earth",
    ids: ["earth-growth", "land-share", "surface-insolation", "pv-efficiency", "heat-limit"],
  },
  { title: "The self-copying factories", ids: ["seed-year", "seed-mass", "doubling-time"] },
  {
    title: "The swarm and its material",
    ids: [
      "collector-density",
      "collector-efficiency",
      "collector-share",
      "swarm-radius",
      "mercury-usable",
      "asteroid-usable",
    ],
  },
];

const BASIS: Record<string, string> = {
  physics: "Physics",
  precedent: "Precedent",
  invented: "Invented",
  choice: "Choice",
};

function readLink(assumptions: Record<string, Assumption>): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = new URLSearchParams(window.location.search).get("set");
  if (!raw) return out;
  for (const pair of raw.split(",")) {
    const [id, v] = pair.split("=");
    const a = id ? assumptions[id] : undefined;
    const x = Number(v);
    if (a && Number.isFinite(x)) out[id as string] = Math.min(a.max, Math.max(a.min, x));
  }
  return out;
}

const yearOf = (m: Model, id: string) =>
  id === "now" ? (m.q.get("base-year")?.value ?? 0) : (m.q.get(`year-${id}`)?.value ?? Infinity);
const show = (m: Model, id: string) => {
  const q = m.q.get(id);
  return q ? format(q.value, q.unit) : "";
};

export function Builder({ constants, assumptions, stages }: Props) {
  const [set, setSet] = useState<Record<string, number>>({});
  // The link is read once, before anything writes it back.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSet(readLink(assumptions));
    setLoaded(true);
  }, [assumptions]);
  useEffect(() => {
    if (!loaded) return;
    const ids = Object.keys(set).filter((id) => set[id] !== assumptions[id]?.value);
    const url = new URL(window.location.href);
    if (ids.length) url.searchParams.set("set", ids.map((id) => `${id}=${set[id]}`).join(","));
    else url.searchParams.delete("set");
    window.history.replaceState(null, "", url);
  }, [set, assumptions, loaded]);

  const published = useMemo(() => run(constants, assumptions), [constants, assumptions]);
  const { model, error } = useMemo(() => {
    try {
      return { model: run(constants, assumptions, set), error: "" };
    } catch (e) {
      return { model: published, error: String((e as Error).message ?? e) };
    }
  }, [constants, assumptions, set, published]);

  const base = yearOf(model, "now");
  const sunYear = yearOf(model, "sun");
  const end = Math.min(base + 600, Number.isFinite(sunYear) ? Math.ceil(sunYear + 25) : base + 600);
  const [year, setYear] = useState<number | undefined>(undefined);
  const at = Math.min(end, year ?? base);

  // Where that year sits on the ladder: between the rungs whose years bracket it.
  const rungYears = stages.map((s) => yearOf(model, s.id));
  let progress = 0;
  for (let i = 0; i < rungYears.length - 1; i++) {
    const a = rungYears[i] as number;
    const b = rungYears[i + 1] as number;
    if (at >= a)
      progress =
        Number.isFinite(b) && b > a
          ? (i + Math.min(1, (at - a) / (b - a))) / (stages.length - 1)
          : i / (stages.length - 1);
  }
  const beats = stages.map((s) => {
    const y = yearOf(model, s.id);
    const k = SAGAN(model.q.get(s.power)?.value ?? 1);
    return {
      title: s.title,
      caption: "",
      meter: `K ${k.toFixed(2)} · ${Number.isFinite(y) ? Math.floor(y) : "never"}`,
    };
  });
  const changed = Object.keys(set).filter((id) => set[id] !== assumptions[id]?.value);

  return (
    <div className="builder">
      <div className="builder-stage">
        <Scene3D
          kind="ladder"
          colour="#f3c463"
          title="The ladder at the year you pick"
          alt="The climb from today's Earth to a swarm around the Sun, at the year chosen below."
          data={{ beats, swarmAu: model.q.get("swarm-radius")?.value ?? 0.6 }}
          progress={progress}
        />
        <div className="builder-year">
          <label htmlFor="builder-year">
            Year <strong>{Math.floor(at)}</strong>
            <span>
              {" "}
              · {format(powerAt(model, at), "W")} · K {SAGAN(powerAt(model, at)).toFixed(2)}
            </span>
          </label>
          <input
            id="builder-year"
            type="range"
            min={base}
            max={end}
            step={1}
            value={at}
            onChange={(e) => setYear(Number(e.currentTarget.value))}
          />
        </div>
        {error ? <p className="builder-error">This variant breaks the model: {error}</p> : null}
        <PowerChart model={model} from={base} to={end} year={at} onYear={setYear} />
        <div className="table-wrap">
          <table className="ledger">
            <caption className="sr-only">Each rung's year, published and in this variant</caption>
            <thead>
              <tr>
                <th scope="col">Rung</th>
                <th scope="col">Power</th>
                <th scope="col" className="n">
                  Published
                </th>
                <th scope="col" className="n">
                  This variant
                </th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const a = yearOf(published, s.id);
                const b = yearOf(model, s.id);
                const d = Number.isFinite(a) && Number.isFinite(b) ? Math.round(b - a) : undefined;
                return (
                  <tr key={s.id}>
                    <th scope="row">
                      <a href={`/ladder/${s.id}`}>{s.title}</a>
                    </th>
                    <td>{show(model, s.power)}</td>
                    <td className="n">{Number.isFinite(a) ? Math.floor(a) : "never"}</td>
                    <td className="n">
                      {Number.isFinite(b) ? Math.floor(b) : "never"}
                      {d ? (
                        <small className={d > 0 ? "later" : "sooner"}>
                          {" "}
                          {d > 0 ? `+${d}` : d} yr
                        </small>
                      ) : null}
                      {!Number.isFinite(b) && Number.isFinite(a) ? (
                        <small className="later"> was {Math.floor(a)}</small>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="builder-facts">
          <div>
            <dt>Earth's ceiling</dt>
            <dd>{show(model, "earth-cap")}</dd>
          </div>
          <div>
            <dt>Space overtakes Earth</dt>
            <dd>{show(model, "year-space-overtakes")}</dd>
          </div>
          <div>
            <dt>First factory to the whole Sun</dt>
            <dd>{show(model, "years-seed-to-sun")}</dd>
          </div>
          <div>
            <dt>Doublings that takes</dt>
            <dd>{show(model, "doublings-to-sun")}</dd>
          </div>
          <div>
            <dt>Mined mass a full swarm needs</dt>
            <dd>{show(model, "swarm-mass-share")} of what is reachable</dd>
          </div>
          <div>
            <dt>Type I on Earth would heat it like</dt>
            <dd>{show(model, "type-1-heat-vs-co2")} a CO2 doubling</dd>
          </div>
        </dl>
      </div>

      <form
        className="builder-knobs"
        onSubmit={(e) => e.preventDefault()}
        aria-label="The plan's choices"
      >
        <div className="builder-knobs-head">
          <p>
            {changed.length === 0
              ? "The published plan."
              : `${changed.length} choice${changed.length > 1 ? "s" : ""} changed.`}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={changed.length === 0}
            onClick={() => setSet({})}
          >
            Reset all
          </button>
        </div>
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.ids.map((id) => {
              const a = assumptions[id];
              if (!a) return null;
              const v = set[id] ?? a.value;
              const toPos = (x: number) => (a.log ? Math.log10(x) : x);
              const fromPos = (x: number) => (a.log ? 10 ** x : x);
              const lo = toPos(a.min);
              const hi = toPos(a.max);
              return (
                <div key={id} className={`knob${v !== a.value ? " is-changed" : ""}`}>
                  <label htmlFor={`k-${id}`}>
                    {a.label}
                    <span className={`basis basis-${a.basis}`}>{BASIS[a.basis]}</span>
                  </label>
                  <div className="knob-row">
                    <input
                      id={`k-${id}`}
                      type="range"
                      min={lo}
                      max={hi}
                      step={(hi - lo) / 400}
                      value={toPos(v)}
                      aria-valuetext={format(v, a.unit)}
                      onChange={(e) => {
                        const x = fromPos(Number(e.currentTarget.value));
                        setSet((s) => ({ ...s, [id]: Number(x.toPrecision(3)) }));
                      }}
                    />
                    <output htmlFor={`k-${id}`}>{format(v, a.unit)}</output>
                  </div>
                  {v !== a.value ? (
                    <button
                      type="button"
                      className="knob-reset"
                      onClick={() =>
                        setSet((s) => {
                          const { [id]: _, ...rest } = s;
                          return rest;
                        })
                      }
                    >
                      Back to {format(a.value, a.unit)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ))}
        <p className="builder-note">
          Each choice links to its reason on <a href="/numbers#chosen">Every Number</a>. Invented
          ones are guesses for technologies that do not exist yet: the ones most worth testing.
        </p>
      </form>
    </div>
  );
}

/** Total power in a year, read off the model's series. */
export function powerAt(m: Model, year: number): number {
  const ys = m.series.year;
  const first = ys[0] ?? year;
  const step = ys.length > 1 ? (ys[1] as number) - first : 1;
  const i = Math.max(0, Math.min(ys.length - 1, Math.round((year - first) / step)));
  return m.series.total[i] ?? 0;
}
