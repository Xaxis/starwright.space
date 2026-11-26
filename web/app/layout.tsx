import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { DESCRIPTION, NAME, SITE, TAGLINE } from "../lib/site";
import { THEME_SCRIPT } from "../lib/theme-script";

// A book face for reading and titles, a plain grotesque for the interface, and a mono for figures
// that line up. Newsreader's optical sizes keep it light at display sizes and sturdy in text.
const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// The commit this page was built from. tools/deploy.sh sets it and then looks for it on the live
// page, which is how a deploy proves the URL serves the new build and not an old one.
const build =
  process.env.STARWRIGHT_BUILD ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${NAME}: ${TAGLINE}`, template: `%s · ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  openGraph: {
    type: "website",
    siteName: NAME,
    title: `${NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
    url: SITE,
  },
  twitter: { card: "summary_large_image" },
  other: { "starwright-build": build },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#08090d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="kept-theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
