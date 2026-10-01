import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  blocksAi,
  calculateDamage,
  isCorpse,
  isHostile,
  noopAttack,
  resolveAttack,
  rollDamage,
  rollDrop,
  toCorpse,
} from "../src/game/combat.js";
import { createEnemy, createPlayer, resetEntityIds } from "../src/game/entities.js";
import { beginLevelGameplay, getGameplayState, restoreGameplayState } from "../src/game/rng.js";
import { DROPPED_POTION_CHANCE } from "../src/game/config.js";

describe("calculateDamage", () => {
  it("matches the spec table for the player's 4 atk vs 1 def", () => {
    expect(calculateDamage(4, 1, -1)).toBe(2);
    expect(calculateDamage(4, 1, 0)).toBe(3);
    expect(calculateDamage(4, 1, 1)).toBe(4);
  });

  it("the floor holds against heavy armour", () => {
    expect(calculateDamage(2, 10, -1)).toBe(1);
  });

  it("armour can never make you invulnerable", () => {
    expect(calculateDamage(1, 99, -1)).toBe(1);
    expect(calculateDamage(1, 999, 1)).toBe(1);
  });

  it("sweeps every (atk 2-7, def 0-3, roll -1..1) combination in the stat table range", () => {
    for (let atk = 2; atk <= 7; atk++) {
      for (let def = 0; def <= 3; def++) {
        for (const roll of [-1, 0, 1]) {
          const damage = calculateDamage(atk, def, roll);
          expect(damage).toBeGreaterThanOrEqual(1);
          expect(damage).toBeLessThanOrEqual(atk + 1);
        }
      }
    }
  });
});

describe("rollDamage", () => {
  it("only ever produces -1, 0 or +1", () => {
    beginLevelGameplay("combat-roll", 1);
    for (let i = 0; i < 1000; i++) {
      expect([-1, 0, 1]).toContain(rollDamage());
    }
  });

  it("is reproducible from the same gameplay state", () => {
    beginLevelGameplay("combat-repro", 1);
    const first = Array.from({ length: 50 }, () => rollDamage());
    const state = getGameplayState();
    const second = Array.from({ length: 50 }, () => rollDamage());
    restoreGameplayState(state);
    const third = Array.from({ length: 50 }, () => rollDamage());
    expect(second).toEqual(third);
    expect(first).not.toEqual(second);
  });
});

describe("resolveAttack", () => {
  it("returns a no-op result for a bump into a wall, consuming no damage", () => {
    const result = noopAttack();
    expect(result.kind).toBe("noop");
    expect(result.damage).toBe(0);
    expect(result.killed).toBe(false);
    expect(result.targetId).toBeNull();
    expect(result.playerDied).toBe(false);
    expect(result.dropItemId).toBeNull();
  });

  it("reports the damage and does not mutate the defender", () => {
    resetEntityIds();
    beginLevelGameplay("combat-hit", 1);
    const player = createPlayer(1, 1);
    const enemy = createEnemy("rat", 2, 1, 0);
    const hpBefore = enemy.hp;
    const result = resolveAttack(player, enemy);
    expect(result.kind).toBe("hit");
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.targetId).toBe(enemy.id);
    expect(enemy.hp).toBe(hpBefore);
  });

  it("flags player death so the caller can abort the turn", () => {
    resetEntityIds();
    beginLevelGameplay("combat-death", 1);
    const player = createPlayer(1, 1);
    player.hp = 1;
    const enemy = createEnemy("guardian", 2, 1, 0);
    const result = resolveAttack(enemy, player);
    expect(result.killed).toBe(true);
    expect(result.playerDied).toBe(true);
    expect(result.dropItemId).toBeNull();
  });

  it("a survivable hit does not flag player death", () => {
    resetEntityIds();
    beginLevelGameplay("combat-survive", 1);
    const player = createPlayer(1, 1);
    const enemy = createEnemy("rat", 2, 1, 0);
    const result = resolveAttack(enemy, player);
    expect(result.killed).toBe(false);
    expect(result.playerDied).toBe(false);
  });

  it("an enemy death may drop a potion but never a weapon or armour", () => {
    resetEntityIds();
    beginLevelGameplay("combat-drop-kind", 1);
    const player = createPlayer(1, 1);
    const enemy = createEnemy("rat", 2, 1, 0);
    for (let i = 0; i < 500; i++) {
      const result = resolveAttack(player, enemy);
      if (result.dropItemId !== null) {
        expect(result.dropItemId).toBe("potion");
      }
    }
  });
});

describe("death", () => {
  it("zeroes all four stat fields and preserves x, y, glyph and id", () => {
    resetEntityIds();
    const enemy = createEnemy("skeleton", 11, 7, 1);
    const corpse = toCorpse(enemy);
    expect(corpse.kind).toBe("corpse");
    expect(corpse.hp).toBe(0);
    expect(corpse.maxHp).toBe(0);
    expect(corpse.atk).toBe(0);
    expect(corpse.def).toBe(0);
    expect(corpse.x).toBe(11);
    expect(corpse.y).toBe(7);
    expect(corpse.glyph).toBe(enemy.glyph);
    expect(corpse.id).toBe(enemy.id);
    expect(corpse.type).toBe(enemy.type);
  });

  it("a corpse is not hostile and is not passable-by-AI", () => {
    resetEntityIds();
    const corpse = toCorpse(createEnemy("goblin", 3, 3, 0));
    expect(isHostile(corpse)).toBe(false);
    expect(blocksAi(corpse)).toBe(false);
    expect(isCorpse(corpse)).toBe(true);
  });

  it("a living enemy is hostile and blocks the AI", () => {
    resetEntityIds();
    const enemy = createEnemy("rat", 3, 3, 0);
    expect(isHostile(enemy)).toBe(true);
    expect(blocksAi(enemy)).toBe(true);
    const player = createPlayer(3, 3);
    expect(isHostile(player)).toBe(false);
    expect(blocksAi(player)).toBe(true);
  });
});

describe("drop chance", () => {
  it("lands within 1% of 0.35 over 10 000 seeded deaths", () => {
    beginLevelGameplay("drop-distribution", 1);
    const N = 10_000;
    let drops = 0;
    for (let i = 0; i < N; i++) {
      if (rollDrop() !== null) drops++;
    }
    const rate = drops / N;
    expect(Math.abs(rate - DROPPED_POTION_CHANCE)).toBeLessThan(0.01);
  });

  it("never drops a weapon or armour over 10 000 seeded deaths", () => {
    beginLevelGameplay("drop-kind", 1);
    for (let i = 0; i < 10_000; i++) {
      const drop = rollDrop();
      if (drop !== null) expect(drop).toBe("potion");
    }
  });
});

describe("source hygiene", () => {
  it("combat.ts contains no Math.random and no ROT.RNG", () => {
    const source = readFileSync(new URL("../src/game/combat.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/ROT\.RNG/);
  });

  it("the TODO(T10) non-leak marker is present in combat.ts", () => {
    const source = readFileSync(new URL("../src/game/combat.ts", import.meta.url), "utf8");
    expect(source).toContain("TODO(T10)");
    expect(source).toContain("3.3");
  });
});
