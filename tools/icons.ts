/**
 * Renders web/app/icon.svg into the PNG and ICO icons browsers still ask for: apple-icon.png
 * (180 px) and favicon.ico (16, 32 and 48 px PNGs in one ICO). Run after changing the icon:
 *
 *   ~/.claude/claude-core/bin/heavy node tools/icons.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS } from "./lib/chromium.ts";

const app = join(import.meta.dirname, "..", "web", "app");
const svg = readFileSync(join(app, "icon.svg"), "utf8");
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });

async function png(size: number): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const out = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
  return out;
}

writeFileSync(join(app, "apple-icon.png"), await png(180));

// An ICO is a directory of images; modern ones may hold PNGs as they are.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  const img = images[i] as Buffer;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync(join(app, "favicon.ico"), Buffer.concat([header, ...images]));
await browser.close();
console.log("icons ok: apple-icon.png, favicon.ico");
