import { describe, expect, it } from "vitest";
import { ENEMY_STATS } from "../src/data/enemies.js";
import {
  DEF_SCALE_LEVELS,
  DROPPED_POTION_CHANCE,
  FINAL_LEVEL,
  GIVE_UP_TURNS,
  GUARDIAN_LEVEL,
  MAX_ENEMIES_CAP,
  MIN_SPAWN_DISTANCE,
} from "../src/game/config.js";
import { generateLevel } from "../src/game/dungeon.js";
import { createEnemy } from "../src/game/entities.js";
import {
  defScaleForLevel,
  enemyCountForLevel,
  placeEntities,
  unlockedTypes,
} from "../src/game/spawn.js";
import type { EnemyId } from "../src/game/types.js";

describe("enemy count (DESIGN.md 6.3)", () => {
  it("matches the specified curve at the levels the spec names", () => {
    expect(enemyCountForLevel(1)).toBe(3);
    expect(enemyCountForLevel(2)).toBe(4);
    expect(enemyCountForLevel(5)).toBe(7);
    expect(enemyCountForLevel(9)).toBe(10);
  });

  it("is monotonically non-decreasing across levels 1 to 9", () => {
    let previous = 0;
    for (let level = 1; level <= 9; level++) {
      const count = enemyCountForLevel(level);
      expect(count, `level ${level}`).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("never exceeds the cap, and reaches it", () => {
    for (let level = 1; level <= 20; level++) {
      expect(enemyCountForLevel(level), `level ${level}`).toBeLessThanOrEqual(MAX_ENEMIES_CAP);
    }
    expect(enemyCountForLevel(9)).toBe(MAX_ENEMIES_CAP);
  });

  it("is 0 on the final level, because the Guardian spawns alone", () => {
    expect(GUARDIAN_LEVEL).toBe(FINAL_LEVEL);
    expect(enemyCountForLevel(FINAL_LEVEL)).toBe(0);
    // And stays 0 past it, rather than resuming the curve.
    expect(enemyCountForLevel(FINAL_LEVEL + 1)).toBe(0);
  });

  it("is derived from the config values, not from a literal", () => {
    for (let level = 1; level <= 9; level++) {
      const expected = Math.min(MAX_ENEMIES_CAP, 3 + Math.floor(level * 0.8));
      expect(enemyCountForLevel(level), `level ${level}`).toBe(expected);
    }
  });
});

describe("DEF scaling", () => {
  it("is 1 at levels 4, 7 and 10 and 0 everywhere else", () => {
    expect([...DEF_SCALE_LEVELS]).toEqual([4, 7, 10]);
    for (let level = 1; level <= 10; level++) {
      const expected = [4, 7, 10].includes(level) ? 1 : 0;
      expect(defScaleForLevel(level), `level ${level}`).toBe(expected);
    }
  });

  it("adds DEF and changes nothing else, for every type", () => {
    for (const id of Object.keys(ENEMY_STATS) as EnemyId[]) {
      for (let level = 1; level <= 10; level++) {
        const plain = createEnemy(id, 2, 2, 0);
        const scaled = createEnemy(id, 2, 2, defScaleForLevel(level));

        expect(scaled.def - plain.def, `${id} at ${level}`).toBe(defScaleForLevel(level));
        expect(scaled.hp, `${id} at ${level}`).toBe(plain.hp);
        expect(scaled.maxHp, `${id} at ${level}`).toBe(plain.maxHp);
        expect(scaled.atk, `${id} at ${level}`).toBe(plain.atk);
        expect(scaled.senses, `${id} at ${level}`).toBe(plain.senses);
      }
    }
  });

  it("never grows HP or ATK with depth, at any level", () => {
    for (const id of Object.keys(ENEMY_STATS) as EnemyId[]) {
      const first = createEnemy(id, 2, 2, defScaleForLevel(1));
      for (let level = 1; level <= 10; level++) {
        const enemy = createEnemy(id, 2, 2, defScaleForLevel(level));
        expect(enemy.hp, `${id} level ${level}`).toBe(ENEMY_STATS[id].hp);
        expect(enemy.atk, `${id} level ${level}`).toBe(ENEMY_STATS[id].atk);
      }
      expect(first.hp).toBe(ENEMY_STATS[id].hp);
    }
  });
});

describe("the unlock schedule", () => {
  it("is exactly the specified sets at the levels the spec names", () => {
    expect(unlockedTypes(1)).toEqual(["rat"]);
    expect(unlockedTypes(2)).toEqual(["rat", "skeleton"]);
    expect(unlockedTypes(4)).toEqual(["rat", "skeleton", "goblin"]);
  });

  it("never offers a type before its unlock level", () => {
    for (const id of Object.keys(ENEMY_STATS) as EnemyId[]) {
      const unlock = ENEMY_STATS[id].unlockLevel;
      for (let level = 1; level < unlock; level++) {
        expect(unlockedTypes(level), `${id} at level ${level}`).not.toContain(id);
      }
      expect(unlockedTypes(unlock), `${id} at level ${unlock}`).toContain(id);
    }
  });

  it("keeps the Guardian out of every level below 10", () => {
    for (let level = 1; level < GUARDIAN_LEVEL; level++) {
      expect(unlockedTypes(level), `level ${level}`).not.toContain("guardian");
    }
    expect(unlockedTypes(GUARDIAN_LEVEL)).toContain("guardian");
  });

  it("spawns only unlocked types, on every level, over many seeds", () => {
    for (let level = 1; level <= 9; level++) {
      const allowed = unlockedTypes(level);
      for (let variant = 0; variant < 20; variant++) {
        const seed = `curve-unlock-${level}-${variant}`;
        const map = generateLevel(seed, level);
        const placement = placeEntities(map, seed);
        for (const enemy of placement.enemies) {
          expect(allowed, `${seed} spawned a ${enemy.type}`).toContain(enemy.type);
        }
      }
    }
  });
});

describe("the spawn rules", () => {
  it("keeps every enemy at least the minimum distance from the player", () => {
    for (let level = 1; level <= 9; level++) {
      for (let variant = 0; variant < 10; variant++) {
        const seed = `curve-distance-${level}-${variant}`;
        const map = generateLevel(seed, level);
        const placement = placeEntities(map, seed);
        for (const enemy of placement.enemies) {
          const chebyshev = Math.max(
            Math.abs(enemy.x - map.spawn.x),
            Math.abs(enemy.y - map.spawn.y),
          );
          expect(chebyshev, `${seed} ${enemy.type}`).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
        }
      }
    }
  });

  it("never lets two entities share a tile, across ten levels for twenty seeds", () => {
    for (let variant = 0; variant < 20; variant++) {
      const seed = `curve-occupancy-${variant}`;
      let level = 1;
      while (level <= 10) {
        const map = generateLevel(seed, level);
        const placement = placeEntities(map, seed);
        const occupied = new Set<number>();
        for (const entity of [...placement.enemies, ...placement.items]) {
          const index = entity.y * map.width + entity.x;
          expect(occupied.has(index), `${seed} level ${level} shared a tile`).toBe(false);
          occupied.add(index);
        }
        level += 1;
      }
    }
  });

  it("places nothing at all on the final level but the Guardian", () => {
    for (let variant = 0; variant < 10; variant++) {
      const seed = `curve-final-${variant}`;
      const map = generateLevel(seed, FINAL_LEVEL);
      const placement = placeEntities(map, seed);

      expect(placement.items, seed).toHaveLength(0);
      expect(placement.enemies, seed).toHaveLength(1);
      expect(placement.enemies[0]?.type, seed).toBe("guardian");
      // And it is on the stairs, which is what seals them.
      expect(placement.enemies[0]?.x, seed).toBe(map.stairs.x);
      expect(placement.enemies[0]?.y, seed).toBe(map.stairs.y);
    }
  });
});

describe("the uniform draw over unlocked types", () => {
  // Guards against a weighting bug that would otherwise look like tuning: if the
  // empirical split drifts far from uniform, something is weighting the draw, and
  // the fix belongs in the table rather than in a number someone bumped.
  it("lands within 10% of the uniform expectation at every level", () => {
    for (let level = 1; level <= 9; level++) {
      const allowed = unlockedTypes(level);
      if (allowed.length < 2) continue;

      const counts = new Map<EnemyId, number>(allowed.map((id) => [id, 0]));
      const seeds = 200;

      for (let variant = 0; variant < seeds; variant++) {
        const seed = `curve-weights-${level}-${variant}`;
        const map = generateLevel(seed, level);
        for (const enemy of placeEntities(map, seed).enemies) {
          counts.set(enemy.type, (counts.get(enemy.type) ?? 0) + 1);
        }
      }

      const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
      expect(total, `level ${level} drew nothing`).toBeGreaterThan(0);

      const expectedShare = 1 / allowed.length;
      for (const [id, count] of counts) {
        const share = count / total;
        expect(
          Math.abs(share - expectedShare),
          `level ${level}: ${id} drew ${(share * 100).toFixed(1)}% of ${total}, expected ${(
            expectedShare * 100
          ).toFixed(1)}%`,
        ).toBeLessThanOrEqual(0.1);
      }
    }
    // 200 seeds across every level that offers a choice is 1400 dungeon
    // generations. Worth the seconds: a weighting bug here would look exactly
    // like deliberate tuning.
  }, 60_000);
});

describe("the rest of the curve, from config", () => {
  it("holds the values the spec names", () => {
    expect(GIVE_UP_TURNS).toBe(6);
    expect(DROPPED_POTION_CHANCE).toBe(0.35);
    expect(MIN_SPAWN_DISTANCE).toBe(5);
    expect(FINAL_LEVEL).toBe(10);
    expect(MAX_ENEMIES_CAP).toBe(10);
  });
});
