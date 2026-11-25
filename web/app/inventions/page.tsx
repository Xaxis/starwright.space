import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { fillText, site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta({
  href: "/inventions",
  title: "Inventions",
  description:
    "Every technology this project invents where nothing existing closes a gap, each with its principle, its first experiment and its path to civilization scale.",
});

export default function Inventions() {
  const { data } = site();
  return (
    <>
      <Header current="/inventions" />
      <main id="content" className="section">
        <h1>Inventions</h1>
        <p className="section-lead">
          Where nothing that exists closes a gap, this project invents what is missing. None of
          these is ruled out for seeming hard. Each is untested until its first experiment runs, and
          each says how to run it: the principle it works on, the setup, what to measure, what
          counts as success, what it costs and how long it takes, and the steps from the bench to
          civilization scale.
        </p>
        {data.domains.map((d) => {
          const list = data.inventions.filter((i) => i.domain === d.id);
          if (list.length === 0) return null;
          return (
            <section
              key={d.id}
              style={{ "--area": d.colour, marginTop: "2.5rem" } as React.CSSProperties}
            >
              <h2>
                <span className="area-dot" aria-hidden="true" />{" "}
                <a href={`/domains/${d.id}`}>{d.title}</a>
              </h2>
              <ul className="cards">
                {list.map((i) => (
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
            </section>
          );
        })}
      </main>
      <Footer source="data/inventions/" />
    </>
  );
}
