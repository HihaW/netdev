import { mkdirSync, writeFileSync } from "node:fs";
import { clearBfsCache } from "../src/game/bfs.js";
import { resetEntityIds } from "../src/game/entities.js";
import { generateLevel } from "../src/game/dungeon.js";
import { placeEntities } from "../src/game/spawn.js";

const SEED = process.argv[2] ?? "netdev-fixture-v1";
const out = new URL("../test/fixtures/determinism-fixture.json", import.meta.url);

function snapshot(seed: string, level: number) {
  // Ids are minted from a module counter that a run starts at e1, and the test
  // resets it per level, so the generator has to as well — otherwise the fixture
  // records a cumulative numbering no run ever sees.
  resetEntityIds();
  clearBfsCache();
  const map = generateLevel(seed, level);
  const placement = placeEntities(map, seed);
  return {
    level: map.level,
    generator: map.generator,
    attempt: map.attempt,
    tiles: Array.from(map.tiles),
    rooms: map.rooms.map((r) => ({ ...r })),
    spawn: { ...map.spawn },
    stairs: { ...map.stairs },
    enemies: placement.enemies.map((e) => ({ ...e, lastKnown: e.lastKnown && { ...e.lastKnown } })),
    items: placement.items.map((i) => ({ ...i })),
  };
}

const levels = [];
for (let level = 1; level <= 10; level++) levels.push(snapshot(SEED, level));

mkdirSync(new URL("../test/fixtures/", import.meta.url), { recursive: true });
// 2-space indent, then prettier runs over the result — `npm run lint` checks
// this file, so writing unformatted JSON would fail the gate every time the
// fixture is regenerated. Prettier is the formatter, not this script.
writeFileSync(out, `${JSON.stringify({ seed: SEED, levels }, null, 2)}\n`);
console.log(`wrote ${levels.length} levels for seed "${SEED}"`);
console.log(
  levels
    .map(
      (l) =>
        `  level ${l.level}: ${l.generator} attempt ${l.attempt}, ${l.rooms.length} rooms, ${l.enemies.length} enemies, ${l.items.length} items`,
    )
    .join("\n"),
);
