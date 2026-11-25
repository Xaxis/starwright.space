import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";
import { REPO, repoUrl } from "../../lib/site";

export const metadata = pageMeta({
  href: "/about",
  title: "About",
  description: "What Starwright is, how it is built, what it builds on, and how to take part.",
});

export default function About() {
  const { data } = site();
  const sources = new Set<string>();
  for (const c of data.capabilities) for (const s of c.exists) sources.add(s.url);
  for (const i of data.inventions) for (const s of i.buildsOn) sources.add(s.url);
  for (const c of Object.values(data.constants)) sources.add(c.source);
  return (
    <>
      <Header />
      <main id="content" className="section prose">
        <h1>About Starwright</h1>
        <p className="section-lead">
          Starwright is an open builder for the climb up the Kardashev scale: from today's
          civilization to one that uses as much power as reaches its planet (Type I), and then one
          that uses its star's (Type II).
        </p>
        <h2>What it does</h2>
        <p>
          For every area the climb needs, it asks what humanity must be able to do, and when. For
          each capability it gathers what already exists, so the work builds on it rather than
          starting over, and names what is still missing. Where nothing closes a gap, it invents the
          missing technology, and gives it a way to become real: the principle it works on, the
          first experiment that would test it, and the steps from that experiment to working at the
          scale of a civilization.
        </p>
        <p>
          It is not a forecast and does not rule ideas out for seeming hard. Every invention is a
          proposal, untested until its experiment runs. Every number is either measured, with its
          source, or chosen, with its reason, or derived by an open model you can rerun with your
          own choices.
        </p>
        <h2>What is in it today</h2>
        <ul>
          <li>{data.stages.length} rungs on the ladder, each dated by the model</li>
          <li>{data.domains.length} areas</li>
          <li>{data.capabilities.length} capabilities</li>
          <li>{data.inventions.length} inventions, each with a costed first experiment</li>
          <li>{sources.size} sources for what exists</li>
        </ul>
        <h2>How it is built</h2>
        <p>
          The <a href={REPO}>repository</a> is the source of truth. Everything here is YAML in{" "}
          <a href={repoUrl("data/")}>data/</a>, checked against a schema, and every number in the
          prose is filled in by the model at build time, so text and numbers cannot drift apart. The
          3D scenes run in your browser with three.js; Earth, Moon and Mercury maps are from NASA.
        </p>
        <h2>Take part</h2>
        <p>
          Run an experiment and report the result. Point out something that exists that we missed,
          or a source that is wrong. Propose an invention for a gap, or a better path for one of
          ours. All of it happens on <a href={`${REPO}/issues`}>GitHub</a>. Code is MIT licensed;
          text and data are CC BY 4.0.
        </p>
      </main>
      <Footer source="README.md" />
    </>
  );
}
