import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENEMY_STATS } from "../src/data/enemies.js";
import { chebyshev } from "../src/game/bfs.js";
import { calculateDamage } from "../src/game/combat.js";
import { FINAL_LEVEL, GRID_HEIGHT, GRID_WIDTH, POTION_HEAL_AMOUNT } from "../src/game/config.js";
import { generateLevel } from "../src/game/dungeon.js";
import { createEnemy, resetEntityIds } from "../src/game/entities.js";
import { hasSave, readHistory, writeSave } from "../src/game/save.js";
import {
  createGame,
  enterLevel,
  refreshFov,
  resolveTurn,
  stairsSealed,
} from "../src/game/turns.js";
import { installTestStorage, stepTowardStairs } from "./fixtures.js";
import type { EnemyEntity, GameState, LevelData } from "../src/game/types.js";

const PLAYER_X = 1;
const PLAYER_Y = 1;

// A hand-authored hall. (2,1) is next to the player; with the Guardian at (3,2)
// the tiles (3,1), (3,3), (2,2) and (4,2) are orthogonal to it and (4,1) and
// (4,3) are diagonal, which is enough to tell one footprint from the other.
const HALL = ["##########", "#........#", "#........#", "#........#", "##########"];

function hallState(
  enemies: EnemyEntity[],
  playerHp = 40,
  atk = 7,
  playerX = PLAYER_X,
  playerY = PLAYER_Y,
): GameState {
  resetEntityIds();
  const width = HALL[0]?.length ?? 0;
  const height = HALL.length;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles[y * width + x] = HALL[y]?.[x] === "#" ? 1 : 0;
  }

  const map: LevelData = {
    level: FINAL_LEVEL,
    width,
    height,
    tiles,
    rooms: [{ x: 1, y: 1, w: width - 2, h: height - 2, cx: 2, cy: 2 }],
    spawn: { x: PLAYER_X, y: PLAYER_Y },
    stairs: { x: 8, y: 3 },
    generator: "digger",
    attempt: 0,
  };
  const state: GameState = {
    seed: "guardian-hall",
    level: FINAL_LEVEL,
    turnCount: 0,
    kills: 0,
    deathCause: null,
    inventory: [],
    player: {
      kind: "player",
      id: "e1",
      x: playerX,
      y: playerY,
      glyph: "@",
      hp: playerHp,
      maxHp: playerHp,
      atk,
      def: 1,
    },
    map,
    entities: [...enemies],
    explored: new Uint8Array(width * height),
    messages: [],
    visible: new Set<number>(),
    gameOver: false,
  };
  refreshFov(state);
  return state;
}

function guardianAt(x: number, y: number, targetX = PLAYER_X, targetY = PLAYER_Y): EnemyEntity {
  const guardian = createEnemy("guardian", x, y, 1);
  guardian.isAlerted = true;
  guardian.lastKnown = { x: targetX, y: targetY };
  guardian.giveUp = 99;
  return guardian;
}

function corpseOf(guardian: EnemyEntity): GameState["entities"][number] {
  return {
    kind: "corpse",
    id: guardian.id,
    x: guardian.x,
    y: guardian.y,
    glyph: guardian.glyph,
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    type: guardian.type,
  };
}

describe("level 10 holds one entity", () => {
  it("spawns the Guardian alone, standing on the stairs", () => {
    for (let variant = 0; variant < 10; variant++) {
      const seed = `guardian-spawn-${variant}`;
      const map = generateLevel(seed, FINAL_LEVEL);
      const scoped = enterLevel(seed, FINAL_LEVEL);

      expect(scoped.entities, seed).toHaveLength(1);
      expect(scoped.entities[0]).toMatchObject({ kind: "enemy", type: "guardian" });
      expect(scoped.entities[0]?.x).toBe(map.stairs.x);
      expect(scoped.entities[0]?.y).toBe(map.stairs.y);
    }
  });

  it("places no items, because level 10 places nothing", () => {
    const map = generateLevel("guardian-no-items", FINAL_LEVEL);
    expect(enterLevel("guardian-no-items", FINAL_LEVEL).entities).toHaveLength(1);
    expect(map.rooms.length).toBeGreaterThanOrEqual(4);
  });

  it("leaves the Guardian out of reach of the spawn in most seeds", () => {
    // If it always spawned next to the player the fight would have no opening.
    let distant = 0;
    const seeds = 200;
    for (let variant = 0; variant < seeds; variant++) {
      const seed = `guardian-reach-${variant}`;
      const map = generateLevel(seed, FINAL_LEVEL);
      const guardian = enterLevel(seed, FINAL_LEVEL).entities[0];
      if (!guardian) continue;
      if (chebyshev(guardian.x, guardian.y, map.spawn.x, map.spawn.y) > 1) distant += 1;
    }
    expect(distant / seeds).toBeGreaterThanOrEqual(0.5);
  }, 30_000);
});

describe("the seal is derived, never stored", () => {
  it("is true while the Guardian lives", () => {
    expect(stairsSealed([guardianAt(4, 1)])).toBe(true);
  });

  it("is false once the Guardian is a corpse", () => {
    const guardian = guardianAt(6, 3);
    // A corpse is `kind: "corpse"`, not `kind: "enemy"` with type guardian. This
    // is the easy place to write the check wrong, and getting it wrong strands
    // the player on a cleared level 10 forever.
    expect(stairsSealed([corpseOf(guardian)])).toBe(false);
  });

  it("keeps no flag anywhere in the turn loop", () => {
    const source = readFileSync(new URL("../src/game/turns.ts", import.meta.url), "utf8");
    expect(source).not.toContain("stairsUnlocked");
    expect(source).not.toContain("stairsOpen");
  });
});

describe("the sealed stairs", () => {
  it("refuses the step, logs, and consumes no turn", () => {
    // Standing next to the stairs. The Guardian is beside the player rather than
    // on the stairs: a Guardian on the stair tile is bump-to-attack, which is the
    // point — it starts there and walks at you, and only then is the stair tile
    // reachable at all.
    const state = hallState([guardianAt(6, 3, 7, 3)], 40, 7, 7, 3);
    const before = { turns: state.turnCount, x: state.player.x, y: state.player.y };

    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    expect(outcome.consumed).toBe(false);
    expect(outcome.won).toBe(false);
    expect(state.turnCount).toBe(before.turns);
    expect(state.level).toBe(FINAL_LEVEL);
    // Not one tile of progress, and no turn for it.
    expect({ x: state.player.x, y: state.player.y }).toEqual({ x: before.x, y: before.y });
    expect(state.messages.join(" ")).toContain("will not open while the guardian lives");
  });

  it("lets no enemy act, because the turn was refused before they got one", () => {
    const rat = createEnemy("rat", 5, 3, 0);
    const state = hallState([rat, guardianAt(6, 3, 7, 3)], 40, 7, 7, 3);
    const at = { x: rat.x, y: rat.y };

    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    expect({ x: rat.x, y: rat.y }).toEqual(at);
    expect(state.messages.join(" ")).not.toContain("hits you");
  });
});

// Geometry for the cleave tests: the Guardian at (2,2), the player at (2,1), so
// the player is both adjacent (so the cleave triggers) and orthogonally inside
// the footprint (so the cleave reaches them). Around the Guardian, (1,2), (3,2)
// and (2,3) are orthogonal and (1,1), (3,1), (1,3), (3,3) are diagonal.
const GUARDIAN_X = 2;
const GUARDIAN_Y = 2;
const BESIDE_X = 2;
const BESIDE_Y = 1;

describe("the telegraphed cleave", () => {
  it("spends its first turn adjacent winding up, and deals no damage", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const state = hallState([guardian], 40, 7, BESIDE_X, BESIDE_Y);
    const hp = state.player.hp;

    resolveTurn(state, { kind: "wait" });

    expect(state.messages.join(" ")).toContain("guardian winds up a massive swing");
    expect(state.player.hp).toBe(hp);
    expect(guardian.cleaving).toBe(true);
  });

  it("lands on its second turn", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const state = hallState([guardian], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    const hp = state.player.hp;
    resolveTurn(state, { kind: "wait" });

    expect(state.messages.join(" ")).toContain("cleave hits you for");
    expect(state.player.hp).toBeLessThan(hp);
    expect(guardian.cleaving).toBe(false);
  });

  it("deals damage through the normal formula, so armour still counts", () => {
    const armoured = hallState(
      [guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y)],
      40,
      7,
      BESIDE_X,
      BESIDE_Y,
    );
    const naked = hallState(
      [guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y)],
      40,
      7,
      BESIDE_X,
      BESIDE_Y,
    );
    armoured.player.def = 3;
    naked.player.def = 0;

    for (const state of [armoured, naked]) {
      resolveTurn(state, { kind: "wait" });
      resolveTurn(state, { kind: "wait" });
    }

    // Same roll range, smaller window with armour: 7 atk is never less than 1.
    expect(40 - armoured.player.hp).toBeLessThan(40 - naked.player.hp);
    expect(40 - armoured.player.hp).toBeGreaterThanOrEqual(calculateDamage(7, 99, -1));
  });

  it("hits every entity orthogonally adjacent to it", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const west = createEnemy("rat", 1, 2, 0);
    const east = createEnemy("rat", 3, 2, 0);
    const south = createEnemy("rat", 2, 3, 0);
    const state = hallState([guardian, west, east, south], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });

    // A rat has 5 HP and the cleave deals about 7, so all three die outright.
    for (const rat of [west, east, south]) {
      expect(rat.hp, `rat at ${rat.x},${rat.y}`).toBe(0);
      expect(
        state.entities.some((e) => e.kind === "corpse" && e.id === rat.id),
        `corpse for the rat at ${rat.x},${rat.y}`,
      ).toBe(true);
    }
    expect(state.messages.join(" ")).toContain("The rat dies.");
  });

  it("does not reach diagonal neighbours", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    // Both are diagonal to the Guardian and adjacent to the player, which is what
    // keeps them where they are put: a rat two tiles away would path toward the
    // player and step into the footprint on its own.
    const northWest = createEnemy("rat", 1, 1, 0);
    const northEast = createEnemy("rat", 3, 1, 0);
    const state = hallState([guardian, northWest, northEast], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });

    for (const rat of [northWest, northEast]) {
      expect(rat.hp, `rat at ${rat.x},${rat.y}`).toBe(ENEMY_STATS.rat.hp);
      expect(rat.x === 1 || rat.x === 3, `the rat at ${rat.x},${rat.y} moved`).toBe(true);
    }
  });

  it("does not hit itself", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const state = hallState([guardian], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });

    expect(guardian.hp).toBe(ENEMY_STATS.guardian.hp);
  });

  it("kills a live rat in the crossfire, leaving a corpse", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const rat = createEnemy("rat", 2, 3, 0);
    const state = hallState([guardian, rat], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });

    expect(rat.hp).toBe(0);
    expect(state.entities.some((e) => e.kind === "corpse" && e.id === rat.id)).toBe(true);
  });

  it("does not land a stale swing at a player it can no longer reach", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const state = hallState([guardian], 60, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    expect(guardian.cleaving).toBe(true);

    // Now step the player out of reach and disarm the chase so the Guardian
    // cannot simply close the gap one tile per turn.
    state.player.x = 6;
    state.player.y = 3;
    guardian.isAlerted = true;
    guardian.giveUp = 99;
    guardian.lastKnown = { x: 3, y: 3 };
    refreshFov(state);

    const hp = state.player.hp;
    const mark = state.messages.length;
    resolveTurn(state, { kind: "wait" });

    // Out of range: the swing comes down on nothing and normal attacks resume.
    expect(chebyshev(guardian.x, guardian.y, state.player.x, state.player.y)).toBeGreaterThan(1);
    expect(state.messages.slice(mark).join(" ")).not.toContain("cleave hits you");
    expect(state.player.hp).toBe(hp);
    expect(guardian.cleaving).toBe(false);
  });

  it("only winds up when the player is adjacent", () => {
    const guardian = guardianAt(7, 2, 7, 2);
    const state = hallState([guardian], 40, 7, BESIDE_X, BESIDE_Y);

    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });

    expect(state.messages.join(" ")).not.toContain("winds up");
    expect(guardian.cleaving).toBe(false);
  });

  it("cannot leak the wind-up, because the wind-up needs melee range", () => {
    const guardian = guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y);
    const state = hallState([guardian], 40, 7, BESIDE_X, BESIDE_Y);

    // resolveTurn recomputes FOV before any enemy acts, so an enemy adjacent to
    // the player is always in it. The cleave's telegraph therefore cannot be
    // suppressed by anything the player cannot see — which is the same
    // structural guarantee the Skeleton's hold line has. The non-leak gate is on
    // the line anyway (DESIGN.md 3.3), it is simply unreachable here.
    expect(state.visible.has(guardian.y * state.map.width + guardian.x)).toBe(true);

    resolveTurn(state, { kind: "wait" });

    expect(state.messages.join(" ")).toContain("winds up");
    expect(guardian.cleaving).toBe(true);
  });

  it("does not stop the player drinking during a wind-up", () => {
    const state = hallState(
      [guardianAt(GUARDIAN_X, GUARDIAN_Y, BESIDE_X, BESIDE_Y)],
      40,
      7,
      BESIDE_X,
      BESIDE_Y,
    );
    state.player.hp = 10;
    state.inventory.push({ itemId: "potion", stack: 2 });

    const hp = state.player.hp;
    resolveTurn(state, { kind: "drink" });

    expect(state.player.hp).toBe(hp + POTION_HEAL_AMOUNT);
  });
});

describe("victory", () => {
  it("unseals the stairs when the Guardian dies, and leaves a corpse", () => {
    const guardian = guardianAt(2, 1);
    const state = hallState([guardian], 200);
    guardian.hp = 1;
    expect(stairsSealed(state.entities)).toBe(true);

    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    expect(guardian.hp).toBe(0);
    expect(state.entities.some((e) => e.kind === "corpse" && e.id === guardian.id)).toBe(true);
    expect(stairsSealed(state.entities)).toBe(false);
  });

  it("is won by taking the cleared stairs, and does not descend past level 10", () => {
    installTestStorage();
    const state = hallState([], 40, 7, 7, 3);
    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    expect(outcome.won).toBe(true);
    expect(outcome.descended).toBe(false);
    expect(outcome.gameOver).toBe(false);
    expect(state.level).toBe(FINAL_LEVEL);
  });

  it("deletes the save and records a won run in the history", () => {
    installTestStorage();
    const state = hallState([], 40, 7, 7, 3);
    // The hall is 10x5, and the save validator rightly refuses an explored bitmap
    // that is not one byte per grid tile (1500). Widen it so this test is about
    // victory rather than about bitmap validation.
    state.explored = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    state.seed = "victory-save";
    writeSave(state);
    expect(hasSave()).toBe(true);

    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    // A finished run is not a resumable one (DESIGN.md 8.3).
    expect(hasSave()).toBe(false);
    const history = readHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.won).toBe(true);
    expect(history[0]?.level).toBe(FINAL_LEVEL);
    expect(history[0]?.seed).toBe("victory-save");
  });

  it("records a won run with no cause of death", () => {
    installTestStorage();
    const state = hallState([], 40, 7, 7, 3);
    state.explored = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    expect(readHistory()[0]?.cause).toBeNull();
    expect(state.deathCause).toBeNull();
  });
});

describe("a real level 10", () => {
  it("is sealed while the Guardian lives on a real level 10", () => {
    for (let variant = 0; variant < 8; variant++) {
      const seed = `guardian-real-${variant}`;
      const state = createGame(seed);
      let guard = 0;
      while (state.level < FINAL_LEVEL && guard < 4000) {
        const step = stepTowardStairs(state);
        if (!step) break;
        resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
        guard += 1;
        if (state.gameOver) break;
      }
      if (state.level < FINAL_LEVEL || state.gameOver) continue;

      expect(stairsSealed(state.entities), seed).toBe(true);
      expect(state.entities.filter((e) => e.kind === "enemy")).toHaveLength(1);
    }
  }, 60_000);
});
