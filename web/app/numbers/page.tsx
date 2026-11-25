import { format } from "@starwright/core";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";
import { repoUrl } from "../../lib/site";

export const metadata = pageMeta({
  href: "/numbers",
  title: "Every Number",
  description:
    "Every number on the site: measured ones with their sources, chosen ones with their basis and range, and derived ones with their formulas.",
});

const BASIS: Record<string, string> = {
  physics: "Physics",
  precedent: "Precedent",
  invented: "Invented",
  choice: "Choice",
};

export default function Numbers() {
  const { data, model } = site();
  const derived = [...model.q.values()].filter((q) => q.kind === "derived");
  const shown = (id: string) => {
    const q = model.q.get(id);
    return q ? format(q.value, q.unit) : id;
  };
  return (
    <>
      <Header />
      <main id="content" className="section">
        <h1>Every Number</h1>
        <p className="section-lead">
          Every number on this site comes from here. Measured numbers carry their source and its
          words. Chosen numbers say why, and on what basis: physics, precedent, a choice, or
          invented, a guess for a technology that does not exist yet. Everything else is derived by
          the model, and shows its formula. Change any choice in the <a href="/builder">Builder</a>.
        </p>
        <nav className="chips" aria-label="Sections">
          <a className="chip" href="#measured">
            Measured ({Object.keys(data.constants).length})
          </a>
          <a className="chip" href="#chosen">
            Chosen ({Object.keys(data.assumptions).length})
          </a>
          <a className="chip" href="#derived">
            Derived ({derived.length})
          </a>
        </nav>

        <h2 id="measured" style={{ marginTop: "2rem" }}>
          Measured
        </h2>
        <dl className="ledger-list">
          {Object.entries(data.constants).map(([id, c]) => (
            <div key={id} id={id} className="ledger-row">
              <dt>
                {c.label} <code>{id}</code>
              </dt>
              <dd className="ledger-value">{format(c.value, c.unit)}</dd>
              <dd>
                <q>{c.quote}</q>{" "}
                <a href={c.source} rel="noopener">
                  {new URL(c.source).hostname.replace(/^www\./, "")}, {c.year}
                </a>
                {c.note ? <span className="ledger-note"> {c.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        <h2 id="chosen" style={{ marginTop: "2rem" }}>
          Chosen
        </h2>
        <dl className="ledger-list">
          {Object.entries(data.assumptions).map(([id, a]) => (
            <div key={id} id={id} className="ledger-row">
              <dt>
                {a.label} <code>{id}</code>
              </dt>
              <dd className="ledger-value">
                {format(a.value, a.unit)}{" "}
                <span className={`basis basis-${a.basis}`}>{BASIS[a.basis]}</span>
              </dd>
              <dd>
                {a.why}{" "}
                <span className="ledger-note">
                  Range in the Builder: {format(a.min, a.unit)} to {format(a.max, a.unit)}.
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <h2 id="derived" style={{ marginTop: "2rem" }}>
          Derived
        </h2>
        <dl className="ledger-list">
          {derived.map((q) => (
            <div key={q.id} id={q.id} className="ledger-row">
              <dt>
                {q.label} <code>{q.id}</code>
              </dt>
              <dd className="ledger-value">{format(q.value, q.unit)}</dd>
              <dd>
                {q.formula ? <code className="formula">{q.formula}</code> : null}
                {q.inputs && q.inputs.length > 0 ? (
                  <span className="ledger-note">
                    {" "}
                    From{" "}
                    {q.inputs.map((i, k) => (
                      <span key={i}>
                        {k > 0 ? ", " : ""}
                        <a href={`#${i}`}>{shown(i)}</a>
                      </span>
                    ))}
                    .
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        <p style={{ marginTop: "2rem" }}>
          The model is <a href={repoUrl("core/src/model.ts")}>core/src/model.ts</a>; its inputs are{" "}
          <a href={repoUrl("data/constants.yaml")}>data/constants.yaml</a> and{" "}
          <a href={repoUrl("data/assumptions.yaml")}>data/assumptions.yaml</a>.
        </p>
      </main>
      <Footer source="data/constants.yaml" />
    </>
  );
}
