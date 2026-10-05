import * as ROT from "rot-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { clearBfsCache } from "../src/game/bfs.js";
import { rollDamage, rollDrop } from "../src/game/combat.js";
import { resetEntityIds } from "../src/game/entities.js";
import { deserialize, serialize, setSaveClock } from "../src/game/save.js";
import { createGame, resolveTurn } from "../src/game/turns.js";
import { generateLevel } from "../src/game/dungeon.js";
import {
  beginLevelGameplay,
  deriveSeed,
  gameplayRandom,
  getGameplayState,
  type RngState,
} from "../src/game/rng.js";
import { placeEntities } from "../src/game/spawn.js";
import type { EnemyEntity, ItemEntity } from "../src/game/types.js";
import { installTestStorage, stepTowardStairs } from "./fixtures.js";

// DESIGN.md §0. The claim under test is that given a seed and a level,
// construction is byte-identical on every machine, forever, and that nothing
// outside the two seeded streams can reach it.
//
// The order of these tests is the order of how much a failure would tell you,
// not the order the ticket lists them. Contamination comes first: it is the test
// that fails the moment someone calls ROT.RNG.random() in combat.ts, and it is
// the reason the global RNG is dedicated to construction in the first place.

// A snapshot of everything the contract says construction determines. Deep-equal
// on this object *is* the claim, so it carries every field §0 names: tiles,
// rooms, spawn, stairs, and each entity's full identity.
interface Construction {
  level: number;
  generator: string;
  attempt: number;
  tiles: number[];
  rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[];
  spawn: { x: number; y: number };
  stairs: { x: number; y: number };
  enemies: Record<string, unknown>[];
  items: Record<string, unknown>[];
}

// T20 asks for 1000 seeds x 10 levels, twice over. A digger level costs about
// 4 ms here, so that is ~80 s of generation in this one test — over the ticket's
// own 60 s ceiling for the file, and a determinism suite nobody runs stops being
// a gate. T20 says to reduce the seed count before reducing the assertions, so
// that is what this is: 250 seeds keeps 5 000 seed/level pairs and every
// assertion, and the contamination and cross-stream tests carry the rest of the
// coverage. Raising SEED_COUNT is the first thing to try on faster hardware.
const SEED_COUNT = 250;
const LEVEL_COUNT = 10;
const FIXTURE_SEED = "netdev-fixture-v1";
const CONTAMINATION_SEEDS = 50;
const CONTAMINATION_DRAWS = 10_000;
const CROSS_STREAM_SEEDS = 20;

// The heavy tests are given their own budget rather than the global 5 s. Nothing
// here hangs: the timeouts exist so a genuine regression reads as a slow test
// rather than as an unexplained timeout.
const GENERATION_TIMEOUT_MS = 60_000;
const GAMEPLAY_ROLLS = 500;
const SAVE_ROLLS_BEFORE = 37;
const SAVE_ROLLS_AFTER = 100;
const SAVE_ROLL_LEVEL = 7;

// T20 requires the suite's own seed source to be fixed, so a failure is
// reproducible from the test name alone. Not Math.random — that is the rule this
// file exists to enforce and it would be absurd to break it on the first line.
function testSeed(i: number): string {
  return `determinism-${i}`;
}

// Every field of an enemy, spelled out rather than spread. A new field that
// stops being derived from the seed must fail this file, not pass by omission.
function enemySnapshot(enemy: EnemyEntity): Record<string, unknown> {
  return {
    id: enemy.id,
    kind: enemy.kind,
    type: enemy.type,
    x: enemy.x,
    y: enemy.y,
    glyph: enemy.glyph,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    atk: enemy.atk,
    def: enemy.def,
    senses: enemy.senses,
    isAlerted: enemy.isAlerted,
    lastKnown: enemy.lastKnown ? { ...enemy.lastKnown } : null,
    giveUp: enemy.giveUp,
    attackCooldown: enemy.attackCooldown,
    cleaving: enemy.cleaving,
  };
}

function itemSnapshot(item: ItemEntity): Record<string, unknown> {
  return {
    id: item.id,
    kind: item.kind,
    itemId: item.itemId,
    x: item.x,
    y: item.y,
    glyph: item.glyph,
    hp: item.hp,
    maxHp: item.maxHp,
    atk: item.atk,
    def: item.def,
    stack: item.stack,
  };
}

function snapshot(seed: string, level: number): Construction {
  // The id counter is module state, not derived from the seed: a run starts at e1
  // (createGame calls resetEntityIds) and the counter only ever counts up. So two
  // passes over the same level differ in id unless the run boundary is replayed —
  // which is exactly what a fresh run does, and what makes the id comparable here.
  resetEntityIds();
  clearBfsCache();
  const map = generateLevel(seed, level);
  const placement = placeEntities(map, seed);
  return {
    level: map.level,
    generator: map.generator,
    attempt: map.attempt,
    tiles: Array.from(map.tiles),
    rooms: map.rooms.map((room) => ({ ...room })),
    spawn: { ...map.spawn },
    stairs: { ...map.stairs },
    enemies: placement.enemies.map(enemySnapshot),
    items: placement.items.map(itemSnapshot),
  };
}

function spendGameplayDraws(count: number): void {
  for (let i = 0; i < count; i++) gameplayRandom();
}

// A level 7 snapshot, for the save round-trip: the map is not in the save file
// (8.2), so a restore is only correct if the seed plus the recorded
// generator/attempt rebuilds the same board. Level 7 is the interesting one
// because it is past the first two item bands and the second enemy unlock, so a
// wrong regeneration would differ in entities as well as tiles.
function levelSevenSnapshot(seed: string): Construction {
  return snapshot(seed, SAVE_ROLL_LEVEL);
}

describe("determinism §0 — the headline claim", () => {
  it(
    `${SEED_COUNT} seeds x ${LEVEL_COUNT} levels are byte-identical across two passes`,
    () => {
      for (let i = 0; i < SEED_COUNT; i++) {
        const seed = testSeed(i);
        for (let level = 1; level <= LEVEL_COUNT; level++) {
          const first = snapshot(seed, level);
          const second = snapshot(seed, level);
          expect(second, `seed "${seed}" level ${level} diverged between passes`).toEqual(first);
        }
      }
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    "distinct seeds produce distinct levels",
    () => {
      // The mirror of the test above, and the one that would catch a generation
      // path that silently stopped using the seed: SEED_COUNT identical levels
      // would pass a byte-identity check perfectly. Level 1 only — one level per
      // seed is enough to show the seed is load-bearing.
      const tiles = new Set<string>();
      for (let i = 0; i < SEED_COUNT; i++) {
        tiles.add(JSON.stringify(snapshot(testSeed(i), 1).tiles));
      }
      expect(tiles.size).toBe(SEED_COUNT);
    },
    GENERATION_TIMEOUT_MS,
  );

  it(`levels 1-${LEVEL_COUNT} of one fixed seed match the checked-in fixture`, () => {
    const path = fileURLToPath(new URL("./fixtures/determinism-fixture.json", import.meta.url));
    const fixture = JSON.parse(readFileSync(path, "utf8")) as {
      seed: string;
      levels: Construction[];
    };

    expect(fixture.seed).toBe(FIXTURE_SEED);
    expect(fixture.levels.length).toBe(LEVEL_COUNT);
    for (const expected of fixture.levels) {
      const actual = snapshot(FIXTURE_SEED, expected.level);
      expect(actual, `fixture level ${expected.level}`).toEqual(expected);
    }
  });
});

describe("determinism §0 — the two streams never touch", () => {
  it(
    `contamination: ${CONTAMINATION_DRAWS} gameplay draws cannot reach construction`,
    () => {
      // T20 calls this the most valuable test in the repository, and it is the
      // right claim for what it does check: no gameplay draw can reach the level
      // that follows. What it does *not* check is a stray draw in the other
      // direction — the negative test showed that passes too, because
      // beginLevelConstruction reseeds the global stream anyway. See the comment
      // on "combat rolls do not depend on the global stream's state" below.
      //
      // One level per seed rather than all ten: contamination is a property of
      // the streams, not of a particular floor plan, so 50 levels prove it as
      // well as 500 would.
      for (let i = 0; i < CONTAMINATION_SEEDS; i++) {
        const seed = testSeed(i);
        const level = (i % LEVEL_COUNT) + 1;
        const before = snapshot(seed, level);
        spendGameplayDraws(CONTAMINATION_DRAWS);
        const after = snapshot(seed, level);
        expect(
          after,
          `seed "${seed}" level ${level} changed after ${CONTAMINATION_DRAWS} gameplay draws`,
        ).toEqual(before);
      }
    },
    GENERATION_TIMEOUT_MS,
  );

  it("the global ROT.RNG state is identical after two independent passes", () => {
    const first = constructionPass();
    const second = constructionPass();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it("the gameplay stream is identical after two passes spending matched rolls", () => {
    // Not toEqual() with no argument: vitest would compare a value to undefined
    // and pass. Both passes must run before either is compared, so each is
    // captured into its own variable first.
    const first = gameplayPass();
    const second = gameplayPass();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it("combat rolls do not depend on the global stream's state", () => {
    // Worth stating plainly, because T20's negative test established it: no test
    // in this file catches a stray ROT.RNG draw inside combat.ts. Not this one,
    // and not the contamination test above. Both reasons are structural.
    //
    // The contamination test spends gameplay draws and regenerates, but
    // beginLevelConstruction() reseeds the global stream at the start of every
    // generation, so a global draw spent during combat is discarded before the
    // next level is built. Contamination cannot propagate through the
    // construction path at all.
    //
    // This test moves the global stream and demands the same combat rolls back,
    // which looks like it should catch it. It does not: a stray global draw
    // advances the global stream without touching the gameplay one, so the rolls
    // come out identical whether or not the bug is present. The negative test
    // confirmed this — combat.ts with `ROT.RNG.getUniform()` in rollDamage left
    // this assertion green.
    //
    // What this test *does* protect is the other direction: that a future change
    // making combat rolls read the global stream would be caught here, which is
    // a real risk (it is the reason §0 dedicates the global stream to
    // construction) even though it is not the bug T20 expected to find.
    //
    // The stray-draw bug is caught by exactly one thing: the source-hygiene grep
    // in test/combat.test.ts. That is where the release gate for this class
    // lives, and it is a grep rather than a behavioural assertion because
    // behaviour cannot see it.
    const seed = testSeed(3);

    // Both blocks start from the same gameplay stream as well as a different
    // global one, so the only thing that differs between them is the state of
    // the stream combat is not supposed to read. Reseeding between them matters:
    // the gameplay stream carries on from where it left off, so without this the
    // two blocks would differ because they are at different points in the same
    // stream, not because anything read the global one.
    beginLevelGameplay(seed, 2);
    ROT.RNG.setState([1, 2, 3, 4]);
    const damageAtOne = Array.from({ length: 50 }, () => rollDamage());
    const dropAtOne = Array.from({ length: 50 }, () => rollDrop());

    beginLevelGameplay(seed, 2);
    ROT.RNG.setState([9999, 8888, 7777, 6666]);
    const damageAtTwo = Array.from({ length: 50 }, () => rollDamage());
    const dropAtTwo = Array.from({ length: 50 }, () => rollDrop());

    expect(damageAtTwo).toEqual(damageAtOne);
    expect(dropAtTwo).toEqual(dropAtOne);
    // A guard against the degenerate pass where every roll returns a constant.
    expect(new Set(damageAtOne).size).toBeGreaterThan(1);
  });

  it("construction does not advance the gameplay stream", () => {
    const seed = testSeed(0);
    beginLevelGameplay(seed, 1);
    spendGameplayDraws(1);
    const before = getGameplayState();

    const map = generateLevel(seed, 1);
    placeEntities(map, seed);

    expect(getGameplayState()).toEqual(before);
  });

  it("the two streams are seeded differently", () => {
    // If the two derivations ever collided, the split would be theatre: a
    // gameplay draw would be a construction draw wearing a different name. The
    // seed alone does not protect the streams — the "gen"/"play" purpose tag
    // does, so the tag is what this asserts.
    for (let i = 0; i < CROSS_STREAM_SEEDS; i++) {
      const seed = testSeed(i);
      for (let level = 1; level <= LEVEL_COUNT; level++) {
        expect(deriveSeed(seed, level, "play")).not.toBe(deriveSeed(seed, level, "gen"));
      }
    }
  });
});

// Construction is fully determined by the seed, so the global stream lands in
// the same place however the levels were ordered.
function constructionPass(): RngState {
  for (let i = 0; i < CROSS_STREAM_SEEDS; i++) {
    const seed = testSeed(i);
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      clearBfsCache();
      const map = generateLevel(seed, level);
      placeEntities(map, seed);
    }
  }
  return ROT.RNG.getState() as RngState;
}

// Both passes spend the same number of gameplay rolls, so the stream must end
// identical. This is what shows the split holds, not merely that construction is
// stable.
function gameplayPass(): RngState {
  const seed = `${FIXTURE_SEED}-gameplay`;
  clearBfsCache();
  const map = generateLevel(seed, 4);
  placeEntities(map, seed);
  beginLevelGameplay(seed, 4);
  spendGameplayDraws(GAMEPLAY_ROLLS);
  return getGameplayState();
}

describe("determinism §8.2 — the save does not store the map", () => {
  beforeEach(() => {
    installTestStorage();
  });

  it(`preserves playRngState through serialize -> deserialize, and the next ${SAVE_ROLLS_AFTER} draws are unchanged`, () => {
    const state = createGame("determinism-roundtrip");
    for (let i = 0; i < SAVE_ROLLS_BEFORE; i++) resolveTurn(state, { kind: "wait" });

    const save = serialize(state);
    expect(save.playRngState).toEqual(getGameplayState());

    // Taken before the restore, so the baseline is the stream the save captured.
    const expected = Array.from({ length: SAVE_ROLLS_AFTER }, () => gameplayRandom());

    const restored = deserialize(save);
    expect(getGameplayState()).toEqual(save.playRngState);

    const actual = Array.from({ length: SAVE_ROLLS_AFTER }, () => gameplayRandom());
    expect(actual).toEqual(expected);
    expect(restored.level).toBe(state.level);
  });

  it(`a level ${SAVE_ROLL_LEVEL} save restores to a level ${SAVE_ROLL_LEVEL} with identical tiles, rooms and enemy positions`, () => {
    const seed = `${FIXTURE_SEED}-save`;
    const state = createGame(seed);
    // Descend, so the save carries a level past the first two item bands and the
    // second enemy unlock. A wrong regeneration would differ in the entities as
    // well as the tiles.
    while (state.level < SAVE_ROLL_LEVEL && !state.gameOver) {
      const step = stepTowardStairs(state);
      if (step === null) break;
      const outcome = resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
      if (outcome.gameOver) break;
      // The walker walks into enemies and never retreats, so it dies around
      // level 3 on any seed — which is TUNING.md's point about the bot, not a
      // fact about this test. Topping the player back up keeps the descent about
      // what is being tested: that a level 7 save rebuilds level 7.
      state.player.hp = state.player.maxHp;
    }
    expect(state.level).toBe(SAVE_ROLL_LEVEL);

    const expected = levelSevenSnapshot(seed);
    expect(expected.enemies.length).toBeGreaterThan(0);

    const restored = deserialize(serialize(state));
    expect(restored.level).toBe(SAVE_ROLL_LEVEL);
    expect(Array.from(restored.map.tiles)).toEqual(expected.tiles);
    expect(restored.map.rooms).toEqual(expected.rooms);
    expect(restored.map.generator).toBe(expected.generator);
    expect(restored.map.attempt).toBe(expected.attempt);

    // The saved entities are the run's own, and any enemy that moved since
    // generation is legitimately elsewhere — so this compares the placement the
    // rebuilt map derives from the seed against the same placement taken
    // independently. It has to reset the id counter, or it would be reading a
    // run's accumulated numbering rather than a fresh level's.
    resetEntityIds();
    const replaced = placeEntities(restored.map, seed);
    expect(replaced.enemies.map(enemySnapshot)).toEqual(expected.enemies);
    expect(replaced.items.map(itemSnapshot)).toEqual(expected.items);
  });

  it("two runs driven by the same input produce byte-identical saves except savedAt", () => {
    // save.test.ts covers the stream; this is the file-level claim, which is
    // what a corrupted or drifting save would break.
    const script = [
      { kind: "wait" },
      { kind: "move", dx: 1, dy: 0 },
      { kind: "wait" },
      { kind: "move", dx: 0, dy: -1 },
    ] as const;

    installTestStorage();
    setSaveClock(() => "2026-10-02T00:00:00.000Z");
    const first = createGame("determinism-byte");
    for (const action of script) resolveTurn(first, action);
    const firstSave = JSON.stringify(serialize(first));

    installTestStorage();
    setSaveClock(() => "2026-10-03T09:30:00.000Z");
    const second = createGame("determinism-byte");
    for (const action of script) resolveTurn(second, action);
    const secondSave = JSON.stringify(serialize(second));

    // The clocks differ on purpose: savedAt is the one field that is allowed to.
    const strip = (text: string): string => text.replace(/"savedAt":"[^"]*"/, '"savedAt":""');
    expect(strip(secondSave)).toBe(strip(firstSave));

    // And the exclusion is exactly one field, not a licence to ignore drift.
    const parsed = JSON.parse(secondSave) as Record<string, unknown>;
    expect(Object.keys(parsed)).toContain("savedAt");
    expect(parsed.savedAt).toBe("2026-10-03T09:30:00.000Z");
  });
});
