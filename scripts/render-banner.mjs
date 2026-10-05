// Renders public/favicon.svg to a compact PNG for the README header.
//
//   node scripts/render-banner.mjs
//
// Why not embed the SVG directly: it is 103 kB of vectorised paths (403 of
// them, from "visioncortex VTracer"), which is four times the size of the entire
// JS bundle and the largest thing in the repository. A 640px PNG of the same
// artwork is a few tens of kB and looks identical in a README.
//
// GitHub sanitises SVG in markdown, so even where it renders, it is the wrong
// size to put in a README.

import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const OUT_DIR = "docs";
const WIDTH = 640;
const HEIGHT = 640;
const SOURCE = resolve(new URL("../public/favicon.svg", import.meta.url).pathname);

mkdirSync(OUT_DIR, { recursive: true });

// page.setContent() cannot load a file:// image: the document it creates has an
// about:blank origin, so the file request is blocked and the screenshot comes out
// as the broken-image glyph. It needs a real file on disk to navigate to, written
// beside the SVG so the relative path resolves.
const htmlPath = resolve(OUT_DIR, ".banner-render.html");
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset="utf-8">
   <body style="margin:0;background:#010000">
     <img src="../public/favicon.svg" width="${WIDTH}" height="${HEIGHT}" style="display:block">
   </body>`,
);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

// The art is black-on-black on a #010000 background, which is the game's own
// background (src/game/config.ts). Matching it means the banner does not show a
// lighter square edge against a dark README, and omitBackground keeps it from
// baking a page background in that a light theme would clash with.
await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.waitForSelector("img");
await page.waitForTimeout(600);

const loaded = await page.evaluate(() => document.querySelector("img")?.naturalWidth ?? 0);
if (loaded !== 1024) {
  throw new Error(`favicon.svg did not load (naturalWidth ${loaded}, expected 1024)`);
}

await page.locator("img").screenshot({ path: `${OUT_DIR}/banner.png`, omitBackground: true });
await browser.close();
unlinkSync(htmlPath);

console.log(`wrote ${OUT_DIR}/banner.png at ${WIDTH}x${HEIGHT} from a ${SOURCE}`);
