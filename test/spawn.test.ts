import { describe, expect, it } from "vitest";
import { generateLevel } from "../src/game/dungeon.js";
import {
  armorTierForLevel,
  defScaleForLevel,
  enemyCountForLevel,
  placeEntities,
  weaponTierForLevel,
  type Placement,
} from "../src/game/spawn.js";
import { resetEntityIds } from "../src/game/entities.js";
import { ITEM_WEIGHT_BANDS } from "../src/data/items.js";
import { GUARDIAN_LEVEL, ITEM_COUNT_DIVISOR, MIN_SPAWN_DISTANCE } from "../src/game/config.js";
import { Tile } from "../src/game/types.js";
import type { LevelData } from "../src/game/types.js";

function placed(seed: string, level: number): { level: LevelData; placement: Placement } {
  resetEntityIds();
  const data = generateLevel(seed, level);
  return { level: data, placement: placeEntities(data, seed) };
}

function occupiedIndices(level: LevelData, p: Placement): number[] {
  return [
    p.player.y * level.width + p.player.x,
    ...p.enemies.map((e) => e.y * level.width + e.x),
    ...p.items.map((i) => i.y * level.width + i.x),
  ];
}

function isPassableTile(level: LevelData, x: number, y: number): boolean {
  const t = level.tiles[y * level.width + x];
  return t === Tile.Floor || t === Tile.Door;
}

describe("placeEntities", () => {
  it("is deterministic: 100 (seed, level) pairs placed twice are identical", () => {
    for (let i = 0; i < 100; i++) {
      const level = 1 + (i % 9);
      const seed = `spawn-${i}`;
      const a = placed(seed, level);
      const b = placed(seed, level);
      expect(b.placement.enemies).toEqual(a.placement.enemies);
      expect(b.placement.items).toEqual(a.placement.items);
      expect(b.placement.player).toEqual(a.placement.player);
    }
  });

  it("places the player at the level spawn tile", () => {
    const { level, placement } = placed("p-1", 3);
    expect(placement.player.x).toBe(level.spawn.x);
    expect(placement.player.y).toBe(level.spawn.y);
  });

  it("level 1 produces exactly 3 enemies; level 9 exactly 10", () => {
    expect(enemyCountForLevel(1)).toBe(3);
    expect(enemyCountForLevel(9)).toBe(10);
    expect(placed("c-1", 1).placement.enemies).toHaveLength(3);
    expect(placed("c-9", 9).placement.enemies).toHaveLength(10);
  });

  it("no level 1-9 enemy spawns a Goblin before level 4", () => {
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < 25; i++) {
        const { placement } = placed(`g-${level}-${i}`, level);
        for (const enemy of placement.enemies) {
          expect(enemy.type).not.toBe("goblin");
        }
      }
    }
  });

  it("level 1 spawns only Rats", () => {
    // DESIGN.md 6.1: Rat unlocks at L1, Skeleton at L2, Goblin at L4. The T08
    // checklist says "level 3 spawns no Skeleton", which contradicts that; the
    // spec wins, so level 3 does spawn Skeletons.
    for (let i = 0; i < 25; i++) {
      const { placement } = placed(`r1-${i}`, 1);
      for (const enemy of placement.enemies) {
        expect(enemy.type).toBe("rat");
      }
    }
  });

  it("level 3 spawns Rats and Skeletons but never Goblins", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const enemy of placed(`s3-${i}`, 3).placement.enemies) {
        expect(enemy.type).not.toBe("goblin");
        seen.add(enemy.type);
      }
    }
    expect([...seen].sort()).toEqual(["rat", "skeleton"]);
  });

  it("level 10 produces exactly one entity, the Guardian, at the stairs", () => {
    const { level, placement } = placed("boss", GUARDIAN_LEVEL);
    expect(placement.enemies).toHaveLength(1);
    expect(placement.enemies[0]?.type).toBe("guardian");
    expect(placement.enemies[0]?.x).toBe(level.stairs.x);
    expect(placement.enemies[0]?.y).toBe(level.stairs.y);
    expect(placement.items).toHaveLength(0);
  });

  it("places no items on level 10", () => {
    expect(placed("boss-2", GUARDIAN_LEVEL).placement.items).toHaveLength(0);
  });

  it("no enemy is within Chebyshev distance 5 of the player spawn", () => {
    for (let i = 0; i < 100; i++) {
      const level = 1 + (i % 9);
      const { level: data, placement } = placed(`d-${i}`, level);
      for (const enemy of placement.enemies) {
        const distance = Math.max(
          Math.abs(enemy.x - data.spawn.x),
          Math.abs(enemy.y - data.spawn.y),
        );
        expect(distance).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
      }
    }
  });

  it("no two entities share a tile on 200 random levels", () => {
    for (let i = 0; i < 200; i++) {
      const level = 1 + (i % 9);
      const { level: data, placement } = placed(`o-${i}`, level);
      const indices = occupiedIndices(data, placement);
      expect(new Set(indices).size).toBe(indices.length);
    }
  });

  it("every entity is on a passable tile", () => {
    for (let i = 0; i < 100; i++) {
      const level = 1 + (i % 9);
      const { level: data, placement } = placed(`t-${i}`, level);
      expect(isPassableTile(data, placement.player.x, placement.player.y)).toBe(true);
      for (const enemy of placement.enemies) {
        expect(isPassableTile(data, enemy.x, enemy.y)).toBe(true);
      }
      for (const item of placement.items) {
        expect(isPassableTile(data, item.x, item.y)).toBe(true);
      }
    }
  });

  it("no enemy or item is placed in rooms[0]", () => {
    for (let i = 0; i < 100; i++) {
      const level = 1 + (i % 9);
      const { level: data, placement } = placed(`r-${i}`, level);
      const start = data.rooms[0];
      expect(start).toBeDefined();
      if (!start) continue;
      const inStartRoom = (x: number, y: number) =>
        x >= start.x && x < start.x + start.w && y >= start.y && y < start.y + start.h;
      for (const enemy of placement.enemies) {
        expect(inStartRoom(enemy.x, enemy.y)).toBe(false);
      }
      for (const item of placement.items) {
        expect(inStartRoom(item.x, item.y)).toBe(false);
      }
    }
  });

  it("item count matches floor(nonStartingRoomCount / 3)", () => {
    for (let i = 0; i < 100; i++) {
      const level = 1 + (i % 9);
      const { level: data, placement } = placed(`ic-${i}`, level);
      const expected = Math.floor((data.rooms.length - 1) / ITEM_COUNT_DIVISOR);
      expect(placement.items.length).toBeLessThanOrEqual(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it("occupancy is respected across a full 10-level run for one seed", () => {
    const seed = "run-1";
    for (let level = 1; level <= 10; level++) {
      const { level: data, placement } = placed(seed, level);
      const indices = occupiedIndices(data, placement);
      expect(new Set(indices).size).toBe(indices.length);
      if (level === GUARDIAN_LEVEL) {
        expect(placement.enemies).toHaveLength(1);
      }
    }
  });
});

describe("tiers and scaling", () => {
  it("weapon tier at level 1 is 1, at level 7 is 3", () => {
    expect(weaponTierForLevel(1)).toBe(1);
    expect(weaponTierForLevel(7)).toBe(3);
  });

  it("armour tier at level 5 is 2", () => {
    expect(armorTierForLevel(5)).toBe(2);
    expect(armorTierForLevel(1)).toBe(1);
  });

  it("weapon and armour tiers stay inside their clamps", () => {
    for (let level = 1; level <= 10; level++) {
      expect(weaponTierForLevel(level)).toBeGreaterThanOrEqual(1);
      expect(weaponTierForLevel(level)).toBeLessThanOrEqual(3);
      expect(armorTierForLevel(level)).toBeGreaterThanOrEqual(1);
      expect(armorTierForLevel(level)).toBeLessThanOrEqual(2);
    }
  });

  it("a placed weapon at level 7 is weapon_3 and armour at level 5 is armor_2", () => {
    const weapons = new Set<string>();
    const armors = new Set<string>();
    for (let i = 0; i < 60; i++) {
      for (const item of placed(`w7-${i}`, 7).placement.items) {
        if (item.itemId.startsWith("weapon")) weapons.add(item.itemId);
      }
      for (const item of placed(`a5-${i}`, 5).placement.items) {
        if (item.itemId.startsWith("armor")) armors.add(item.itemId);
      }
    }
    expect([...weapons]).toEqual(["weapon_3"]);
    expect([...armors]).toEqual(["armor_2"]);
  });

  it("defScale is 1 at levels 4, 7 and 10 and 0 elsewhere", () => {
    expect(defScaleForLevel(4)).toBe(1);
    expect(defScaleForLevel(7)).toBe(1);
    expect(defScaleForLevel(10)).toBe(1);
    for (const level of [1, 2, 3, 5, 6, 8, 9]) {
      expect(defScaleForLevel(level)).toBe(0);
    }
  });

  it("applies defScale to every enemy on a scaled level", () => {
    const { placement } = placed("scale-4", 4);
    expect(placement.enemies.length).toBeGreaterThan(0);
    for (const enemy of placement.enemies) {
      const base = { rat: 0, skeleton: 2, goblin: 1, guardian: 3 }[enemy.type];
      expect(enemy.def).toBe((base ?? 0) + 1);
    }
  });
});

describe("item weights", () => {
  it("cover levels 1 through 9", () => {
    for (let level = 1; level <= 9; level++) {
      const band = ITEM_WEIGHT_BANDS.find((b) => level >= b.minLevel && level <= b.maxLevel);
      expect(band).toBeDefined();
    }
  });

  it("sum to 1 in every band", () => {
    for (const band of ITEM_WEIGHT_BANDS) {
      const total = band.weights.potion + band.weights.weapon + band.weights.armor;
      expect(total).toBeCloseTo(1, 10);
    }
  });
});
