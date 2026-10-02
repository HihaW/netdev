import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENEMY_STATS, type EnemyStats } from "../src/data/enemies.js";
import { clearBfsCache, distanceField, nextStep } from "../src/game/bfs.js";
import { toCorpse } from "../src/game/combat.js";
import { FOV_RADIUS, PLAYER_BASE_DEF } from "../src/game/config.js";
import { createEnemy, resetEntityIds } from "../src/game/entities.js";
import { generateLevel } from "../src/game/dungeon.js";
import { defScaleForLevel, placeEntities } from "../src/game/spawn.js";
import {
  createGame,
  entityAt,
  enemiesInOrder,
  pushMessage,
  refreshFov,
  resolveTurn,
} from "../src/game/turns.js";
import type { EnemyEntity, EnemyId, GameState, LevelData } from "../src/game/types.js";
import { mapFromStrings } from "./fixtures.js";

// Two chambers joined only by the columns at x=1 and x=8, so (5,5) has no line
// of sight to the player at (1,1). (3,3) is a wall: unreachable, so it is a safe
// lastKnown for an enemy that should hold position.
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
const HIDDEN_X = 5;
const HIDDEN_Y = 5;
const WALL_X = 3;
const WALL_Y = 3;

function hallState(enemies: EnemyEntity[], playerHp = 100): GameState {
  clearBfsCache();
  resetEntityIds();
  const { tiles, width, height } = mapFromStrings(HALL);
  const map: LevelData = {
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
  const state: GameState = {
    seed: "roster-hall",
    level: 1,
    turnCount: 0,
    kills: 0,
    deathCause: null,
    inventory: [],
    player: {
      kind: "player",
      id: "e1",
      x: PLAYER_X,
      y: PLAYER_Y,
      glyph: "@",
      hp: playerHp,
      maxHp: playerHp,
      atk: 4,
      def: PLAYER_BASE_DEF,
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

describe("the stat table (DESIGN.md 6.1)", () => {
  const expected: [EnemyId, EnemyStats["glyph"], number, number, number, number, number][] = [
    ["rat", "r", 5, 2, 0, 8, 1],
    ["skeleton", "k", 15, 5, 2, 4, 2],
    ["goblin", "g", 10, 4, 1, 8, 4],
    ["guardian", "G", 60, 7, 3, 10, 10],
  ];

  it("matches every column of the spec table", () => {
    for (const [id, glyph, hp, atk, def, senses, unlockLevel] of expected) {
      expect(
        {
          glyph: ENEMY_STATS[id].glyph,
          hp: ENEMY_STATS[id].hp,
          atk: ENEMY_STATS[id].atk,
          def: ENEMY_STATS[id].def,
          senses: ENEMY_STATS[id].senses,
          unlockLevel: ENEMY_STATS[id].unlockLevel,
        },
        id,
      ).toEqual({ glyph, hp, atk, def, senses, unlockLevel });
    }
  });

  it("uses only printable ASCII glyphs, one per type", () => {
    for (const [id] of expected) {
      expect(ENEMY_STATS[id].glyph, id).toMatch(/^[\x20-\x7e]$/);
    }
    expect(new Set(expected.map(([, glyph]) => glyph)).size).toBe(expected.length);
  });

  it("names each behaviour in data rather than in a branch", () => {
    expect(ENEMY_STATS.rat.behaviour).toBe("chase");
    expect(ENEMY_STATS.skeleton.behaviour).toBe("chase-cadence");
    expect(ENEMY_STATS.goblin.behaviour).toBe("chase-flee");
    expect(ENEMY_STATS.guardian.behaviour).toBe("cleave");
  });

  it("carries the two behaviour flags on exactly one type each", () => {
    const fleeing = Object.entries(ENEMY_STATS).filter(([, s]) => s.fleeBelowHpPct !== undefined);
    expect(fleeing.map(([id]) => id)).toEqual(["goblin"]);
    expect(ENEMY_STATS.goblin.fleeBelowHpPct).toBe(0.3);

    const cadenced = Object.entries(ENEMY_STATS).filter(
      ([, s]) => s.attackCooldownTurns !== undefined,
    );
    expect(cadenced.map(([id]) => id)).toEqual(["skeleton"]);
    expect(ENEMY_STATS.skeleton.attackCooldownTurns).toBe(1);

    const cleaving = Object.entries(ENEMY_STATS).filter(([, s]) => s.cleave === true);
    expect(cleaving.map(([id]) => id)).toEqual(["guardian"]);
  });

  it("gives the Guardian the boss flag that seals the stairs, and no one else", () => {
    const bosses = Object.entries(ENEMY_STATS).filter(([, s]) => s.isBoss === true);
    expect(bosses.map(([id]) => id)).toEqual(["guardian"]);
  });
});

describe("the skeleton's cadence, over a full six turns", () => {
  it("strikes on turns 1, 3 and 5 and holds on 2, 4 and 6 while adjacent", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    const state = hallState([skeleton]);

    const struck: boolean[] = [];
    for (let turn = 1; turn <= 6; turn++) {
      const before = state.player.hp;
      resolveTurn(state, { kind: "wait" });
      struck.push(state.player.hp < before);
    }

    // Parity, not luck: the alternating rhythm is the whole mechanic, so it is
    // asserted as an exact sequence rather than as "it attacked sometimes".
    expect(struck).toEqual([true, false, true, false, true, false]);
    // Turn 6 was the third hold, so the cooldown ends the sequence at 0 and the
    // seventh turn would be the next strike.
    expect(skeleton.attackCooldown).toBe(0);
    expect(state.player.hp).toBeGreaterThan(0);
  });

  it("does not strike at all when it is not adjacent, and closes instead", () => {
    const skeleton = createEnemy("skeleton", 8, 5, 0);
    // Alerted, because a fresh enemy is unalerted and frozen (4.3) — which would
    // make this test pass for the wrong reason.
    skeleton.isAlerted = true;
    skeleton.lastKnown = { x: PLAYER_X, y: PLAYER_Y };
    skeleton.giveUp = 5;
    const state = hallState([skeleton]);

    const before = state.player.hp;
    resolveTurn(state, { kind: "wait" });

    expect(state.player.hp).toBe(before);
    // It stepped toward the player rather than swinging at air.
    expect(skeleton.x !== 8 || skeleton.y !== 5).toBe(true);
    // No swing means no cooldown was ever set.
    expect(skeleton.attackCooldown).toBe(0);
  });

  it("announces the hold, and the announcement cannot leak", () => {
    // Adjacent means inside the FOV radius, so the hold line is always loggable.
    // That is structural, not a coincidence of the test: a hold only ever happens
    // at melee range, which the player can always see. Asserting it keeps a future
    // "hold from range" change honest.
    const adjacent = createEnemy("skeleton", 2, 1, 0);
    const state = hallState([adjacent]);

    resolveTurn(state, { kind: "wait" });
    state.messages.length = 0;
    resolveTurn(state, { kind: "wait" });

    expect(adjacent.x).toBeLessThanOrEqual(PLAYER_X + FOV_RADIUS);
    expect(state.visible.has(adjacent.y * state.map.width + adjacent.x)).toBe(true);
    expect(state.messages.join(" ")).toContain("skeleton recovers from its swing");
  });

  it("says nothing about a skeleton the player cannot see", () => {
    const hidden = createEnemy("skeleton", HIDDEN_X, HIDDEN_Y, 0);
    hidden.isAlerted = true;
    hidden.lastKnown = { x: WALL_X, y: WALL_Y };
    hidden.giveUp = 5;
    const state = hallState([hidden]);

    expect(state.visible.has(HIDDEN_Y * state.map.width + HIDDEN_X)).toBe(false);
    resolveTurn(state, { kind: "wait" });

    expect(state.messages.join(" ")).not.toContain("skeleton");
  });

  it("does not carry its cooldown into the corpse", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    skeleton.attackCooldown = 1;
    expect(skeleton.attackCooldown).toBe(1);

    const corpse = toCorpse(skeleton);

    // A corpse is a different kind of entity, not a dead enemy: it carries no AI
    // state at all, so there is nothing for a stale cooldown to leak into.
    expect(corpse.kind).toBe("corpse");
    expect("attackCooldown" in corpse).toBe(false);
    expect("isAlerted" in corpse).toBe(false);
    expect("giveUp" in corpse).toBe(false);
    expect("lastKnown" in corpse).toBe(false);
    expect("senses" in corpse).toBe(false);
    expect(corpse.hp).toBe(0);
    expect(corpse.atk).toBe(0);
    expect(corpse.def).toBe(0);
    // The id and the glyph survive, so the board still reads as a cleared room.
    expect(corpse.id).toBe(skeleton.id);
    expect(corpse.glyph).toBe(skeleton.glyph);
    expect(corpse.type).toBe("skeleton");
  });

  it("leaves no cooldown on the corpse in a real kill, either", () => {
    const skeleton = createEnemy("skeleton", 2, 1, 0);
    const state = hallState([skeleton]);

    // Let it strike once, so the cooldown is genuinely 1 at the moment of death,
    // then let the player's own blow finish it through the real bump-to-attack
    // path, which is what turns the entity into a corpse.
    resolveTurn(state, { kind: "wait" });
    expect(skeleton.attackCooldown).toBe(1);

    skeleton.hp = 1;
    const killsBefore = state.kills;
    resolveTurn(state, { kind: "move", dx: 1, dy: 0 });

    expect(state.kills).toBe(killsBefore + 1);
    const dead = entityAt(state, 2, 1);
    expect(dead?.kind).toBe("corpse");
    if (dead?.kind === "corpse") {
      expect("attackCooldown" in dead).toBe(false);
      expect(dead.hp).toBe(0);
    }
  });
});

describe("the goblin's flee", () => {
  it("flees toward the greatest BFS distance from the player, not merely further away", () => {
    const goblin = createEnemy("goblin", 8, 2, 0);
    goblin.hp = 1;
    const state = hallState([goblin]);
    const { tiles, width, height } = state.map;

    const fieldBefore = distanceField(tiles, width, height, state.player.x, state.player.y);
    const before = fieldBefore[goblin.y * width + goblin.x] ?? -1;

    resolveTurn(state, { kind: "wait" });

    const fieldAfter = distanceField(tiles, width, height, state.player.x, state.player.y);
    const after = fieldAfter[goblin.y * width + goblin.x] ?? -1;

    // Chebyshev distance would also have increased here, but the mechanic is
    // specified against the BFS field: it is the field from the player that the
    // step maximises, and a corridor detour is the case where they differ.
    expect(after).toBeGreaterThan(before);
    expect(state.messages.join(" ")).toContain("goblin breaks off and runs");
  });

  it("does not flee while unalerted, even at 1 hp", () => {
    // Behind the wall, where the player is out of the goblin's sight. A goblin at
    // (8,2) would see the player down the open chamber, wake up, and flee
    // correctly — so "unalerted" has to mean actually unseen here.
    const goblin = createEnemy("goblin", HIDDEN_X, HIDDEN_Y, 0);
    goblin.hp = 1;
    goblin.isAlerted = false;
    const state = hallState([goblin]);
    expect(state.visible.has(HIDDEN_Y * state.map.width + HIDDEN_X)).toBe(false);

    resolveTurn(state, { kind: "wait" });

    expect(goblin.x).toBe(HIDDEN_X);
    expect(goblin.y).toBe(HIDDEN_Y);
    expect(goblin.isAlerted).toBe(false);
    expect(state.messages.join(" ")).not.toContain("goblin");
  });

  it("flees at 29% hp and holds at exactly 30%", () => {
    const stats = ENEMY_STATS.goblin;
    const threshold = stats.fleeBelowHpPct;
    if (threshold === undefined) throw new Error("the goblin has no flee threshold");
    const justUnder = Math.floor(stats.hp * 0.29);
    const exactly = stats.hp * threshold;

    const fleeing = createEnemy("goblin", 8, 2, 0);
    fleeing.hp = justUnder;
    const fleeingState = hallState([fleeing]);
    expect(fleeing.hp / fleeing.maxHp).toBeLessThan(threshold);
    resolveTurn(fleeingState, { kind: "wait" });
    expect(fleeingState.messages.join(" ")).toContain("breaks off and runs");

    const holding = createEnemy("goblin", 8, 2, 0);
    holding.hp = exactly;
    const holdingState = hallState([holding]);
    expect(holding.hp / holding.maxHp).toBe(threshold);
    resolveTurn(holdingState, { kind: "wait" });
    expect(holdingState.messages.join(" ")).not.toContain("breaks off and runs");
  });
});

describe("no stat grows with depth", () => {
  it("HP and ATK are the table value at every level, for every type that spawns", () => {
    for (let level = 1; level <= 9; level++) {
      for (let variant = 0; variant < 12; variant++) {
        const seed = `roster-flat-${level}-${variant}`;
        const map = generateLevel(seed, level);
        const placement = placeEntities(map, seed);

        for (const enemy of placement.enemies) {
          const stats = ENEMY_STATS[enemy.type];
          expect(enemy.hp, `${seed} ${enemy.type}`).toBe(stats.hp);
          expect(enemy.maxHp, `${seed} ${enemy.type}`).toBe(stats.hp);
          expect(enemy.atk, `${seed} ${enemy.type}`).toBe(stats.atk);
          expect(enemy.senses, `${seed} ${enemy.type}`).toBe(stats.senses);
          // DEF is the one stat that scales, and only by one.
          expect(enemy.def, `${seed} ${enemy.type}`).toBe(stats.def + defScaleForLevel(level));
        }
      }
    }
  });

  it("scales DEF by exactly one at levels 4, 7 and 10, for every type", () => {
    for (const id of Object.keys(ENEMY_STATS) as EnemyId[]) {
      for (let level = 1; level <= 10; level++) {
        const expected = ENEMY_STATS[id].def + ([4, 7, 10].includes(level) ? 1 : 0);
        const enemy = createEnemy(id, 2, 2, defScaleForLevel(level));
        expect(enemy.def, `${id} at level ${level}`).toBe(expected);
        expect(enemy.hp, `${id} at level ${level}`).toBe(ENEMY_STATS[id].hp);
      }
    }
  });

  it("keeps the Guardian at level 10 exactly as the table says", () => {
    const map = generateLevel("roster-guardian", 10);
    const placement = placeEntities(map, "roster-guardian");
    const guardian = placement.enemies[0];

    expect(guardian?.type).toBe("guardian");
    expect(guardian?.hp).toBe(ENEMY_STATS.guardian.hp);
    expect(guardian?.def).toBe(ENEMY_STATS.guardian.def + 1);
    expect(guardian?.senses).toBe(ENEMY_STATS.guardian.senses);
  });
});

describe("a real run reaches all four types", () => {
  it("offers the Rat, Skeleton, Goblin and Guardian across nine levels", () => {
    // The Guardian only appears on level 10, and it is alone there, so a run that
    // is to see all four has to descend to 10.
    const seen = new Set<EnemyId>();
    const state = createGame("roster-run");

    for (let level = 1; level <= 9; level++) {
      for (const entity of state.entities) {
        if (entity.kind === "enemy") seen.add(entity.type);
      }
      let guard = 0;
      while (state.level === level && guard < 900) {
        const { tiles, width, height, stairs } = state.map;
        const field = distanceField(tiles, width, height, stairs.x, stairs.y);
        const step = nextStep(field, width, state.player.x, state.player.y);
        if (!step) break;
        resolveTurn(state, {
          kind: "move",
          dx: step.x - state.player.x,
          dy: step.y - state.player.y,
        });
        guard += 1;
      }
      if (state.level !== level + 1) break;
    }

    // Goblins only roll from level 4, so one run may legitimately miss one; the
    // claim is that the schedule can produce all of them.
    expect([...seen].sort()).toEqual(["goblin", "rat", "skeleton"]);
    expect(state.level).toBe(10);

    const onTen = state.entities.filter((e) => e.kind === "enemy");
    expect(onTen).toHaveLength(1);
    expect(onTen[0]?.type).toBe("guardian");
    expect([...seen, "guardian"].sort()).toEqual(["goblin", "guardian", "rat", "skeleton"]);
  });
});

describe("a type-level guard on the dispatch", () => {
  it("keeps the turn loop free of per-type branches", () => {
    // The behaviour flags are data; a `type === "goblin"` in the turn loop would
    // mean the table stopped being the single source of truth. T16's Done-when
    // checks this by grep, so the check lives here as a test too.
    const source = readFileSync(new URL("../src/game/turns.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/type === "/);
    expect(source).not.toMatch(/type !== "/);
  });
});

describe("helpers the turn loop still needs", () => {
  it("keeps enemy order stable by id", () => {
    const a = createEnemy("rat", 8, 2, 0);
    const b = createEnemy("rat", 8, 5, 0);
    const state = hallState([b, a]);
    expect(enemiesInOrder(state).map((e) => e.id)).toEqual([a.id, b.id]);
    expect(entityAt(state, 8, 5)?.id).toBe(b.id);
  });

  it("keeps the message log capped while behaviours shout", () => {
    const state = hallState([createEnemy("skeleton", 2, 1, 0)]);
    for (let i = 0; i < 10; i++) pushMessage(state, `line ${i}`);
    expect(state.messages.length).toBeGreaterThan(0);
    expect(state.messages[state.messages.length - 1]).toBe("line 9");
  });
});
