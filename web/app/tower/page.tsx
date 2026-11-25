import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { Scene3D } from "../../components/scene/Scene3D";
import { domainOf, site, stageK, stageYear } from "../../lib/data";
import { pageMeta } from "../../lib/meta";
import { towerData } from "../../lib/tower";

export const metadata = pageMeta({
  href: "/tower",
  title: "The Tower",
  description:
    "Every capability the climb needs as one structure: a floor for each rung, a spoke for each area, and the links between what each needs.",
});

export default function Tower() {
  const { data } = site();
  const tower = towerData();
  return (
    <>
      <Header current="/tower" />
      <main id="content" className="section">
        <h1>The Tower</h1>
        <p className="section-lead">
          Every capability the climb needs, as one structure. Each floor is a rung of the ladder,
          each spoke an area. A capability sits where its area meets the rung it is first needed on;
          the lines rising into it are what it needs. Play the climb to light it floor by floor,
          point at any capability to name it, and click to open it.
        </p>
        <Scene3D
          kind="tower"
          variant="hero"
          colour="#f3c463"
          title="The Tower of every capability"
          alt={`${tower.nodes.length} capabilities across ${data.domains.length} areas and ${data.stages.length} rungs, with ${tower.edges.length} links between them.`}
          data={tower as unknown as Record<string, unknown>}
          duration={48}
        />
        <h2 style={{ marginTop: "2.5rem" }}>Floor by floor</h2>
        {data.stages.map((s, i) => {
          const caps = data.capabilities.filter((c) => c.stage === s.id);
          return (
            <section key={s.id} className="floor">
              <h3>
                <a href={`/ladder/${s.id}`}>
                  {i + 1}. {s.title}
                </a>{" "}
                <small>
                  K {stageK(s.power)} · {stageYear(s.id)} · {caps.length} capabilities
                </small>
              </h3>
              <div className="chips">
                {caps.map((c) => {
                  const d = domainOf(c.domain);
                  return (
                    <a
                      key={c.id}
                      className="chip"
                      href={`/capabilities/${c.id}`}
                      style={{ "--area": d.colour } as React.CSSProperties}
                    >
                      <span className="area-dot" aria-hidden="true" /> {c.title}
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
      <Footer source="data/capabilities/" />
    </>
  );
}
