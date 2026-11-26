import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Prose } from "../components/Prose";
import { Scene3D } from "../components/scene/Scene3D";
import {
  fillText,
  firstSentence,
  ladderBeats,
  show,
  site,
  stageK,
  stageYear,
  val,
} from "../lib/data";
import { TAGLINE } from "../lib/site";

export default function Home() {
  const { data, model } = site();
  const experiments = [...data.inventions].sort(
    (a, b) => a.experiment.costUsd - b.experiment.costUsd,
  );
  return (
    <>
      <Header current="/" />
      <main id="content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-title">
            <h1 id="home-title">The climb to Type II, built one invention at a time</h1>
            <p>
              Starwright: {TAGLINE}. What exists, what is missing, and the experiment that would
              prove each missing piece.
            </p>
          </div>
          <Scene3D
            kind="ladder"
            variant="hero"
            colour="#f3c463"
            title="The climb from today's Earth to a swarm around the Sun"
            alt={`From today's Earth at ${show("power-now")} to a swarm that harnesses ${show("sun-harnessed")}, one rung of the Kardashev ladder at a time.`}
            data={{ beats: ladderBeats(), swarmAu: val("swarm-radius") }}
            autoplay
            duration={64}
          />
        </section>

        <section className="section" aria-labelledby="ladder-h">
          <div className="section-head">
            <h2 id="ladder-h">The ladder</h2>
            <p className="section-lead">
              Humanity uses <Prose text="{power-now}" model={model} />, a Kardashev rating of{" "}
              <Prose text="{k-now}" model={model} />. Each rung below is ten times or more the last.
              The years are the model's, from the plan's choices; the <a href="/builder">Builder</a>{" "}
              moves them.
            </p>
          </div>
          <ol className="rungs">
            {data.stages.map((s) => (
              <li key={s.id}>
                <a className="rung" href={`/ladder/${s.id}`}>
                  <span className="rung-k">
                    K {stageK(s.power)}
                    <small>{show(s.power)}</small>
                  </span>
                  <div>
                    <h3 className="rung-title">{s.title}</h3>
                    <p>{firstSentence(fillText(s.limit))}</p>
                  </div>
                  <span className="rung-year">{stageYear(s.id)}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="section section-essay" aria-labelledby="heat-h">
          <div className="section-head">
            <h2 id="heat-h">Why Type I is climbed in space</h2>
            <p className="section-lead">
              <Prose
                text="Type I is {type-1-power}. Used on Earth, all of it ends as heat: {type-1-earth-heat}, {type-1-heat-vs-co2} the warming push of doubling CO2. Earth's surface can use at most about {earth-cap}, panels on the land and the new heat it can shed. So the plan moves industry and computing to orbit, where sunlight is free and space takes the heat, and grows it by factories that copy themselves. The first starts in {seed-year}; from there the industry doubles every {doubling-time}."
                model={model}
              />
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="areas-h">
          <div className="section-head">
            <h2 id="areas-h">Every area</h2>
            <p className="section-lead">
              The climb needs every field at once. Each area lists what it must be able to do, what
              already exists toward it, and what this project invents where nothing does.
            </p>
          </div>
          <ul className="cards">
            {data.domains.map((d) => {
              const n = data.capabilities.filter((c) => c.domain === d.id).length;
              const k = data.inventions.filter((c) => c.domain === d.id).length;
              return (
                <li key={d.id}>
                  <a
                    className="card"
                    href={`/domains/${d.id}`}
                    style={{ "--area": d.colour } as React.CSSProperties}
                  >
                    <span className="card-kicker">
                      {n} capabilities · {k} inventions
                    </span>
                    <h3 className="card-title">{d.title}</h3>
                    <p>{d.role}</p>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {experiments.length > 0 ? (
          <section className="section" aria-labelledby="start-h">
            <div className="section-head">
              <h2 id="start-h">Start here</h2>
              <p className="section-lead">
                Every invention begins with one experiment. These are the cheapest first. Pick one,
                run it, and report what you find.
              </p>
            </div>
            <ul className="cards">
              {experiments.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <a className="card" href={`/inventions/${i.id}`}>
                    <span className="card-kicker">
                      ${i.experiment.costUsd.toLocaleString("en-US")} · {i.experiment.months} months
                    </span>
                    <h3 className="card-title">{i.title}</h3>
                    <p>{i.experiment.goal}</p>
                  </a>
                </li>
              ))}
            </ul>
            <p className="more">
              <a href="/start">Every first experiment, cheapest first</a>
            </p>
          </section>
        ) : null}
      </main>
      <Footer source="data/stages.yaml" />
    </>
  );
}
