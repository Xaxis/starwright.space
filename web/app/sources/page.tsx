import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta({
  href: "/sources",
  title: "Every Source",
  description:
    "Everything that already exists that Starwright builds on: programmes, companies, records and papers, by area, each with the capabilities and inventions that cite it.",
});

interface Row {
  url: string;
  text: string;
  year?: number;
  cited: { href: string; title: string }[];
}

export default function Sources() {
  const { data } = site();
  const byArea = new Map<string, Map<string, Row>>();
  const add = (
    area: string,
    s: { url: string; text: string; year?: number },
    href: string,
    title: string,
  ) => {
    const rows = byArea.get(area) ?? new Map<string, Row>();
    byArea.set(area, rows);
    const row = rows.get(s.url) ?? { url: s.url, text: s.text, year: s.year, cited: [] };
    if (!row.cited.some((c) => c.href === href)) row.cited.push({ href, title });
    rows.set(s.url, row);
  };
  for (const c of data.capabilities)
    for (const s of c.exists) add(c.domain, s, `/capabilities/${c.id}`, c.title);
  for (const i of data.inventions)
    for (const s of i.buildsOn) add(i.domain, s, `/inventions/${i.id}`, i.title);
  const all = new Set<string>();
  for (const rows of byArea.values()) for (const u of rows.keys()) all.add(u);
  return (
    <>
      <Header />
      <main id="content" className="section">
        <h1>Every Source</h1>
        <p className="section-lead">
          The climb builds on what already exists. These are the {all.size} programmes, companies,
          records and papers the capabilities and inventions cite, area by area, each with what
          cites it. The measured numbers have their own sources on{" "}
          <a href="/numbers#measured">Every Number</a>.
        </p>
        <nav className="chips" aria-label="Areas">
          {data.domains
            .filter((d) => byArea.has(d.id))
            .map((d) => (
              <a key={d.id} className="chip" href={`#${d.id}`}>
                {d.title} ({byArea.get(d.id)?.size})
              </a>
            ))}
        </nav>
        {data.domains.map((d) => {
          const rows = [...(byArea.get(d.id)?.values() ?? [])];
          if (rows.length === 0) return null;
          return (
            <section
              key={d.id}
              id={d.id}
              style={{ "--area": d.colour, marginTop: "2.25rem" } as React.CSSProperties}
            >
              <h2>
                <span className="area-dot" aria-hidden="true" /> {d.title}
              </h2>
              <ul className="sources">
                {rows.map((r) => (
                  <li key={r.url}>
                    {r.text}{" "}
                    <a href={r.url} rel="noopener">
                      {new URL(r.url).hostname.replace(/^www\./, "")}
                      {r.year ? `, ${r.year}` : ""}
                    </a>
                    <span className="ledger-note">
                      {" "}
                      Cited by{" "}
                      {r.cited.map((c, k) => (
                        <span key={c.href}>
                          {k > 0 ? ", " : ""}
                          <a href={c.href}>{c.title}</a>
                        </span>
                      ))}
                      .
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
      <Footer source="data/capabilities/" />
    </>
  );
}
