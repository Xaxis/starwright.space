import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta({
  href: "/domains",
  title: "Every area",
  description: "Every area the climb to Type I and Type II needs, from energy to people.",
});

export default function Domains() {
  const { data } = site();
  return (
    <>
      <Header />
      <main id="content" className="section">
        <h1>Every area</h1>
        <p className="section-lead">
          The climb needs every field at once. Each area lists what it must be able to do, what
          exists toward it, and what this project invents where nothing does.
        </p>
        <ul className="cards">
          {data.domains.map((d) => (
            <li key={d.id}>
              <a
                className="card"
                href={`/domains/${d.id}`}
                style={{ "--area": d.colour } as React.CSSProperties}
              >
                <span className="card-kicker">
                  {data.capabilities.filter((c) => c.domain === d.id).length} capabilities ·{" "}
                  {data.inventions.filter((c) => c.domain === d.id).length} inventions
                </span>
                <h2 className="card-title">{d.title}</h2>
                <p>{d.role}</p>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <Footer source="data/domains.yaml" />
    </>
  );
}
