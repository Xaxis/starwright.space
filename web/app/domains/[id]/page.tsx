import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "../../../components/Footer";
import { Header } from "../../../components/Header";
import { Scene3D } from "../../../components/scene/Scene3D";
import { fillText, firstSentence, site, stageOf, stageYear } from "../../../lib/data";
import { pageMeta } from "../../../lib/meta";
import { towerData } from "../../../lib/tower";

export function generateStaticParams() {
  return site().data.domains.map((d) => ({ id: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = site().data.domains.find((x) => x.id === id);
  if (!d) return {};
  return pageMeta({ href: `/domains/${id}`, title: d.title, description: d.role });
}

export default async function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = site();
  const d = data.domains.find((x) => x.id === id);
  if (!d) notFound();
  const order = new Map(data.stages.map((s, i) => [s.id, i]));
  const caps = data.capabilities
    .filter((c) => c.domain === d.id)
    .sort((a, b) => (order.get(a.stage) ?? 0) - (order.get(b.stage) ?? 0));
  const invs = data.inventions.filter((i) => i.domain === d.id);
  return (
    <>
      <Header />
      <main id="content" className="section" style={{ "--area": d.colour } as React.CSSProperties}>
        <p className="eyebrow">
          <span className="area-dot" aria-hidden="true" />
          <a href="/domains">Every area</a> · {caps.length} capabilities · {invs.length} inventions
        </p>
        <h1>{d.title}</h1>
        <p className="section-lead">{d.role}</p>
        <Scene3D
          kind="tower"
          colour={d.colour}
          title={`${d.title} in the tower of every capability`}
          alt={`${d.title}'s ${caps.length} capabilities on their rungs of the climb, lit among every other area's, with the links to what they need and what needs them.`}
          data={towerData(d.id) as unknown as Record<string, unknown>}
          duration={40}
        />
        <h2>What it must be able to do</h2>
        <ul className="cards">
          {caps.map((c) => (
            <li key={c.id}>
              <a className="card" href={`/capabilities/${c.id}`}>
                <span className="card-kicker">
                  {stageOf(c.stage).title} · {stageYear(c.stage)}
                </span>
                <h3 className="card-title">{c.title}</h3>
                <p>{firstSentence(fillText(c.summary))}</p>
              </a>
            </li>
          ))}
        </ul>
        {invs.length > 0 ? (
          <>
            <h2>What this project invents</h2>
            <ul className="cards">
              {invs.map((i) => (
                <li key={i.id}>
                  <a className="card" href={`/inventions/${i.id}`}>
                    <span className="card-kicker">
                      First experiment ${i.experiment.costUsd.toLocaleString("en-US")},{" "}
                      {i.experiment.months} months
                    </span>
                    <h3 className="card-title">{i.title}</h3>
                    <p>{fillText(i.pitch)}</p>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
      <Footer source={`data/capabilities/${d.id}/`} />
    </>
  );
}
