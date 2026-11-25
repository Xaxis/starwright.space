/** A page's metadata. Next replaces the whole openGraph object when a page sets one, so every page
 * sets all of it here rather than inheriting the home page's. */
import type { Metadata } from "next";
import { NAME } from "./site";

export function pageMeta(p: { href: string; title: string; description: string }): Metadata {
  const title = `${p.title} · ${NAME}`;
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: p.href },
    openGraph: { type: "article", siteName: NAME, title, description: p.description, url: p.href },
    twitter: { card: "summary_large_image", title, description: p.description },
  };
}
