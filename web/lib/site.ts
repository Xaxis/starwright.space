/** Where the site lives and what it is called. */
/** The site's own address. tools/deploy.sh sets it to the live production domain, starwright.space
 * once its DNS answers, else the project's vercel.app address. */
export const SITE = process.env.STARWRIGHT_SITE ?? "https://starwright.space";
export const REPO = "https://github.com/Xaxis/starwright.space";
export const NAME = "Starwright";
export const TAGLINE = "every technology and plan for the climb to Type I and Type II";
export const DESCRIPTION =
  "An open builder of every technology and plan humanity needs to climb the Kardashev scale: what exists to build on, what is missing, an invention for every gap with the experiment that would prove it, and a model that dates each rung. Every stage explorable in 3D.";

export const NAV: { href: string; label: string }[] = [
  { href: "/ladder", label: "The Ladder" },
  { href: "/tower", label: "The Tower" },
  { href: "/inventions", label: "Inventions" },
  { href: "/builder", label: "Builder" },
  { href: "/start", label: "Start Here" },
];

export const ALL_PAGES: { href: string; label: string }[] = [
  ...NAV,
  { href: "/domains", label: "Every Area" },
  { href: "/numbers", label: "Every Number" },
  { href: "/sources", label: "Every Source" },
  { href: "/about", label: "About" },
];

export const repoUrl = (path: string) => `${REPO}/blob/main/${path}`;
export const editUrl = (path: string) => `${REPO}/edit/main/${path}`;
