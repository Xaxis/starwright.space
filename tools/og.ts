/**
 * Renders the site's share card, web/app/opengraph-image.png (1200 x 630), from the home page's hero
 * at the Type II rung: the headline over the swarm closing around the Sun. Run against a running
 * site after changing the hero:
 *
 *   ~/.claude/claude-core/bin/heavy node tools/og.ts [http://localhost:4527] [progress]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS } from "./lib/chromium.ts";

const url = process.argv[2] ?? "http://localhost:4527";
const progress = Number(process.argv[3] ?? 0.86);
const app = join(import.meta.dirname, "..", "web", "app");

const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({
  // The hero is 78vh tall, so this height makes it exactly the card's 630.
  viewport: { width: 1200, height: 808 },
  reducedMotion: "reduce",
});
await page.goto(`${url}/`, { waitUntil: "load", timeout: 240_000 });
// The card shows the scene and the headline alone.
await page.addStyleTag({
  content: `.site-header, .scene-open, .story-controls, nextjs-portal { display: none !important; }
    .home-hero { margin: 0 !important; }`,
});
await page.waitForFunction(
  () => document.querySelector("canvas.scene-canvas")?.getAttribute("data-idle") === "1",
  null,
  {
    timeout: 180_000,
  },
);
await page
  .locator(".story-track input")
  .first()
  .evaluate((el, p) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      String(p),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, progress);
await page.waitForTimeout(1500);
await page.waitForFunction(
  () => document.querySelector("canvas.scene-canvas")?.getAttribute("data-idle") === "1",
  null,
  {
    timeout: 180_000,
  },
);
const box = await page.locator(".home-hero").boundingBox();
if (!box) throw new Error("no hero on the page");
const shot = await page.screenshot({
  clip: { x: 0, y: box.y, width: 1200, height: 630 },
  timeout: 120_000,
});
writeFileSync(join(app, "opengraph-image.png"), shot);
const alt = (await page.locator("#home-title").textContent())?.trim() ?? "Starwright";
writeFileSync(
  join(app, "opengraph-image.alt.txt"),
  `${alt}: a swarm of collectors closing around the Sun.\n`,
);
await browser.close();
console.log("og ok: web/app/opengraph-image.png");
