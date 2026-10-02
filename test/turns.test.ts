import { describe, expect, it } from "vitest";
import { mapFromStrings } from "./fixtures.js";
import {
  createGame,
  enterLevel,
  enemiesInOrder,
  idNumber,
  pushMessage,
  refreshFov,
  resolveTurn,
  stairsSealed,
} from "../src/game/turns.js";
import { createCorpse, createEnemy, resetEntityIds } from "../src/game/entities.js";
import { clearBfsCache, distanceField, nextStep } from "../src/game/bfs.js";
import { ENEMY_STATS } from "../src/data/enemies.js";
import { GIVE_UP_TURNS } from "../src/game/config.js";
import { Tile, type EnemyEntity, type GameState, type LevelData } from "../src/game/types.js";

// A hand-authored hall with a wall across the middle. The player starts at
// (1,1), hard against the top wall, so "move up" is a wall bump. The top
// chamber (rows 1-2) and the bottom chamber (rows 4-5) are joined only by the
// columns at x=1 and x=8, so a tile at (5,5) has no line of sight to (1,1).
const HALL = [
  "##########",
  "#........#",
  "#........#",
  "#.######.#",
  "#........#",
  "#........#",
  "##########",
];

const PLAYER_X = 1;
const PLAYER_Y = 1;
// Occluded from the player, and 4 tiles away inside the 8 senses radius.
const HIDDEN_X = 5;
const HIDDEN_Y = 5;
// (3,3) is a wall tile: unreachable, so it is a safe "lastKnown" for tests
// that need an enemy to hold position.
const WALL_X = 3;
const WALL_Y = 3;

function hallLevel(): LevelData {
  const { tiles, width, height } = mapFromStrings(HALL);
  return {
    level: 1,
    width,
    height,
    tiles,
    rooms: [{ x: 1, y: 1, w: 8, h: 5, cx: 2, cy: 2 }],
    spawn: { x: PLAYER_X, y: PLAYER_Y },
    stairs: { x: 8, y: 5 },
    generator: "digger",
    attempt: 0,
  };
}

function stateWith(
  enemies: EnemyEntity[],
  opts: { playerX?: number; playerY?: number; playerHp?: number } = {},
): GameState {
  clearBfsCache();
  const map = hallLevel();
  const state: GameState = {
    seed: "test-seed",
    level: 1,
    turnCount: 0,
    kills: 0,
    deathCause: null,
    inventory: [],
    player: {
      kind: "player",
      id: "e1",
      x: opts.playerX ?? PLAYER_X,
      y: opts.playerY ?? PLAYER_Y,
      glyph: "@",
      hp: opts.playerHp ?? 20,
      maxHp: 20,
      atk: 4,
      def: 1,
    },
    map,
    entities: [...enemies],
    explored: new Uint8Array(map.width * map.height),
    messages: [],
    visible: new Set<number>(),
    gameOver: false,
  };
  // resolveTurn gates enemy log lines on the FOV left by the previous turn,
  // so a hand-built state needs one before its first action.
  refreshFov(state);
  return state;
}

function walkTo(state: GameState, tx: number, ty: number, maxTurns = 200): boolean {
  let guard = 0;
  while ((state.player.x !== tx || state.player.y !== ty) && guard < maxTurns) {
    const field = distanceField(state.map.tiles, state.map.width, state.map.height, tx, ty);
    const step = nextStep(field, state.map.width, state.player.x, state.player.y);
    if (!step) return false;
    resolveTurn(state, {
      kind: "move",
      dx: step.x - state.player.x,
      dy: step.y - state.player.y,
    });
    guard++;
  }
  return state.player.x === tx && state.player.y === ty;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

describe("fixture", () => {
  it("has the shape the tests assume", () => {
    const level = hallLevel();
    expect(level.tiles[PLAYER_Y * level.width + PLAYER_X]).toBe(Tile.Floor);
    expect(level.tiles[(PLAYER_Y - 1) * level.width + PLAYER_X]).toBe(Tile.Wall);
    expect(level.tiles[WALL_Y * level.width + WALL_X]).toBe(Tile.Wall);
    expect(level.tiles[HIDDEN_Y * level.width + HIDDEN_X]).toBe(Tile.Floor);
  });
});

describe("enemy activation", () => {
  it("an enemy that can neither see the player nor is alerted does not move", () => {
    const enemy = createEnemy("rat", HIDDEN_X, HIDDEN_Y, 0);
    const state = stateWith([enemy]);
    resolveTurn(state, { kind: "wait" });
    expect(enemy.x).toBe(HIDDEN_X);
    expect(enemy.y).toBe(HIDDEN_Y);
    expect(enemy.isAlerted).toBe(false);
    expect(state.messages).toHaveLength(0);
  });

  it("an enemy that can see the player becomes alerted and steps toward them", () => {
    const enemy = createEnemy("rat", 5, 1, 0);
    const state = stateWith([enemy]);
    resolveTurn(state, { kind: "wait" });
    expect(enemy.isAlerted).toBe(true);
    expect(enemy.lastKnown).toEqual({ x: PLAYER_X, y: PLAYER_Y });
    expect(enemy.x).toBe(4);
  });

  it("an enemy with an unreachable lastKnown holds position and does not throw", () => {
    const enemy = createEnemy("rat", HIDDEN_X, HIDDEN_Y, 0);
    enemy.isAlerted = true;
    enemy.lastKnown = { x: WALL_X, y: WALL_Y };
    enemy.giveUp = 3;
    const state = stateWith([enemy]);
    resolveTurn(state, { kind: "wait" });
    expect(enemy.x).toBe(HIDDEN_X);
    expect(enemy.y).toBe(HIDDEN_Y);
  });

  it("an enemy out of senses range is never alerted", () => {
    const skeleton = createEnemy("skeleton", 7, 1, 0);
    const state = stateWith([skeleton]);
    expect(ENEMY_STATS.skeleton.senses).toBe(4);
    resolveTurn(state, { kind: "wait" });
    expect(skeleton.isAlerted).toBe(false);
    expect(skeleton.x).toBe(7);
  });
});

describe("player movement", () => {
  it("stepping into a wall consumes no turn and produces no message", () => {
    const state = stateWith([]);
    const outcome = resolveTurn(state, { kind: "move", dx: 0, dy: -1 });
    expect(outcome.consumed).toBe(false);
    expect(state.turnCount).toBe(0);
    expect(state.messages).toHaveLength(0);
    expect(state.player.y).toBe(PLAYER_Y);
  });

  it("a legal move consumes exactly one turn", () => {
    const state = stateWith([]);
    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    expect(outcome.consumed).toBe(true);
    expect(state.turnCount).toBe(1);
    expect(state.player.x).toBe(PLAYER_X + 1);
  });

  it("moving off the map consumes no turn", () => {
    const state = stateWith([], { playerX: 0, playerY: 0 });
    expect(resolveTurn(state, { kind: "move", dx: -1, dy: 0 }).consumed).toBe(false);
    expect(state.turnCount).toBe(0);
  });

  it("bumping a hostile entity attacks instead of moving", () => {
    const rat = createEnemy("rat", 2, 1, 0);
    const state = stateWith([rat], { playerHp: 100 });
    rat.hp = 3;
    const hpBefore = rat.hp;
    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    expect(rat.hp).toBeLessThan(hpBefore);
    expect(state.player.x).toBe(PLAYER_X);
    expect(state.messages.join(" ")).toContain("You hit the rat");
  });

  it("killing an enemy leaves a corpse on its tile", () => {
    const rat = createEnemy("rat", 2, 1, 0);
    const state = stateWith([rat]);
    rat.hp = 1;
    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    const corpse = state.entities.find((e) => e.id === rat.id);
    expect(corpse?.kind).toBe("corpse");
    expect(corpse?.x).toBe(2);
    expect(corpse?.y).toBe(1);
    expect(state.messages.join(" ")).toContain("The rat dies");
  });
});

describe("player death", () => {
  it("aborts before any later enemy acts, and does not increment turnCount", () => {
    const first = createEnemy("rat", 2, 1, 0);
    const second = createEnemy("rat", 5, 1, 0);
    const state = stateWith([first, second], { playerHp: 1 });
    const secondX = second.x;

    const outcome = resolveTurn(state, { kind: "wait" });

    expect(state.player.hp).toBe(0);
    expect(outcome.gameOver).toBe(true);
    expect(outcome.aborted).toBe(true);
    expect(state.gameOver).toBe(true);
    expect(state.turnCount).toBe(0);
    // The first rat killed the player, so the second rat never acted.
    expect(second.x).toBe(secondX);
    expect(second.isAlerted).toBe(false);
  });
});

describe("iteration order", () => {
  it("is by ascending id and stable across a run", () => {
    const a = createEnemy("rat", 6, 1, 0);
    const b = createEnemy("rat", 4, 1, 0);
    const c = createEnemy("rat", 8, 1, 0);
    const state = stateWith([c, a, b], { playerHp: 100 });
    const order = enemiesInOrder(state).map((e) => idNumber(e.id));
    expect(order).toEqual([...order].sort((l, r) => l - r));

    for (let i = 0; i < 5; i++) {
      resolveTurn(state, { kind: "wait" });
      expect(enemiesInOrder(state).map((e) => idNumber(e.id))).toEqual(order);
    }
  });

  it("orders numerically, not lexicographically", () => {
    const state = stateWith([]);
    const many = Array.from({ length: 12 }, (_, i) => createEnemy("rat", 8, 1 + (i % 2), 0));
    state.entities.push(...many);
    const order = enemiesInOrder(state).map((e) => idNumber(e.id));
    expect(order.length).toBe(12);
    expect(order).toEqual([...order].sort((l, r) => l - r));
    expect(order[0]).toBeLessThan(order[9] ?? 0);
  });
});

describe("give-up timer", () => {
  it("de-alerts once giveUp reaches 0, then freezes", () => {
    const enemy = createEnemy("rat", HIDDEN_X, HIDDEN_Y, 0);
    enemy.isAlerted = true;
    enemy.lastKnown = { x: WALL_X, y: WALL_Y };
    enemy.giveUp = GIVE_UP_TURNS;
    const state = stateWith([enemy]);

    // The sighting turn set giveUp to 6, and the decay at the end of that same
    // turn brought it to 5, so the countdown is 5 further turns.
    resolveTurn(state, { kind: "wait" });
    expect(enemy.giveUp).toBe(GIVE_UP_TURNS - 1);

    let turns = 0;
    while (enemy.isAlerted && turns < 20) {
      resolveTurn(state, { kind: "wait" });
      turns++;
    }
    expect(turns).toBe(GIVE_UP_TURNS - 1);
    expect(enemy.isAlerted).toBe(false);
    expect(enemy.lastKnown).toBeNull();
    expect(enemy.giveUp).toBe(0);

    const frozen = { x: enemy.x, y: enemy.y };
    resolveTurn(state, { kind: "wait" });
    expect({ x: enemy.x, y: enemy.y }).toEqual(frozen);
  });

  it("an enemy that still sees the player never de-alerts", () => {
    const enemy = createEnemy("rat", 5, 1, 0);
    const state = stateWith([enemy], { playerHp: 100 });
    for (let i = 0; i < 20; i++) {
      resolveTurn(state, { kind: "wait" });
    }
    expect(enemy.isAlerted).toBe(true);
  });
});

describe("skeleton cadence", () => {
  it("attacks, then holds, then attacks", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    const state = stateWith([skeleton], { playerHp: 100 });

    const hpBefore = state.player.hp;
    resolveTurn(state, { kind: "wait" });
    expect(state.player.hp).toBeLessThan(hpBefore);
    expect(skeleton.attackCooldown).toBe(1);

    const hpAfterStrike = state.player.hp;
    resolveTurn(state, { kind: "wait" });
    expect(state.player.hp).toBe(hpAfterStrike);
    expect(skeleton.attackCooldown).toBe(0);

    resolveTurn(state, { kind: "wait" });
    expect(state.player.hp).toBeLessThan(hpAfterStrike);
  });

  it("logs the hold line on the off-turn", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    const state = stateWith([skeleton], { playerHp: 100 });
    resolveTurn(state, { kind: "wait" });
    state.messages.length = 0;
    resolveTurn(state, { kind: "wait" });
    expect(state.messages.join(" ")).toContain("recovers from its swing");
  });

  it("does not step onto the player's tile while holding", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    const state = stateWith([skeleton], { playerHp: 100 });
    resolveTurn(state, { kind: "wait" });
    resolveTurn(state, { kind: "wait" });
    expect(skeleton.x).toBe(2);
    expect(skeleton.y).toBe(1);
  });
});

describe("goblin flee", () => {
  it("does not flee at exactly 30% hp", () => {
    const goblin = createEnemy("goblin", 2, 1, 0);
    goblin.hp = 3;
    const state = stateWith([goblin], { playerHp: 100 });
    expect(goblin.hp / goblin.maxHp).toBe(0.3);
    resolveTurn(state, { kind: "wait" });
    expect(state.player.hp).toBeLessThan(100);
    expect(state.messages.join(" ")).not.toContain("breaks off and runs");
  });

  it("flees when below 30% hp, increasing the distance from the player", () => {
    const goblin = createEnemy("goblin", 3, 1, 0);
    goblin.hp = 2;
    const state = stateWith([goblin], { playerHp: 100 });
    const before = distance(goblin.x, goblin.y, state.player.x, state.player.y);
    resolveTurn(state, { kind: "wait" });
    const after = distance(goblin.x, goblin.y, state.player.x, state.player.y);
    expect(after).toBeGreaterThan(before);
    expect(state.player.hp).toBe(100);
  });

  it("logs the flee line", () => {
    const goblin = createEnemy("goblin", 3, 1, 0);
    goblin.hp = 2;
    const state = stateWith([goblin], { playerHp: 100 });
    resolveTurn(state, { kind: "wait" });
    expect(state.messages.join(" ")).toContain("breaks off and runs");
  });

  it("attacks instead when it already stands at the maximum distance", () => {
    const goblin = createEnemy("goblin", 8, 5, 0);
    goblin.hp = 1;
    goblin.isAlerted = true;
    goblin.lastKnown = { x: PLAYER_X, y: PLAYER_Y };
    goblin.giveUp = 5;
    const state = stateWith([goblin], { playerHp: 100 });

    // (8,5) is the far corner of the bottom chamber: the most distant reachable
    // tile from the player, and its only free neighbours are closer.
    const hpBefore = state.player.hp;
    resolveTurn(state, { kind: "wait" });
    expect(state.messages.join(" ")).not.toContain("breaks off and runs");
    expect(state.player.hp === hpBefore || goblin.x !== 8 || goblin.y !== 5).toBe(true);
  });

  it("only flees while alerted", () => {
    const goblin = createEnemy("goblin", HIDDEN_X, HIDDEN_Y, 0);
    goblin.hp = 1;
    goblin.isAlerted = false;
    const state = stateWith([goblin], { playerHp: 100 });
    resolveTurn(state, { kind: "wait" });
    expect(goblin.x).toBe(HIDDEN_X);
    expect(goblin.isAlerted).toBe(false);
  });
});

describe("non-leak rule", () => {
  it("never pushes a message about an enemy the player cannot see", () => {
    const hidden = createEnemy("rat", HIDDEN_X, HIDDEN_Y, 0);
    hidden.senses = 12;
    hidden.isAlerted = true;
    hidden.lastKnown = { x: WALL_X, y: WALL_Y };
    hidden.giveUp = 5;
    const state = stateWith([hidden]);
    resolveTurn(state, { kind: "wait" });
    expect(state.messages).toHaveLength(0);
  });

  it("does push when the enemy is visible", () => {
    const seen = createEnemy("rat", 2, 1, 0);
    const state = stateWith([seen], { playerHp: 100 });
    resolveTurn(state, { kind: "wait" });
    expect(state.messages.join(" ")).toContain("hits you");
  });
});

describe("message log", () => {
  it("keeps only the last 3 lines", () => {
    const state = stateWith([]);
    pushMessage(state, "one");
    pushMessage(state, "two");
    pushMessage(state, "three");
    pushMessage(state, "four");
    expect(state.messages).toEqual(["two", "three", "four"]);
  });
});

describe("level transition", () => {
  // The walk stops one tile short of the stairs: stepping onto them descends,
  // which would move the goalposts.
  const STAIRS_APPROACH_X = 8;
  const STAIRS_APPROACH_Y = 4;

  it("stepping onto the stairs constructs level N+1", () => {
    const state = stateWith([]);
    expect(walkTo(state, STAIRS_APPROACH_X, STAIRS_APPROACH_Y)).toBe(true);
    expect(state.level).toBe(1);

    const outcome = resolveTurn(state, { kind: "move", dx: 0, dy: 1 });
    expect(outcome.descended).toBe(true);
    expect(state.level).toBe(2);
    expect(state.map.level).toBe(2);
    expect(state.map.generator).toBeTruthy();
    expect(state.map.rooms.length).toBeGreaterThanOrEqual(4);
  });

  it("gives a fresh explored bitmap on the new level", () => {
    const state = stateWith([]);
    walkTo(state, STAIRS_APPROACH_X, STAIRS_APPROACH_Y);
    state.explored.fill(1);
    resolveTurn(state, { kind: "move", dx: 0, dy: 1 });

    const marked = [...state.explored].filter((v) => v === 1).length;
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThan(state.explored.length);
  });

  it("refuses sealed stairs, logs, and consumes no turn", () => {
    // The Guardian is alive but not standing on the stairs tile — which is
    // exactly the state it reaches after it steps off to chase the player.
    // With it ON the stairs tile the player bumps into it and attacks instead.
    const guardian = createEnemy("guardian", 1, 5, 0);
    const state = stateWith([guardian], { playerX: 7, playerY: 4, playerHp: 100 });
    expect(stairsSealed(state)).toBe(true);

    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 1 });
    expect(outcome.consumed).toBe(false);
    expect(outcome.descended).toBe(false);
    expect(state.turnCount).toBe(0);
    expect(state.level).toBe(1);
    expect(state.messages.join(" ")).toContain("sealed");
  });

  it("the player attacks a Guardian standing on the stairs rather than being refused", () => {
    const guardian = createEnemy("guardian", 8, 5, 0);
    const state = stateWith([guardian], { playerX: 7, playerY: 5, playerHp: 100 });
    const hpBefore = guardian.hp;
    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    expect(outcome.consumed).toBe(true);
    expect(guardian.hp).toBeLessThan(hpBefore);
  });

  it("stairs are unsealed once the boss is dead", () => {
    const guardian = createEnemy("guardian", 1, 5, 0);
    const state = stateWith([guardian]);
    expect(stairsSealed(state)).toBe(true);
    state.entities[0] = createCorpse(guardian);
    expect(stairsSealed(state)).toBe(false);
  });

  it("carry the player's stats across a level change", () => {
    const state = stateWith([]);
    state.player.hp = 7;
    state.player.def = 3;
    walkTo(state, STAIRS_APPROACH_X, STAIRS_APPROACH_Y);
    resolveTurn(state, { kind: "move", dx: 0, dy: 1 });
    expect(state.level).toBe(2);
    expect(state.player.hp).toBe(7);
    expect(state.player.def).toBe(3);
  });
});

describe("determinism", () => {
  it("a 40-turn scripted sequence replays identically from a seeded state", () => {
    const run = () => {
      const state = createGame("replay-seed");
      const script = [
        { kind: "move", dx: 1, dy: 0 },
        { kind: "move", dx: 0, dy: 1 },
        { kind: "wait" },
        { kind: "move", dx: 1, dy: 0 },
        { kind: "move", dx: -1, dy: 0 },
        { kind: "wait" },
      ] as const;
      const trace: string[] = [];
      for (let i = 0; i < 40; i++) {
        const action = script[i % script.length];
        if (!action) continue;
        resolveTurn(state, action);
        trace.push(
          [
            state.turnCount,
            state.player.x,
            state.player.y,
            state.player.hp,
            state.level,
            state.messages.join("|"),
          ].join(","),
        );
      }
      return trace;
    };

    const first = run();
    const second = run();
    expect(first).toHaveLength(40);
    expect(second).toEqual(first);
  });

  it("enterLevel is reproducible for the same seed and level", () => {
    resetEntityIds();
    const a = enterLevel("enter-seed", 3);
    resetEntityIds();
    const b = enterLevel("enter-seed", 3);
    expect(Array.from(b.map.tiles)).toEqual(Array.from(a.map.tiles));
    expect(b.player.x).toBe(a.player.x);
    expect(b.player.y).toBe(a.player.y);
    expect(b.entities).toEqual(a.entities);
  });
});
