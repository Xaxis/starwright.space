import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { DESCRIPTION, NAME, SITE, TAGLINE } from "../lib/site";
import { THEME_SCRIPT } from "../lib/theme-script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  variable: "--font-fraunces",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
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
    { media: "(prefers-color-scheme: light)", color: "#fbf7ef" },
    { media: "(prefers-color-scheme: dark)", color: "#090a12" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}
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
