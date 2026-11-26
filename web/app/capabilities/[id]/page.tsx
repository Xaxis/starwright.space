import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { Header } from "../../../components/Header";
import { Prose } from "../../../components/Prose";
import { Sources } from "../../../components/Sources";
import { Scene3D } from "../../../components/scene/Scene3D";
import {
  capability,
  domainOf,
  fillText,
  firstSentence,
  invention,
  site,
  stageOf,
  stageYear,
} from "../../../lib/data";
import { pageMeta } from "../../../lib/meta";
import { capabilityBeats, sceneParams } from "../../../lib/scene";

export function generateStaticParams() {
  return site().data.capabilities.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = capability(id);
  if (!c) return {};
  return pageMeta({
    href: `/capabilities/${id}`,
    title: c.title,
    description: firstSentence(fillText(c.summary)),
  });
}

export default async function CapabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, model } = site();
  const c = capability(id);
  if (!c) notFound();
  const d = domainOf(c.domain);
  const s = stageOf(c.stage);
  const needs = c.needs.map((n) => capability(n)).filter((x) => x !== undefined);
  const neededBy = data.capabilities.filter((x) => x.needs.includes(c.id));
  const inventions = c.inventions.map((i) => invention(i)).filter((x) => x !== undefined);
  return (
    <>
      <Header />
      <main id="content" className="record" style={{ "--area": d.colour } as React.CSSProperties}>
        <div className="record-head">
          <p className="eyebrow">
            <span className="area-dot" aria-hidden="true" />
            <a href={`/domains/${d.id}`}>{d.title}</a> · needed from{" "}
            <a href={`/ladder/${s.id}`}>{s.title}</a> ({stageYear(s.id)})
          </p>
          <h1>{c.title}</h1>
          <p className="record-pitch">
            <Prose text={c.summary} model={model} />
          </p>
        </div>
        <div className="record-grid">
          <div className="record-scene">
            <Scene3D
              kind={c.scene.kind}
              params={sceneParams(c.scene)}
              data={{ beats: capabilityBeats(c) }}
              colour={d.colour}
              title={c.title}
              alt={c.scene.focus}
            />
          </div>
          <div className="facts">
            <section>
              <h2>The target</h2>
              <p>
                <Prose text={c.target} model={model} />
              </p>
            </section>
            <section>
              <h2>What exists to build on</h2>
              <Sources items={c.exists} />
            </section>
            <section>
              <h2>What is missing</h2>
              <p>
                <Prose text={c.gap} model={model} />
              </p>
            </section>
            {inventions.length > 0 ? (
              <section>
                <h2>What this project invents for it</h2>
                <ul className="cards">
                  {inventions.map((i) => (
                    <li key={i.id}>
                      <a className="card" href={`/inventions/${i.id}`}>
                        <span className="card-kicker">
                          <span className="chip chip-invented">Invented here</span>
                        </span>
                        <h3 className="card-title">{i.title}</h3>
                        <p>{fillText(i.pitch)}</p>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {needs.length > 0 || neededBy.length > 0 ? (
              <section>
                <h2>How it connects</h2>
                <dl className="by-area">
                  {needs.length > 0 ? (
                    <>
                      <dt>It needs</dt>
                      <dd className="chips">
                        {needs.map((n) => (
                          <a key={n.id} className="chip" href={`/capabilities/${n.id}`}>
                            {n.title}
                          </a>
                        ))}
                      </dd>
                    </>
                  ) : null}
                  {neededBy.length > 0 ? (
                    <>
                      <dt>It opens the way to</dt>
                      <dd className="chips">
                        {neededBy.map((n) => (
                          <a key={n.id} className="chip" href={`/capabilities/${n.id}`}>
                            {n.title}
                          </a>
                        ))}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      </main>
      <Footer source={`data/capabilities/${c.domain}/${c.id}.yaml`} />
    </>
  );
}
