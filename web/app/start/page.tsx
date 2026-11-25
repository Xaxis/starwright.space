import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { domainOf, fillText, site, stageOf } from "../../lib/data";
import { pageMeta } from "../../lib/meta";
import { REPO } from "../../lib/site";

export const metadata = pageMeta({
  href: "/start",
  title: "Start Here",
  description:
    "Every invention's first experiment, cheapest first, with what it unlocks. Pick one and run it.",
});

export default function Start() {
  const { data } = site();
  const order = new Map(data.stages.map((s, i) => [s.id, i]));
  /** How many capabilities, directly or through others, wait on the capabilities an invention serves. */
  const unlocks = (ids: string[]) => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      for (const c of data.capabilities) {
        if (c.needs.includes(id) && !seen.has(c.id)) {
          seen.add(c.id);
          walk(c.id);
        }
      }
    };
    for (const id of ids) walk(id);
    return seen.size;
  };
  const rows = data.inventions
    .map((i) => {
      const stage = Math.min(
        ...i.for.map(
          (c) => order.get(data.capabilities.find((x) => x.id === c)?.stage ?? "") ?? 99,
        ),
      );
      return { i, stage, unlocks: unlocks(i.for) };
    })
    .sort((a, b) => a.i.experiment.costUsd - b.i.experiment.costUsd || a.stage - b.stage);
  const total = rows.reduce((t, r) => t + r.i.experiment.costUsd, 0);
  return (
    <>
      <Header current="/start" />
      <main id="content" className="section">
        <h1>Start Here</h1>
        <p className="section-lead">
          The climb starts with experiments. Here is every invention's first one, cheapest first.
          Running all {rows.length} would cost about $
          {Math.round(total / 1e6).toLocaleString("en-US")} million. Each lists what it would
          unlock: the capabilities that wait on it, directly or through others.
        </p>
        <p>
          Running one, or already ran something like it?{" "}
          <a href={`${REPO}/issues/new`}>Open an issue</a> with what you measured. A result, either
          way, changes the plan.
        </p>
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Experiment</th>
                <th scope="col">Area</th>
                <th scope="col">Needed from</th>
                <th scope="col" className="n">
                  Cost
                </th>
                <th scope="col" className="n">
                  Months
                </th>
                <th scope="col" className="n">
                  Unlocks
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ i, stage, unlocks: u }) => {
                const d = domainOf(i.domain);
                const s = data.stages[stage];
                return (
                  <tr key={i.id}>
                    <td>
                      <a href={`/inventions/${i.id}`}>{i.title}</a>
                      <br />
                      <small>{fillText(i.experiment.goal)}</small>
                    </td>
                    <td>
                      <span
                        className="area-dot"
                        style={{ "--area": d.colour } as React.CSSProperties}
                        aria-hidden="true"
                      />{" "}
                      {d.title}
                    </td>
                    <td>{s ? stageOf(s.id).title : ""}</td>
                    <td className="n">${i.experiment.costUsd.toLocaleString("en-US")}</td>
                    <td className="n">{i.experiment.months}</td>
                    <td className="n">{u}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <Footer source="data/inventions/" />
    </>
  );
}
