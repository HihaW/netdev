// Screenshot capture for the README (T21). Not part of the app and not part of
// the test suite — it drives the real build in a real browser so the images show
// the actual renderer rather than a mock of it.
//
//   npm run dev          # in one shell
//   npm run screenshots  # in another
//
// Needs playwright-core, which is deliberately NOT a dependency of the game:
// nothing in src/ or test/ uses it, and adding it would make every `npm install`
// on a fresh clone pull a browser driver for a script that produces documentation
// images. Install it when you need it:
//
//   npm install --no-save playwright-core
//
// Then run it. Chromium is expected at /usr/bin/chromium; override with
// CHROMIUM_PATH, and point at a different dev server with SCREENSHOT_URL.
//
// Its last job is reporting: it counts requests and prints any that left the
// origin, which is PRD §9's zero-network claim checked mechanically rather than
// by hand. That check belongs to T22, which has to repeat it against the
// deployed build — a dev-only leak (an HMR client, a plugin-injected script) is
// invisible locally and is exactly what survives into production.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = process.argv[2] ?? "docs/screenshots";
const URL_BASE = process.env.SCREENSHOT_URL ?? "http://localhost:5173/";
const EXECUTABLE = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";
// Sized to the game rather than to a monitor: the canvas is 60x25 cells at 14 px
// (840x350) and the HUD sits under it, so a desktop-sized viewport is mostly
// dead black space in the image.
const VIEWPORT = { width: 900, height: 620 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

// The console is the interesting part: PRD 9 claims zero network requests after
// load, so this doubles as the check that capturing does not perturb the app.
const requests = [];
page.on("request", (request) => requests.push(request.url()));
page.on("console", (message) => {
  if (message.type() === "error") console.error("  console error:", message.text());
});

// Cropped to the #game element rather than the viewport. The canvas is 840x350
// and the page centres it in a flex column, so a viewport shot is mostly black —
// which makes the fog of war look emptier than it is.
async function shot(name) {
  await page.waitForTimeout(350);
  const host = page.locator("#game");
  await host.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  wrote ${OUT}/${name}.png`);
}

// Play a scripted run so the screenshots are of a real game, not a posed one.
// Keys are the bindings in DESIGN.md 9: arrows/WASD move, . waits.
async function play(actions) {
  for (const key of actions) {
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
}

console.log("title screen");
await page.goto(URL_BASE, { waitUntil: "networkidle" });
// A fixed seed keeps the screenshots stable between runs. Set on the title
// screen's seed field so nothing about the app is bypassed.
const seedInput = page.locator("input").first();
if (await seedInput.count()) {
  await seedInput.fill("netdev-fixture-v1");
}
await shot("01-title");

console.log("level 1, unexplored (fog of war)");
await page
  .getByRole("button", { name: /begin|start|new run/i })
  .first()
  .click();
await shot("02-fog-of-war");

console.log("explored, with the message log");
await play(["ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft"]);
await shot("03-explored");

console.log("deeper in, more of the level lit");
await play([
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowDown",
  "ArrowDown",
  "ArrowDown",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowUp",
  "ArrowUp",
  "ArrowRight",
  "ArrowRight",
]);
await shot("04-deeper");

console.log("inventory");
await page.keyboard.press("i");
await shot("05-inventory");
await page.keyboard.press("Escape");

console.log("pause menu");
await page.keyboard.press("Escape");
await shot("06-pause");
await page.keyboard.press("Escape");

// The Guardian fight needs a run that survives nine levels, which a scripted
// walker does not — it dies on level 3 whatever the routing, which is the point
// TUNING.md makes about the bot. So the level 10 state is written as a save and
// loaded back through the app's own Continue path.
//
// That means no debug hook in src/: the state is built by enterLevel, written by
// writeSave, and restored by loadGame — the same three calls a real player goes
// through, and the same ones the save round-trip test asserts.
console.log("the Guardian (level 10)");
await page.evaluate(async () => {
  const turns = await import("/src/game/turns.ts");
  const save = await import("/src/game/save.ts");
  const scoped = turns.enterLevel("guardian-shot", 10);

  // The player spawns in room[0] and the Guardian stands on the stairs, which are
  // deliberately as far apart as the map allows (§2.5), so a fresh level 10 state
  // shows fog and no boss. Moving the player next to the Guardian is what makes
  // the telegraph visible — the state is otherwise the app's own.
  const guardian = scoped.entities.find((entity) => entity.kind === "enemy");
  const player = { ...scoped.player };
  if (guardian) {
    // One tile short of adjacency in the direction with open floor, so the
    // renderer has something to draw and FOV reaches the Guardian.
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const x = guardian.x - dx;
      const y = guardian.y - dy;
      const tile = scoped.map.tiles[y * scoped.map.width + x];
      if (tile === 0 || tile === 2) {
        player.x = x;
        player.y = y;
        break;
      }
    }
    // Alerted, so it has noticed the player and the wind-up logic is live.
    guardian.isAlerted = true;
    guardian.lastKnown = { x: player.x, y: player.y };
  }

  save.writeSave({
    seed: "guardian-shot",
    level: 10,
    turnCount: 41,
    kills: 9,
    deathCause: null,
    player,
    map: scoped.map,
    entities: scoped.entities,
    inventory: [],
    explored: scoped.explored,
    messages: [],
    visible: new Set(),
    gameOver: false,
  });
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Continue/ }).click();
await page.waitForTimeout(250);
// Two steps so FOV is resolved and the frame is a real drawn one.
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(120);
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(200);
await shot("07-guardian");

await browser.close();

const external = requests.filter((url) => !url.startsWith(URL_BASE) && !url.startsWith("data:"));
console.log(`\nrequests: ${requests.length} total, ${external.length} external`);
if (external.length > 0) {
  console.log("external requests (these would break PRD 9 in production):");
  for (const url of external) console.log(`  ${url}`);
}
