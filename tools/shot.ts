/**
 * Screenshots of pages and their 3D scenes, for looking at a change. Chromium runs on SwiftShader
 * (tools/lib/chromium.ts), so run it under ~/.claude/claude-core/bin/heavy.
 *
 *   node tools/shot.ts URL OUT.png [--wait 8] [--size 1440x900] [--progress 0,0.5,1] [--full] [--motion]
 *
 * --progress pauses the page's live scene and moves its story to each point in turn, writing
 * OUT-<point>.png for each. The page is shot with reduced motion unless --motion is given, so each
 * picture is one settled frame. Prints the scene's state and any console errors.
 */
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS } from "./lib/chromium.ts";

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error(
    "usage: node tools/shot.ts URL OUT.png [--wait S] [--size WxH] [--progress P] [--full]",
  );
  process.exit(2);
}
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const [w, h] = (opt("size") ?? "1440x900").split("x").map(Number);
const wait = Number(opt("wait") ?? 8);
const progress = opt("progress");

const motion = process.argv.includes("--motion");
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
// Reduced motion: the scene draws one still frame for each change, so the picture is of a settled
// scene and SwiftShader is not asked for sixty frames a second.
const page = await browser.newPage({
  viewport: { width: w ?? 1440, height: h ?? 900 },
  reducedMotion: motion ? "no-preference" : "reduce",
});
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load", timeout: 240_000 });
await page.waitForTimeout(wait * 1000);
async function settle() {
  // A moving scene never idles; give it time to glide to the story's camera instead.
  if (motion) return page.waitForTimeout(5000);
  await page
    .waitForFunction(
      () => document.querySelector("canvas.scene-canvas")?.getAttribute("data-idle") === "1",
      null,
      {
        timeout: 120_000,
      },
    )
    .catch(() => console.error("the scene never settled"));
}
async function snap(file: string) {
  await settle();
  const scene = await page.evaluate(() => {
    const c = document.querySelector("canvas.scene-canvas") as HTMLCanvasElement | null;
    return c ? { ...c.dataset } : null;
  });
  await page.screenshot({
    path: file,
    fullPage: process.argv.includes("--full"),
    timeout: 120_000,
  });
  console.log(JSON.stringify({ url, out: file, scene, errors: errors.splice(0) }));
}
if (progress === undefined) await snap(out);
else {
  // The story's slider drives the engine, as a reader's drag would.
  const slider = page.locator(".scene[data-mode='live'] .story-track input").first();
  if (!(await slider.count())) throw new Error("no live scene with a story on the page");
  for (const p of progress.split(",").map(Number)) {
    await slider.evaluate((el, x) => {
      const input = el as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      set?.call(input, String(x));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, p);
    await page.waitForTimeout(800);
    await snap(out.replace(/\.png$/, `-${p}.png`));
  }
}
await browser.close();
