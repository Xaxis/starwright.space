/**
 * Proves "Explore in 3D" works on a page: opens the full-screen view, then reports where the canvas
 * is and whether it draws anything, and again after closing it. Chromium runs on SwiftShader
 * (tools/lib/chromium.ts), so run it under ~/.claude/claude-core/bin/heavy.
 *
 *   node tools/explore.ts URL...
 *
 * Each URL prints one line: `before`, `opened` and `closed`, each with inDialog (is the canvas in the
 * full-screen view), dialogOpen, size, litShare (the share of sampled pixels that are not black)
 * and idle. It exits 1 unless, for every URL, the open view holds a lit canvas and closing it gives
 * the canvas back to the page. A view the page's own scene took back (the bug this was written for)
 * shows as opened.inDialog false.
 */
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS } from "./lib/chromium.ts";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node tools/explore.ts URL...");
  process.exit(2);
}

/** Runs in the page: where the canvas is, and how much of it is lit. */
function state() {
  const c = document.querySelector<HTMLCanvasElement>("canvas.scene-canvas");
  if (!c) return { canvas: false };
  const g = document.createElement("canvas");
  g.width = 64;
  g.height = 40;
  const x = g.getContext("2d");
  if (!x) return { canvas: true, error: "no 2D context" };
  x.drawImage(c, 0, 0, 64, 40);
  const d = x.getImageData(0, 0, 64, 40).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0) > 60) lit++;
  }
  return {
    canvas: true,
    inDialog: !!c.closest("dialog.scene-dialog"),
    dialogOpen: !!document.querySelector<HTMLDialogElement>("dialog.scene-dialog")?.open,
    size: `${c.clientWidth}x${c.clientHeight}`,
    litShare: Number((lit / (d.length / 4)).toFixed(3)),
    idle: c.dataset.idle,
  };
}

const settled = () =>
  document.querySelector<HTMLCanvasElement>("canvas.scene-canvas")?.dataset.idle === "1";

const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
let ok = true;
for (const url of urls) {
  const page = await browser.newPage({
    // Small: SwiftShader draws every pixel on the CPU, and the box is shared.
    viewport: { width: 960, height: 600 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let step = "load";
  try {
    await page.goto(url, { waitUntil: "load", timeout: 300_000 });
    // A scene takes the canvas only once it is mostly in view, as a reader would scroll it.
    await page.locator(".scene-stage").first().scrollIntoViewIfNeeded({ timeout: 120_000 });
    step = "first frame";
    await page.waitForFunction(settled, null, { timeout: 300_000 });
  } catch (e) {
    ok = false;
    console.log(JSON.stringify({ url, pass: false, step, error: String(e).split("\n")[0] }));
    await page.close();
    continue;
  }
  const before = await page.evaluate(state);
  await page.locator(".scene-open").first().click({ timeout: 60_000 });
  // Long enough for the page's own scene to have taken the canvas back, if it is going to.
  await page.waitForTimeout(4000);
  await page.waitForFunction(settled, null, { timeout: 300_000 }).catch(() => undefined);
  const opened = await page.evaluate(state);
  await page.locator(".scene-close").first().click({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  const closed = await page.evaluate(state);
  const pass =
    "inDialog" in opened &&
    opened.inDialog &&
    opened.dialogOpen &&
    (opened.litShare ?? 0) > 0.01 &&
    "inDialog" in closed &&
    !closed.inDialog &&
    !closed.dialogOpen &&
    errors.length === 0;
  if (!pass) ok = false;
  console.log(JSON.stringify({ url, pass, before, opened, closed, errors }));
  await page.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
