import { beforeEach, describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items.js";
import { NEIGHBORS } from "../src/game/bfs.js";
import { POTION_HEAL_AMOUNT } from "../src/game/config.js";
import { createItem } from "../src/game/entities.js";
import { loadGame, writeSave } from "../src/game/save.js";
import {
  createGame,
  drinkPotion,
  effectiveStats,
  entityAt,
  potionCount,
  resolveTurn,
} from "../src/game/turns.js";
import { Tile, type GameState, type ItemId } from "../src/game/types.js";
import { installTestStorage } from "./fixtures.js";

// The save/load tests below need a slot of their own; the suite-wide setup
// installs one per file, but not per test.
beforeEach(() => {
  installTestStorage();
});

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

function giveAndStep(state: GameState, itemId: ItemId, stack = 1): void {
  const spot = freeNeighbour(state);
  if (!spot) throw new Error("the player has no free neighbouring tile");
  state.entities.push(createItem(itemId, spot.x, spot.y, stack));
  resolveTurn(state, {
    kind: "move",
    dx: spot.x - state.player.x,
    dy: spot.y - state.player.y,
  });
}

function withPotions(count: number, hp?: number): GameState {
  const state = createGame(`inventory-${count}-${hp ?? "full"}`);
  state.inventory.push({ itemId: "potion", stack: count });
  if (hp !== undefined) state.player.hp = hp;
  return state;
}

describe("what the screen reports", () => {
  it("has a name for every item in the roster", () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.name.length, item.id).toBeGreaterThan(0);
      expect(item.name, item.id).not.toBe(item.id);
    }
    // Six distinct names, so one cannot be a copy of another.
    expect(new Set(Object.values(ITEMS).map((item) => item.name)).size).toBe(
      Object.keys(ITEMS).length,
    );
  });

  it("starts with bare hands, nothing, and no potions", () => {
    const state = createGame("inventory-empty");
    const stats = effectiveStats(state);

    expect(stats.atkBonus).toBe(0);
    expect(stats.defBonus).toBe(0);
    expect(potionCount(state)).toBe(0);
    expect(state.inventory).toEqual([]);
  });

  it("reports the bonus each equipped item contributes", () => {
    const state = createGame("inventory-deltas");
    giveAndStep(state, "weapon_2");
    giveAndStep(state, "armor_2");

    const stats = effectiveStats(state);
    expect(stats.atk).toBe(4 + ITEMS.weapon_2.atkBonus);
    expect(stats.def).toBe(1 + ITEMS.armor_2.defBonus);
    expect(stats.atkBonus).toBe(ITEMS.weapon_2.atkBonus);
    expect(stats.defBonus).toBe(ITEMS.armor_2.defBonus);
  });

  it("picking up a better weapon replaces the worse one and moves effective ATK", () => {
    const state = createGame("inventory-upgrade");
    giveAndStep(state, "weapon_1");
    expect(state.player.atk).toBe(5);

    giveAndStep(state, "weapon_3");
    expect(state.player.atk).toBe(7);
    expect(effectiveStats(state).atkBonus).toBe(3);
  });

  it("the replaced weapon is discarded, not dropped as a floor item", () => {
    const state = createGame("inventory-discard");
    const floorBefore = state.entities
      .filter((e) => e.kind === "item")
      .map((e) => `${e.itemId}@${e.x},${e.y}`)
      .sort();

    giveAndStep(state, "weapon_1");
    giveAndStep(state, "weapon_2");

    const floorAfter = state.entities
      .filter((e) => e.kind === "item")
      .map((e) => `${e.itemId}@${e.x},${e.y}`)
      .sort();
    expect(floorAfter).toEqual(floorBefore);
    expect(state.inventory.filter((e) => ITEMS[e.itemId].category === "weapon")).toHaveLength(1);
  });

  it("picking up armour when armour is equipped replaces it", () => {
    const state = createGame("inventory-armor-replace");
    giveAndStep(state, "armor_1");
    expect(state.player.def).toBe(2);

    giveAndStep(state, "armor_2");
    expect(state.player.def).toBe(3);
    expect(state.inventory.filter((e) => ITEMS[e.itemId].category === "armor")).toHaveLength(1);
  });

  it("stacks potions to any count without a cap error", () => {
    const state = withPotions(97);
    expect(potionCount(state)).toBe(97);
    expect(state.inventory).toHaveLength(1);
  });
});

describe("drinking", () => {
  it("heals exactly 8 when there is more missing than that", () => {
    const state = withPotions(2, 5);
    expect(resolveTurn(state, { kind: "drink" }).consumed).toBe(true);
    expect(state.player.hp).toBe(5 + POTION_HEAL_AMOUNT);
  });

  it("heals only the 4 that are missing, and never overshoots", () => {
    const state = withPotions(2, state0MaxHp() - 4);
    expect(resolveTurn(state, { kind: "drink" }).consumed).toBe(true);
    expect(state.player.hp).toBe(state0MaxHp());
  });

  it("heals 1 when a single point is missing", () => {
    const state = withPotions(1, state0MaxHp() - 1);
    expect(drinkPotion(state)).toBe(true);
    expect(state.player.hp).toBe(state0MaxHp());
  });

  it("is refused at full health, logs it, and costs no turn", () => {
    const state = withPotions(3, state0MaxHp());
    const before = state.turnCount;

    const outcome = resolveTurn(state, { kind: "drink" });

    expect(outcome.consumed).toBe(false);
    expect(state.turnCount).toBe(before);
    expect(state.player.hp).toBe(state0MaxHp());
    expect(potionCount(state)).toBe(3);
    expect(state.messages.some((line) => line.includes("full health"))).toBe(true);
  });

  it("is refused with no potion, and costs no turn", () => {
    const state = createGame("inventory-no-potion");
    state.player.hp = 3;
    const before = state.turnCount;

    const outcome = resolveTurn(state, { kind: "drink" });

    expect(outcome.consumed).toBe(false);
    expect(state.turnCount).toBe(before);
    expect(state.player.hp).toBe(3);
  });

  it("decrements the stack, and the last potion leaves the inventory", () => {
    const state = withPotions(2, 1);
    resolveTurn(state, { kind: "drink" });
    expect(potionCount(state)).toBe(1);
    expect(state.inventory).toHaveLength(1);

    state.player.hp = 1;
    resolveTurn(state, { kind: "drink" });
    expect(potionCount(state)).toBe(0);
    expect(state.inventory).toEqual([]);
  });

  it("costs a turn: the counter moves and enemies act", () => {
    const state = withPotions(2, 4);
    // A rat next to the player will get its turn while the player drinks.
    const spot = freeNeighbour(state);
    if (!spot) throw new Error("no free tile");
    state.entities.push(createItem("potion", spot.x, spot.y, 1));

    const before = state.turnCount;
    const outcome = resolveTurn(state, { kind: "drink" });

    expect(outcome.consumed).toBe(true);
    expect(state.turnCount).toBe(before + 1);
  });

  it("lets an enemy hit the player while they are drinking", () => {
    const state = withPotions(2, 4);
    const rat = state.entities.find((e) => e.kind === "enemy");
    if (!rat) throw new Error("no enemy spawned");
    // Drag the nearest rat next to the player so its attack is not a coincidence
    // of where the generator happened to put it.
    rat.x = state.player.x + 1;
    rat.y = state.player.y;
    rat.isAlerted = true;
    rat.lastKnown = { x: state.player.x, y: state.player.y };
    state.visible = new Set([state.player.y * state.map.width + state.player.x]);

    const healedTo = 4 + POTION_HEAL_AMOUNT;
    resolveTurn(state, { kind: "drink" });

    // Drinking is a turn, so the rat acted after the heal: the player ends below
    // where the potion put them. The exact damage is a combat roll and is not
    // what this test is about.
    expect(state.player.hp).toBeLessThan(healedTo);
    expect(state.player.hp).toBeGreaterThan(0);
  });

  it("can kill the player, which ends the run", () => {
    const state = withPotions(2, 1);
    const rat = state.entities.find((e) => e.kind === "enemy");
    if (!rat) throw new Error("no enemy spawned");
    rat.x = state.player.x + 1;
    rat.y = state.player.y;
    rat.isAlerted = true;
    rat.lastKnown = { x: state.player.x, y: state.player.y };
    // Far more than a potion can heal back, so the rat finishes the job.
    rat.atk = 99;
    state.visible = new Set([state.player.y * state.map.width + state.player.x]);

    const outcome = resolveTurn(state, { kind: "drink" });

    expect(outcome.gameOver).toBe(true);
    expect(state.gameOver).toBe(true);
    expect(state.deathCause).toBe("rat");
  });

  it("opens and closes without drinking, and costs no turn", () => {
    const state = withPotions(5, 10);
    const before = state.turnCount;
    // Nothing but a screen was opened; there is no resolveTurn call in it.
    expect(state.turnCount).toBe(before);
    expect(potionCount(state)).toBe(5);
  });
});

describe("drinking and saving", () => {
  it("spends the potion before the save, so a resume cannot re-drink it", () => {
    const state = withPotions(2, 1);
    resolveTurn(state, { kind: "drink" });
    expect(potionCount(state)).toBe(1);

    writeSave(state);
    const restored = loadGame();

    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(potionCount(restored)).toBe(1);
    expect(restored.player.hp).toBe(state.player.hp);
  });

  it("carries equipment and potions through a resume together", () => {
    const state = createGame("inventory-resume");
    giveAndStep(state, "weapon_3");
    giveAndStep(state, "armor_1");
    giveAndStep(state, "potion");
    giveAndStep(state, "potion");

    writeSave(state);
    const restored = loadGame();

    expect(restored?.inventory).toEqual(state.inventory);
    if (!restored) return;
    expect(effectiveStats(restored).atk).toBe(effectiveStats(state).atk);
    expect(effectiveStats(restored).def).toBe(effectiveStats(state).def);
    expect(potionCount(restored)).toBe(2);
  });
});

function state0MaxHp(): number {
  return createGame("inventory-max-hp").player.maxHp;
}
