import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { Header } from "../../../components/Header";
import { Prose } from "../../../components/Prose";
import { Sources } from "../../../components/Sources";
import { Scene3D } from "../../../components/scene/Scene3D";
import { capability, domainOf, fillText, invention, site } from "../../../lib/data";
import { pageMeta } from "../../../lib/meta";
import { inventionBeats, sceneParams } from "../../../lib/scene";
import { REPO } from "../../../lib/site";

export function generateStaticParams() {
  return site().data.inventions.map((i) => ({ id: i.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const i = invention(id);
  if (!i) return {};
  return pageMeta({ href: `/inventions/${id}`, title: i.title, description: fillText(i.pitch) });
}

const PHASE: Record<string, string> = {
  bench: "On the bench",
  prototype: "Prototype",
  pilot: "Pilot",
  "first-plant": "First plant",
  fleet: "Fleet",
  civilization: "Civilization scale",
};

export default async function InventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { model } = site();
  const i = invention(id);
  if (!i) notFound();
  const d = domainOf(i.domain);
  const serves = i.for.map((c) => capability(c)).filter((x) => x !== undefined);
  const e = i.experiment;
  const issue = `${REPO}/issues/new?${new URLSearchParams({
    title: `Experiment: ${i.title}`,
    body: `I would like to run, or have run, the first experiment for ${i.title} (data/inventions/${i.domain}/${i.id}.yaml).\n\nWho:\nWhere:\nWhat I measured:\nResult against the success criterion:\n`,
  })}`;
  return (
    <>
      <Header current="/inventions" />
      <main id="content" className="record" style={{ "--area": d.colour } as React.CSSProperties}>
        <div className="record-head">
          <p className="eyebrow">
            <span className="chip chip-invented">Invented here, untested</span>{" "}
            <span className="area-dot" aria-hidden="true" />
            <a href={`/domains/${d.id}`}>{d.title}</a>
          </p>
          <h1>{i.title}</h1>
          <p className="record-pitch">
            <Prose text={i.pitch} model={model} />
          </p>
          {serves.length > 0 ? (
            <div className="chips">
              <span>For:</span>
              {serves.map((c) => (
                <a key={c.id} className="chip" href={`/capabilities/${c.id}`}>
                  {c.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="record-grid">
          <div className="record-scene">
            <Scene3D
              kind={i.scene.kind}
              params={sceneParams(i.scene)}
              data={{ beats: inventionBeats(i) }}
              colour={d.colour}
              title={i.title}
              alt={i.scene.focus}
            />
          </div>
          <div className="facts">
            <section>
              <h2>How it works</h2>
              <p>
                <Prose text={i.principle} model={model} />
              </p>
            </section>
            <section className="experiment" aria-labelledby="exp-h">
              <h2 id="exp-h">The first experiment</h2>
              <dl>
                <dt>Goal</dt>
                <dd>
                  <Prose text={e.goal} model={model} />
                </dd>
                <dt>Setup</dt>
                <dd>
                  <Prose text={e.setup} model={model} />
                </dd>
                <dt>Measure</dt>
                <dd>
                  <Prose text={e.measure} model={model} />
                </dd>
                <dt>Succeeds if</dt>
                <dd>
                  <Prose text={e.succeedsIf} model={model} />
                </dd>
                <dt>Cost</dt>
                <dd>About ${e.costUsd.toLocaleString("en-US")} (an estimate)</dd>
                <dt>Time</dt>
                <dd>{e.months} months</dd>
              </dl>
              <p>
                <a href={issue}>Run it, or report a result</a>
              </p>
            </section>
            <section>
              <h2>From the bench to civilization scale</h2>
              <ol className="path">
                {i.path.map((p) => (
                  <li key={p.phase}>
                    <span className="path-phase">{PHASE[p.phase]}</span>
                    <span className="path-scale">
                      <Prose text={p.scale} model={model} />
                    </span>
                    <Prose text={p.what} model={model} /> <em>Proves: </em>
                    <Prose text={p.proves} model={model} />
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>What it builds on</h2>
              <Sources items={i.buildsOn} />
            </section>
            <section>
              <h2>What could go wrong, and what to try next</h2>
              <p>
                <Prose text={i.risks} model={model} />
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer source={`data/inventions/${i.domain}/${i.id}.yaml`} />
    </>
  );
}
