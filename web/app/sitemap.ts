import type { MetadataRoute } from "next";
import { site } from "../lib/data";
import { SITE } from "../lib/site";

/** Every page on the site. tools/deploy.sh fetches each one from the live domain. */
export default function sitemap(): MetadataRoute.Sitemap {
  const { data } = site();
  const paths = [
    "",
    "/ladder",
    ...data.stages.map((s) => `/ladder/${s.id}`),
    "/tower",
    "/inventions",
    ...data.inventions.map((i) => `/inventions/${i.id}`),
    "/builder",
    "/start",
    "/domains",
    ...data.domains.map((d) => `/domains/${d.id}`),
    ...data.capabilities.map((c) => `/capabilities/${c.id}`),
    "/numbers",
    "/sources",
    "/about",
  ];
  return paths.map((p) => ({ url: `${SITE}${p}` }));
}
