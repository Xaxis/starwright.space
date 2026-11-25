import { Builder } from "../../components/builder/Builder";
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";
import { site } from "../../lib/data";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta({
  href: "/builder",
  title: "Builder",
  description:
    "Change the plan's choices, from how fast Earth grows to how fast factories copy themselves, and watch every rung of the ladder re-date itself.",
});

export default function BuilderPage() {
  const { data } = site();
  return (
    <>
      <Header current="/builder" />
      <main id="content" className="section builder-page">
        <h1>Builder</h1>
        <p className="section-lead">
          The ladder's years come from a small model and a handful of choices. Change any choice and
          the model reruns in your browser: every rung re-dates, the power curve redraws, and the
          scene flies to any year you pick. The link keeps your choices, so you can share them.
        </p>
        <Builder
          constants={data.constants}
          assumptions={data.assumptions}
          stages={data.stages.map((s) => ({ id: s.id, title: s.title, power: s.power }))}
        />
      </main>
      <Footer source="core/src/model.ts" />
    </>
  );
}
