import { beforeEach, describe, expect, it } from "vitest";
import { ITEMS, type ItemCategory, type ItemWeights } from "../src/data/items.js";
import { ENEMY_STATS } from "../src/data/enemies.js";
import { NEIGHBORS } from "../src/game/bfs.js";
import { rollDrop, toCorpse } from "../src/game/combat.js";
import {
  DROPPED_POTION_CHANCE,
  ITEM_COUNT_DIVISOR,
  PLAYER_BASE_ATK,
  PLAYER_BASE_DEF,
  PLAYER_BASE_HP,
} from "../src/game/config.js";
import { generateLevel } from "../src/game/dungeon.js";
import { createEnemy, createItem, resetEntityIds } from "../src/game/entities.js";
import { beginLevelConstruction, beginLevelGameplay } from "../src/game/rng.js";
import { loadGame, writeSave } from "../src/game/save.js";
import {
  armorTierForLevel,
  drawItemCategory,
  itemWeightsForLevel,
  placeEntities,
  resolveItemId,
  weaponTierForLevel,
} from "../src/game/spawn.js";
import {
  createGame,
  effectiveStats,
  entityAt,
  itemAt,
  potionCount,
  resolveTurn,
} from "../src/game/turns.js";
import { Tile, type GameState, type ItemId } from "../src/game/types.js";
import { installTestStorage, stepTowardStairs } from "./fixtures.js";
import { potionCount as hudPotionCount } from "../src/ui/hud.js";

beforeEach(() => {
  installTestStorage();
});

// A passable tile next to the player with nothing already on it, so a test can
// put exactly one item where it wants it.
function freeNeighbour(state: GameState): { x: number; y: number } | null {
  const { map } = state;
  for (const [dx, dy] of NEIGHBORS) {
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const tile = map.tiles[y * map.width + x];
    if (tile !== Tile.Floor && tile !== Tile.Door) continue;
    if (entityAt(state, x, y)) continue;
    return { x, y };
  }
  return null;
}

function stepOnto(state: GameState, spot: { x: number; y: number }): void {
  resolveTurn(state, {
    kind: "move",
    dx: spot.x - state.player.x,
    dy: spot.y - state.player.y,
  });
}

// Put one item on a free neighbouring tile and walk onto it, which is the whole
// of DESIGN.md 5.3: pickup happens by moving, as part of the turn that move costs.
function giveAndStep(state: GameState, itemId: ItemId, stack = 1): void {
  const spot = freeNeighbour(state);
  if (!spot) throw new Error("the player has no free neighbouring tile");
  state.entities.push(createItem(itemId, spot.x, spot.y, stack));
  stepOnto(state, spot);
}

// The ids of the items still lying on the floor. A level places two or three of
// its own, so "the floor is empty" is never the right claim — "the floor is
// exactly as it was" is.
function floorItemIds(state: GameState): string[] {
  return state.entities
    .filter((e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item")
    .map((e) => `${e.itemId}@${e.x},${e.y}`)
    .sort();
}

function runToFloor(state: GameState, floor: number): void {
  while (state.level < floor) {
    const step = stepTowardStairs(state);
    if (!step) break;
    resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
  }
}

describe("the roster (DESIGN.md 7.1)", () => {
  it("matches the specified table exactly", () => {
    expect(
      Object.values(ITEMS).map((item) => ({
        id: item.id,
        glyph: item.glyph,
        atk: item.atkBonus,
        def: item.defBonus,
      })),
    ).toEqual([
      { id: "potion", glyph: "!", atk: 0, def: 0 },
      { id: "weapon_1", glyph: "/", atk: 1, def: 0 },
      { id: "weapon_2", glyph: "/", atk: 2, def: 0 },
      { id: "weapon_3", glyph: "/", atk: 3, def: 0 },
      { id: "armor_1", glyph: "[", atk: 0, def: 1 },
      { id: "armor_2", glyph: "[", atk: 0, def: 2 },
    ]);
  });

  it("marks only the potion stackable", () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.stackable, item.id).toBe(item.id === "potion");
    }
  });

  it("gives every id a glyph from the ASCII set rot.js can render", () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.glyph, item.id).toMatch(/^[\x20-\x7e]$/);
    }
  });
});

describe("the starting kit", () => {
  it("is bare-handed, with an empty inventory", () => {
    const state = createGame("starting-kit");
    expect(state.player.hp).toBe(PLAYER_BASE_HP);
    expect(state.player.maxHp).toBe(PLAYER_BASE_HP);
    expect(state.player.atk).toBe(PLAYER_BASE_ATK);
    expect(state.player.def).toBe(PLAYER_BASE_DEF);
    expect(state.inventory).toEqual([]);

    const stats = effectiveStats(state);
    expect(stats.atkBonus).toBe(0);
    expect(stats.defBonus).toBe(0);
  });
});

describe("walking onto an item", () => {
  it("raises effective ATK by exactly the weapon's bonus", () => {
    const state = createGame("pickup-weapon-1");
    const floorBefore = floorItemIds(state);
    expect(state.player.atk).toBe(PLAYER_BASE_ATK);

    giveAndStep(state, "weapon_1");

    expect(state.player.atk).toBe(PLAYER_BASE_ATK + 1);
    expect(effectiveStats(state).atkBonus).toBe(1);
    expect(state.inventory.map((e) => e.itemId)).toEqual(["weapon_1"]);
    expect(floorItemIds(state)).toEqual(floorBefore);
  });

  it("replaces a second weapon, and ATK reflects only the new one", () => {
    const state = createGame("pickup-weapon-replace");
    giveAndStep(state, "weapon_1");
    expect(state.player.atk).toBe(PLAYER_BASE_ATK + 1);

    giveAndStep(state, "weapon_3");

    expect(state.player.atk).toBe(PLAYER_BASE_ATK + 3);
    expect(state.inventory.filter((e) => ITEMS[e.itemId].category === "weapon")).toHaveLength(1);
    expect(state.inventory.some((e) => e.itemId === "weapon_1")).toBe(false);
  });

  it("discards the replaced weapon rather than dropping it (5.3)", () => {
    const state = createGame("pickup-discard");
    const entitiesBefore = state.entities.length;
    const floorBefore = floorItemIds(state);

    const first = freeNeighbour(state);
    if (!first) throw new Error("no free tile");
    state.entities.push(createItem("weapon_1", first.x, first.y));
    stepOnto(state, first);
    // Push then pick up is net zero: the item leaves the world, not the count.
    expect(state.entities).toHaveLength(entitiesBefore);

    const second = freeNeighbour(state);
    if (!second) throw new Error("no free tile");
    state.entities.push(createItem("weapon_2", second.x, second.y));
    stepOnto(state, second);

    // The floor is exactly as it was. If the discarded blade had been dropped,
    // there would be one more item on it than there was.
    expect(floorItemIds(state)).toEqual(floorBefore);
    expect(state.entities).toHaveLength(entitiesBefore);
    expect(itemAt(state, second.x, second.y)).toBeUndefined();
    expect(state.inventory.map((e) => e.itemId)).toEqual(["weapon_2"]);
  });

  it("replaces armour the same way", () => {
    const state = createGame("pickup-armor");
    giveAndStep(state, "armor_1");
    expect(state.player.def).toBe(PLAYER_BASE_DEF + 1);

    giveAndStep(state, "armor_2");
    expect(state.player.def).toBe(PLAYER_BASE_DEF + 2);
    expect(state.inventory.filter((e) => ITEMS[e.itemId].category === "armor")).toHaveLength(1);
  });

  it("keeps weapon and armour independent", () => {
    const state = createGame("pickup-both");
    giveAndStep(state, "weapon_2");
    giveAndStep(state, "armor_1");

    expect(state.player.atk).toBe(PLAYER_BASE_ATK + 2);
    expect(state.player.def).toBe(PLAYER_BASE_DEF + 1);
    expect(state.inventory).toHaveLength(2);
  });

  it("stacks a potion without touching ATK or DEF", () => {
    const state = createGame("pickup-potion");
    giveAndStep(state, "potion");

    expect(potionCount(state)).toBe(1);
    expect(state.player.atk).toBe(PLAYER_BASE_ATK);
    expect(state.player.def).toBe(PLAYER_BASE_DEF);

    giveAndStep(state, "potion");
    expect(potionCount(state)).toBe(2);
    expect(state.inventory).toHaveLength(1);
  });

  it("stacks potions past 5 with no cap and no new entries", () => {
    const state = createGame("pickup-stack");
    for (let i = 0; i < 12; i++) giveAndStep(state, "potion");

    expect(potionCount(state)).toBe(12);
    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0]?.stack).toBe(12);
  });

  it("costs exactly one turn, the one the move already cost", () => {
    const state = createGame("pickup-turn-cost");
    const before = state.turnCount;
    giveAndStep(state, "potion");
    expect(state.turnCount).toBe(before + 1);
  });

  it("picks up a drop that landed on a corpse", () => {
    // killEnemy spawns the drop on the corpse's tile (5.2), so the tile holds two
    // entities and entityAt returns the corpse first. Without a dedicated item
    // search the potion would be unreachable for the rest of the level.
    const state = createGame("drop-on-corpse");
    const spot = freeNeighbour(state);
    if (!spot) throw new Error("no free tile");

    const rat = createEnemy("rat", spot.x, spot.y, 0);
    state.entities.push(rat, createItem("potion", spot.x, spot.y, 1));
    const index = state.entities.indexOf(rat);
    if (index < 0) throw new Error("rat not in the world");
    state.entities[index] = toCorpse(rat);

    expect(entityAt(state, spot.x, spot.y)?.kind).toBe("corpse");
    expect(itemAt(state, spot.x, spot.y)?.itemId).toBe("potion");

    stepOnto(state, spot);

    expect(potionCount(state)).toBe(1);
    expect(itemAt(state, spot.x, spot.y)).toBeUndefined();
    expect(state.entities.some((e) => e.kind === "corpse")).toBe(true);
  });

  it("logs what was picked up", () => {
    const state = createGame("pickup-log");
    giveAndStep(state, "weapon_1");
    expect(state.messages.some((line) => line.includes("Rusty Blade"))).toBe(true);
  });
});

describe("equipment and the player's stats cannot drift", () => {
  it("keeps ATK equal to the base plus the equipped weapon, whatever the order", () => {
    for (const order of [
      ["weapon_3", "weapon_1", "weapon_2"],
      ["armor_2", "weapon_1", "armor_1"],
      ["weapon_1", "armor_2", "weapon_3"],
    ]) {
      const state = createGame(`drift-${order.join("-")}`);
      for (const itemId of order) giveAndStep(state, itemId as ItemId);

      const stats = effectiveStats(state);
      const weapon = state.inventory.find((e) => ITEMS[e.itemId].category === "weapon");
      const armor = state.inventory.find((e) => ITEMS[e.itemId].category === "armor");
      expect(stats.atk, order.join(",")).toBe(
        PLAYER_BASE_ATK + (weapon ? ITEMS[weapon.itemId].atkBonus : 0),
      );
      expect(stats.def, order.join(",")).toBe(
        PLAYER_BASE_DEF + (armor ? ITEMS[armor.itemId].defBonus : 0),
      );
      expect(state.player.atk, order.join(",")).toBe(stats.atk);
      expect(state.player.def, order.join(",")).toBe(stats.def);
    }
  });

  it("gives the HUD and the inventory screen the same numbers", () => {
    const state = createGame("one-source");
    giveAndStep(state, "weapon_3");
    giveAndStep(state, "armor_2");

    expect(hudPotionCount(state)).toBe(potionCount(state));
    const stats = effectiveStats(state);
    expect(stats.atk).toBe(state.player.atk);
    expect(stats.def).toBe(state.player.def);
  });

  it("carries the inventory and the stats through a save and load", () => {
    const state = createGame("inventory-save");
    giveAndStep(state, "weapon_3");
    giveAndStep(state, "armor_1");
    giveAndStep(state, "potion");
    giveAndStep(state, "potion");

    writeSave(state);
    const restored = loadGame();

    expect(restored).not.toBeNull();
    expect(restored?.inventory).toEqual(state.inventory);
    expect(restored?.player.atk).toBe(state.player.atk);
    expect(restored?.player.def).toBe(state.player.def);
    if (restored) expect(potionCount(restored)).toBe(2);
  });
});

describe("placement (DESIGN.md 7.3)", () => {
  it("places floor(nonStartingRooms / 3) items on 100 generated levels", () => {
    for (let i = 0; i < 100; i++) {
      const level = (i % 9) + 1;
      const seed = `items-count-${i}`;
      const map = generateLevel(seed, level);
      const placement = placeEntities(map, seed);

      const expected = Math.floor((map.rooms.length - 1) / ITEM_COUNT_DIVISOR);
      expect(placement.items, `${seed} level ${level}`).toHaveLength(expected);
    }
  });

  it("places no items and one guardian on level 10", () => {
    const map = generateLevel("items-level-10", 10);
    const placement = placeEntities(map, "items-level-10");

    expect(placement.items).toHaveLength(0);
    expect(placement.enemies).toHaveLength(1);
    expect(placement.enemies[0]?.type).toBe("guardian");
    expect(ENEMY_STATS.guardian.unlockLevel).toBe(10);
  });

  it("derives the weapon tier from depth: 1 at 1-3, 2 at 4-6, 3 at 7-9", () => {
    for (let level = 1; level <= 9; level++) {
      const expected = level <= 3 ? 1 : level <= 6 ? 2 : 3;
      expect(weaponTierForLevel(level), `level ${level}`).toBe(expected);
    }
    expect(weaponTierForLevel(10)).toBe(3);
  });

  it("derives the armour tier from depth: 1 at 1-4, 2 at 5-9", () => {
    for (let level = 1; level <= 9; level++) {
      expect(armorTierForLevel(level), `level ${level}`).toBe(level <= 4 ? 1 : 2);
    }
  });

  it("resolves the tier into a real item id", () => {
    expect(resolveItemId("potion", 9)).toBe("potion");
    expect(resolveItemId("weapon", 1)).toBe("weapon_1");
    expect(resolveItemId("weapon", 7)).toBe("weapon_3");
    expect(resolveItemId("armor", 4)).toBe("armor_1");
    expect(resolveItemId("armor", 5)).toBe("armor_2");
  });

  it("never places an item in the spawn room", () => {
    for (let i = 0; i < 40; i++) {
      const level = (i % 9) + 1;
      const seed = `items-spawn-room-${i}`;
      const map = generateLevel(seed, level);
      const placement = placeEntities(map, seed);
      const first = map.rooms[0];
      if (!first) throw new Error("no rooms");

      for (const item of placement.items) {
        const inside =
          item.x >= first.x &&
          item.x < first.x + first.w &&
          item.y >= first.y &&
          item.y < first.y + first.h;
        expect(inside, `${seed} placed ${item.itemId} in the spawn room`).toBe(false);
      }
    }
  });
});

describe("the weighted type table", () => {
  const categories: readonly ItemCategory[] = ["potion", "weapon", "armor"];

  function empirical(level: number, draws: number): Record<ItemCategory, number> {
    beginLevelConstruction(`items-dist-${level}`, level, 0);
    const counts: Record<ItemCategory, number> = { potion: 0, weapon: 0, armor: 0 };
    for (let i = 0; i < draws; i++) counts[drawItemCategory(level)] += 1;
    return counts;
  }

  it("has a weight band covering every level that places items", () => {
    for (let level = 1; level <= 9; level++) {
      const weights: ItemWeights = itemWeightsForLevel(level);
      const total = categories.reduce((sum, c) => sum + (weights[c] ?? 0), 0);
      expect(total, `level ${level}`).toBeCloseTo(1, 10);
    }
  });

  it("has no band for level 10, which is the point of level 10", () => {
    // The bands stop at 9 because level 10 places nothing at all. Asking for its
    // weights throws rather than inventing a distribution nobody uses.
    expect(() => itemWeightsForLevel(10)).toThrow();
  });

  it("lands within 3 points of the specified weights over 10 000 draws", () => {
    for (const level of [1, 8]) {
      const weights = itemWeightsForLevel(level);
      const counts = empirical(level, 10_000);

      for (const category of categories) {
        const expected = (weights[category] ?? 0) * 100;
        const actual = (counts[category] / 10_000) * 100;
        expect(Math.abs(actual - expected), `level ${level} ${category}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("uses the documented bands", () => {
    expect(itemWeightsForLevel(1)).toMatchObject({ potion: 0.4, weapon: 0.4, armor: 0.2 });
    expect(itemWeightsForLevel(3)).toMatchObject({ potion: 0.35, weapon: 0.4, armor: 0.25 });
    expect(itemWeightsForLevel(6)).toMatchObject({ potion: 0.3, weapon: 0.4, armor: 0.3 });
  });
});

describe("drops (DESIGN.md 5.2)", () => {
  it("lands within 1 point of 0.35 over 10 000 seeded deaths", () => {
    beginLevelGameplay("items-drop-rate", 1);
    let drops = 0;
    for (let i = 0; i < 10_000; i++) {
      if (rollDrop() !== null) drops += 1;
    }
    expect(Math.abs(drops / 10_000 - DROPPED_POTION_CHANCE)).toBeLessThanOrEqual(0.01);
  });

  it("only ever drops a potion", () => {
    beginLevelGameplay("items-drop-kind", 1);
    for (let i = 0; i < 10_000; i++) {
      const dropped = rollDrop();
      if (dropped !== null) expect(dropped).toBe("potion");
    }
  });

  it("is reproducible for the same gameplay seed", () => {
    const one = (() => {
      beginLevelGameplay("items-drop-repeat", 1);
      return Array.from({ length: 200 }, () => rollDrop());
    })();
    const two = (() => {
      beginLevelGameplay("items-drop-repeat", 1);
      return Array.from({ length: 200 }, () => rollDrop());
    })();
    expect(two).toEqual(one);
  });
});

describe("determinism", () => {
  it("places identical items at identical positions with identical stacks", () => {
    const pass = (seed: string, level: number) => {
      resetEntityIds();
      const map = generateLevel(seed, level);
      const placement = placeEntities(map, seed);
      return placement.items.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        x: item.x,
        y: item.y,
        stack: item.stack,
      }));
    };

    for (let level = 1; level <= 9; level++) {
      const seed = `items-determinism-${level}`;
      expect(pass(seed, level), `level ${level}`).toEqual(pass(seed, level));
    }
  });
});

describe("a real run", () => {
  it("offers every item in the roster across three descents to level 10", () => {
    // One run is not guaranteed to contain all six: armour_2 only rolls from
    // level 5 and weapon_3 only from level 7, on a 30% and 40% category weight.
    // That is balance, not a defect, so the claim is made across three runs.
    const seen = new Set<ItemId>();
    const complete: string[] = [];

    for (let s = 0; s < 3; s++) {
      const seed = `items-real-run-${s}`;
      const state = createGame(seed);
      const before = new Set(seen);

      for (let level = 1; level <= 9; level++) {
        for (const entity of state.entities) {
          if (entity.kind === "item") seen.add(entity.itemId);
        }
        runToFloor(state, level + 1);
        if (state.level !== level + 1) break;
      }

      const added = [...seen].filter((id) => !before.has(id));
      if (added.length > 0) complete.push(`${seed}: ${added.sort().join(", ")}`);
    }

    expect(complete.length).toBeGreaterThan(0);
    expect([...seen].sort()).toEqual(Object.keys(ITEMS).sort());
  });

  it("collects what it walks over, and leaves the rest of the floor alone", () => {
    const state = createGame("items-collect");
    const floorBefore = floorItemIds(state);
    expect(floorBefore.length).toBeGreaterThan(0);

    const spot = freeNeighbour(state);
    if (!spot) throw new Error("no free tile");
    state.entities.push(createItem("weapon_2", spot.x, spot.y));
    stepOnto(state, spot);

    expect(state.inventory.map((entry) => entry.itemId)).toEqual(["weapon_2"]);
    expect(floorItemIds(state)).toEqual(floorBefore);
  });
});
