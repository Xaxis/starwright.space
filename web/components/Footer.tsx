import { ALL_PAGES, NAME, REPO, repoUrl, TAGLINE } from "../lib/site";
import { Mark } from "./Mark";

const build =
  process.env.STARWRIGHT_BUILD ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

/** Every page ends with where it came from: the data file it renders, editable on GitHub. */
export function Footer({ source }: { source?: string }) {
  return (
    <footer className="site-footer">
      {source && (
        <div className="page-source">
          <span>This page is built from</span>
          <a href={repoUrl(source)}>{source}</a>
          <span aria-hidden="true">·</span>
          <a href={`${REPO}/edit/main/${source}`}>Improve it on GitHub</a>
        </div>
      )}
      <div className="footer-inner">
        <div className="footer-brand">
          <Mark size={22} />
          <div>
            <p className="footer-name">{NAME}</p>
            <p className="footer-tag">{TAGLINE}</p>
          </div>
        </div>
        <nav aria-label="Footer" className="footer-links">
          {ALL_PAGES.map((p) => (
            <a key={p.href} href={p.href}>
              {p.label}
            </a>
          ))}
        </nav>
        <div className="footer-fine">
          <p>
            An open plan. What exists is cited; what this project invents is labelled, with the
            experiment that would prove it. Every number is computed from{" "}
            <a href={repoUrl("data/")}>open data</a> by <a href={repoUrl("core/")}>open code</a>.
            Rerun it with <code>pnpm model</code>.
          </p>
          <p>
            Code MIT; text and data CC BY 4.0. <a href={REPO}>Source on GitHub</a>. Build{" "}
            <a href={`${REPO}/commit/${build}`}>{build}</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
