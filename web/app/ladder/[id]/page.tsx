import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Footer } from "../../../components/Footer";
import { Header } from "../../../components/Header";
import { Prose } from "../../../components/Prose";
import { Scene3D } from "../../../components/scene/Scene3D";
import {
  capability,
  domainOf,
  fillText,
  firstSentence,
  invention,
  show,
  site,
  stageK,
  stageYear,
} from "../../../lib/data";
import { pageMeta } from "../../../lib/meta";
import { stageScene } from "../../../lib/scene";

export function generateStaticParams() {
  return site().data.stages.map((s) => ({ id: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = site().data.stages.find((x) => x.id === id);
  if (!s) return {};
  return pageMeta({
    href: `/ladder/${id}`,
    title: s.title,
    description: firstSentence(fillText(s.picture)),
  });
}

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, model } = site();
  const i = data.stages.findIndex((x) => x.id === id);
  const s = data.stages[i];
  if (!s) notFound();
  const prev = data.stages[i - 1];
  const next = data.stages[i + 1];
  const scene = stageScene(s);
  return (
    <>
      <Header current="/ladder" />
      <main id="content" className="record">
        <div className="record-head">
          <p className="eyebrow">
            <a href="/ladder">The ladder</a>, rung {i + 1} of {data.stages.length} · K{" "}
            {stageK(s.power)} · {show(s.power)} · {stageYear(s.id)}
          </p>
          <h1>{s.title}</h1>
          <p className="record-pitch">
            <Prose text={s.picture} model={model} />
          </p>
        </div>
        <div className="record-grid">
          <div className="record-scene">
            <Scene3D
              kind={s.scene.kind}
              params={scene.params}
              data={scene.data}
              start={scene.start}
              colour="#f3c463"
              title={s.title}
              alt={s.scene.focus}
            />
          </div>
          <div className="facts">
            <section>
              <h2>What holds the climb here</h2>
              <p>
                <Prose text={s.limit} model={model} />
              </p>
            </section>
            <section>
              <h2>The plan for this rung</h2>
              <ol className="path">
                {s.plan.map((step) => {
                  const c = capability(step.ref);
                  const inv = c ? undefined : invention(step.ref);
                  const rec = c ?? inv;
                  const d = rec ? domainOf(rec.domain) : undefined;
                  const href = c ? `/capabilities/${step.ref}` : `/inventions/${step.ref}`;
                  return (
                    <li
                      key={step.ref}
                      style={d ? ({ "--area": d.colour } as React.CSSProperties) : undefined}
                    >
                      <span className="path-phase">{d?.title ?? "Planned"}</span>
                      {rec ? (
                        <a className="path-scale" href={href}>
                          {rec.title}
                        </a>
                      ) : (
                        <span className="path-scale">{step.ref}</span>
                      )}
                      <Prose text={step.does} model={model} />
                    </li>
                  );
                })}
              </ol>
            </section>
            {(() => {
              const here = data.capabilities.filter((c) => c.stage === s.id);
              if (here.length === 0) return null;
              return (
                <section>
                  <h2>Everything first needed on this rung</h2>
                  <p>
                    {here.length} capabilities, by area. The <a href={`/tower`}>Tower</a> shows how
                    they connect.
                  </p>
                  <dl className="by-area">
                    {data.domains.map((d) => {
                      const caps = here.filter((c) => c.domain === d.id);
                      if (caps.length === 0) return null;
                      return (
                        <Fragment key={d.id}>
                          <dt style={{ "--area": d.colour } as React.CSSProperties}>
                            <span className="area-dot" aria-hidden="true" />
                            {d.title}
                          </dt>
                          <dd className="chips">
                            {caps.map((c) => (
                              <a key={c.id} className="chip" href={`/capabilities/${c.id}`}>
                                {c.title}
                              </a>
                            ))}
                          </dd>
                        </Fragment>
                      );
                    })}
                  </dl>
                </section>
              );
            })()}
            <nav className="pager" aria-label="Other rungs">
              {prev ? (
                <a href={`/ladder/${prev.id}`}>
                  <span>The rung below</span>
                  <strong>{prev.title}</strong>
                </a>
              ) : null}
              {next ? (
                <a className="next" href={`/ladder/${next.id}`}>
                  <span>The rung above</span>
                  <strong>{next.title}</strong>
                </a>
              ) : null}
            </nav>
          </div>
        </div>
      </main>
      <Footer source="data/stages.yaml" />
    </>
  );
}
