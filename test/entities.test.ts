import { describe, expect, it } from "vitest";
import { ENEMY_STATS } from "../src/data/enemies.js";
import { ITEMS } from "../src/data/items.js";
import {
  createCorpse,
  createEnemy,
  createItem,
  createPlayer,
  resetEntityIds,
} from "../src/game/entities.js";
import {
  DEF_SCALE_LEVELS,
  PLAYER_BASE_ATK,
  PLAYER_BASE_DEF,
  PLAYER_BASE_HP,
} from "../src/game/config.js";
import type { EnemyId, ItemEntity, ItemId } from "../src/game/types.js";

const ENEMY_IDS = ["rat", "skeleton", "goblin", "guardian"] as const;
const ITEM_IDS = ["potion", "weapon_1", "weapon_2", "weapon_3", "armor_1", "armor_2"] as const;

describe("ids", () => {
  it("are unique and strictly increasing within a run", () => {
    resetEntityIds();
    const ids = [
      createPlayer(1, 1).id,
      createEnemy("rat", 2, 2, 0).id,
      createEnemy("rat", 3, 3, 0).id,
      createItem("potion", 4, 4).id,
      createItem("weapon_1", 5, 5).id,
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const numbers = ids.map((id) => Number(id.slice(1)));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1] ?? 0);
    }
  });

  it("reset when a run restarts", () => {
    resetEntityIds();
    const first = createEnemy("rat", 1, 1, 0).id;
    createEnemy("rat", 2, 2, 0);
    createEnemy("rat", 3, 3, 0);
    resetEntityIds();
    expect(createEnemy("rat", 1, 1, 0).id).toBe(first);
  });
});

describe("createPlayer", () => {
  it("gives exactly hp 20, atk 4, def 1", () => {
    resetEntityIds();
    const player = createPlayer(7, 9);
    expect(player.hp).toBe(20);
    expect(player.maxHp).toBe(20);
    expect(player.atk).toBe(4);
    expect(player.def).toBe(1);
    expect(player.x).toBe(7);
    expect(player.y).toBe(9);
    expect(player.kind).toBe("player");
    expect(player.glyph).toBe("@");
  });

  it("matches the config values", () => {
    expect(PLAYER_BASE_HP).toBe(20);
    expect(PLAYER_BASE_ATK).toBe(4);
    expect(PLAYER_BASE_DEF).toBe(1);
  });
});

describe("createEnemy", () => {
  it.each(ENEMY_IDS)("%s produces the exact stat block from DESIGN.md 6.1", (id) => {
    resetEntityIds();
    const stats = ENEMY_STATS[id];
    const enemy = createEnemy(id, 5, 6, 0);
    expect(enemy.kind).toBe("enemy");
    expect(enemy.type).toBe(id);
    expect(enemy.glyph).toBe(stats.glyph);
    expect(enemy.hp).toBe(stats.hp);
    expect(enemy.maxHp).toBe(stats.hp);
    expect(enemy.atk).toBe(stats.atk);
    expect(enemy.def).toBe(stats.def);
    expect(enemy.senses).toBe(stats.senses);
    expect(enemy.x).toBe(5);
    expect(enemy.y).toBe(6);
  });

  it("starts unalerted with no last-known position", () => {
    resetEntityIds();
    const enemy = createEnemy("rat", 5, 6, 0);
    expect(enemy.isAlerted).toBe(false);
    expect(enemy.lastKnown).toBeNull();
    expect(enemy.giveUp).toBe(0);
    expect(enemy.attackCooldown).toBe(0);
  });

  it("defScale adds exactly 1 DEF and leaves HP/ATK untouched", () => {
    resetEntityIds();
    const base = createEnemy("skeleton", 1, 1, 0);
    const scaled = createEnemy("skeleton", 1, 1, 1);
    expect(scaled.def).toBe(base.def + 1);
    expect(scaled.hp).toBe(base.hp);
    expect(scaled.maxHp).toBe(base.maxHp);
    expect(scaled.atk).toBe(base.atk);
  });

  it("the DEF scale levels are 4, 7 and 10", () => {
    expect([...DEF_SCALE_LEVELS]).toEqual([4, 7, 10]);
  });
});

describe("createCorpse", () => {
  it("zeroes every stat, preserves glyph and position, and is not hostile", () => {
    resetEntityIds();
    const enemy = createEnemy("goblin", 12, 4, 1);
    const corpse = createCorpse(enemy);
    expect(corpse.kind).toBe("corpse");
    expect(corpse.hp).toBe(0);
    expect(corpse.maxHp).toBe(0);
    expect(corpse.atk).toBe(0);
    expect(corpse.def).toBe(0);
    expect(corpse.glyph).toBe(enemy.glyph);
    expect(corpse.x).toBe(enemy.x);
    expect(corpse.y).toBe(enemy.y);
    expect(corpse.id).toBe(enemy.id);
    expect(corpse.type).toBe(enemy.type);
  });
});

describe("createItem", () => {
  it.each(ITEM_IDS)("%s produces the exact item definition", (id) => {
    resetEntityIds();
    const def = ITEMS[id];
    const item = createItem(id, 3, 8);
    expect(item.kind).toBe("item");
    expect(item.itemId).toBe(id);
    expect(item.glyph).toBe(def.glyph);
    expect(item.x).toBe(3);
    expect(item.y).toBe(8);
    expect(item.stack).toBe(1);
  });

  it("defaults stack to 1 and accepts an explicit stack", () => {
    resetEntityIds();
    expect(createItem("potion", 1, 1).stack).toBe(1);
    expect(createItem("potion", 1, 1, 3).stack).toBe(3);
  });

  it("only potions are stackable", () => {
    resetEntityIds();
    expect(ITEMS.potion.stackable).toBe(true);
    for (const id of ITEM_IDS.filter((i) => i !== "potion")) {
      expect(ITEMS[id].stackable).toBe(false);
    }
  });
});

describe("stat table coverage", () => {
  it("every EnemyId key in the stat table has a case", () => {
    expect(Object.keys(ENEMY_STATS).sort()).toEqual([...ENEMY_IDS].sort());
  });

  it("every ItemId key in the roster has a case", () => {
    expect(Object.keys(ITEMS).sort()).toEqual([...ITEM_IDS].sort());
  });

  it("no stat table entry drifts from DESIGN.md 6.1 / 7.1", () => {
    expect(ENEMY_STATS.rat).toMatchObject({ hp: 5, atk: 2, def: 0, senses: 8, unlockLevel: 1 });
    expect(ENEMY_STATS.skeleton).toMatchObject({
      hp: 15,
      atk: 5,
      def: 2,
      senses: 4,
      unlockLevel: 2,
    });
    expect(ENEMY_STATS.goblin).toMatchObject({
      hp: 10,
      atk: 4,
      def: 1,
      senses: 8,
      unlockLevel: 4,
    });
    expect(ENEMY_STATS.guardian).toMatchObject({
      hp: 60,
      atk: 7,
      def: 3,
      senses: 10,
      unlockLevel: 10,
    });
    expect(ITEMS.potion.glyph).toBe("!");
    expect(ITEMS.weapon_1).toMatchObject({ atkBonus: 1, defBonus: 0 });
    expect(ITEMS.weapon_2).toMatchObject({ atkBonus: 2, defBonus: 0 });
    expect(ITEMS.weapon_3).toMatchObject({ atkBonus: 3, defBonus: 0 });
    expect(ITEMS.armor_1).toMatchObject({ atkBonus: 0, defBonus: 1 });
    expect(ITEMS.armor_2).toMatchObject({ atkBonus: 0, defBonus: 2 });
  });
});

describe("type-level", () => {
  it("the union rejects an enemy-only field on an item entity", () => {
    const bad: ItemEntity = {
      kind: "item",
      id: "e1",
      x: 0,
      y: 0,
      glyph: "!",
      hp: 0,
      maxHp: 0,
      atk: 0,
      def: 0,
      itemId: "potion",
      stack: 1,
      // @ts-expect-error isAlerted exists only on EnemyEntity
      isAlerted: false,
    };
    expect(bad.kind).toBe("item");
  });

  it("EnemyId and ItemId are closed unions", () => {
    const enemy: EnemyId = "guardian";
    const item: ItemId = "armor_2";
    expect(ENEMY_STATS[enemy].name).toBe("Guardian");
    expect(ITEMS[item].name).toBe("Chain Mail");
  });
});
