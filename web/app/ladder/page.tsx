import { Fragment } from "react";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { Prose } from "../../components/Prose";
import { Scene3D } from "../../components/scene/Scene3D";
import { fillText, ladderBeats, show, site, stageK, stageYear, val } from "../../lib/data";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta({
  href: "/ladder",
  title: "The Ladder",
  description:
    "Every rung of the Kardashev scale from today to the whole Sun: its power, its year in the plan, what limits it and what climbs past it.",
});

export default function Ladder() {
  const { data, model } = site();
  const series = model.eras;
  return (
    <>
      <Header current="/ladder" />
      <main id="content" className="section">
        <h1>The Ladder</h1>
        <p className="section-lead">
          The Kardashev scale rates a civilization by the power it uses. Carl Sagan's version is
          continuous: K = (log10 P − 6) / 10, with P in watts, so each tenth of a step is ten times
          the power. Humanity is at <Prose text="{k-now}" model={model} />. Type I is{" "}
          <Prose text="{type-1-power}" model={model} />, Type II{" "}
          <Prose text="{type-2-power}" model={model} />.
        </p>
        <Scene3D
          kind="ladder"
          colour="#f3c463"
          title="The ladder, rung by rung"
          alt={`The climb from today's ${show("power-now")} to a swarm around the Sun, one rung at a time.`}
          data={{ beats: ladderBeats(), swarmAu: val("swarm-radius") }}
          duration={64}
        />
        <ol className="rungs">
          {data.stages.map((s) => (
            <li key={s.id}>
              <a className="rung" href={`/ladder/${s.id}`}>
                <span className="rung-k">
                  K {stageK(s.power)}
                  <small>{show(s.power)}</small>
                </span>
                <div>
                  <h2 className="rung-title">{s.title}</h2>
                  <p>{fillText(s.picture)}</p>
                </div>
                <span className="rung-year">{stageYear(s.id)}</span>
              </a>
            </li>
          ))}
        </ol>
        <h2>What holds the climb, era by era</h2>
        <p className="section-lead">
          In the model, one limit sets the pace at a time. Move the plan's choices in the{" "}
          <a href="/builder">Builder</a> and the eras move with them.
        </p>
        <dl className="eras">
          {series.map((e) => (
            <Fragment key={e.from}>
              <dt>
                {Math.floor(e.from)} to{" "}
                {Number.isFinite(e.to) ? Math.floor(e.to) : "the end of the run"}
              </dt>
              <dd>{LIMIT[e.limit]}</dd>
            </Fragment>
          ))}
        </dl>
      </main>
      <Footer source="data/stages.yaml" />
    </>
  );
}

const LIMIT: Record<string, string> = {
  "earth-growth": "Earth's own growth in energy use, at the plan's chosen rate.",
  "earth-ceiling":
    "Earth's ceiling: its land's sunlight and the heat it can shed. Growth moves to space.",
  "space-doubling": "Space industry doubling, as fast as self-copying factories can.",
  mass: "Mass: the factories have used all the material the plan lets them mine.",
  sun: "The Sun: every photon the swarm can catch is caught.",
};
