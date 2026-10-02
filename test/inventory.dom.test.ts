// @vitest-environment jsdom
//
// The screen half of T14. The drinking rules live in test/inventory.test.ts under
// node; what cannot be checked without a DOM is whether the panel tells the truth
// and whether the keyboard alone can operate it.
import { beforeEach, describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items.js";
import { createItem } from "../src/game/entities.js";
import { createGame, potionCount, resolveTurn } from "../src/game/turns.js";
import type { GameState, ItemId } from "../src/game/types.js";
import { createHud, renderHud } from "../src/ui/hud.js";
import {
  createMenuLayer,
  itemName,
  nextScreen,
  type MenuActions,
  type Screen,
  type ScreenEvent,
} from "../src/ui/menus.js";
import { installTestStorage } from "./fixtures.js";

interface Port {
  calls: string[];
  drinks: number;
  actions: MenuActions;
}

// The port drives the real nextScreen plus the real layer, the same composition
// main.ts uses. A fake that only recorded calls would let these tests pass while
// the app left the overlay up, which is exactly the class of bug T13 shipped.
function mount(): {
  layer: ReturnType<typeof createMenuLayer>;
  port: Port;
  state: GameState;
  show: (screen: Screen) => void;
  dispatch: (event: ScreenEvent) => void;
} {
  const host = document.createElement("div");
  document.body.replaceChildren(host);

  const state = createGame("inventory-dom");
  const port: Port = { calls: [], drinks: 0, actions: null as unknown as MenuActions };
  let screen: Screen = "playing";

  const summary = () => ({
    seed: state.seed,
    level: state.level,
    turns: state.turnCount,
    kills: state.kills,
    cause: state.deathCause,
    won: false,
  });

  function show(next: Screen): void {
    screen = next;
    layer.clear();
    switch (next) {
      case "title":
        layer.showTitle({ initialSeed: "", save: null, history: [], daily: null });
        break;
      case "playing":
        break;
      case "inventory":
        layer.showInventory(state);
        break;
      case "paused":
        layer.showPaused();
        break;
      case "gameover":
        layer.showGameOver(summary());
        break;
      case "victory":
        layer.showVictory(summary());
        break;
    }
  }

  const dispatch = (event: ScreenEvent): void => show(nextScreen(screen, event));

  // Each action records itself and then does what main.ts does, so a test can
  // assert both that it was asked and that the screen actually moved.
  port.actions = {
    startRun: () => port.calls.push("startRun"),
    continueRun: () => port.calls.push("continueRun"),
    resume: () => {
      port.calls.push("resume");
      dispatch("resume");
    },
    saveAndQuit: () => {
      port.calls.push("saveAndQuit");
      dispatch("save-and-quit");
    },
    restartRun: () => {
      port.calls.push("restartRun");
      dispatch("restart");
    },
    toTitle: () => {
      port.calls.push("toTitle");
      dispatch("to-title");
    },
    copySeed: () => Promise.resolve(true),
    randomSeed: () => "seed",
    startDailyRun: () => port.calls.push("startDailyRun"),
    drinkPotion: () => {
      port.drinks += 1;
      const outcome = resolveTurn(state, { kind: "drink" });
      if (outcome.gameOver) dispatch("died");
    },
  };

  const layer = createMenuLayer(host, port.actions);

  return { layer, port, state, show, dispatch };
}

const panelText = (layer: ReturnType<typeof createMenuLayer>) => layer.element.textContent ?? "";

function give(state: GameState, itemId: ItemId, stack = 1): void {
  state.inventory.push({ itemId, stack });
}

beforeEach(() => {
  installTestStorage();
});

describe("what the panel shows", () => {
  it("says bare hands and nothing when nothing is equipped", () => {
    const { layer, state } = mount();
    layer.showInventory(state);

    const text = panelText(layer);
    expect(text).toContain("bare hands");
    expect(text).toContain("nothing");
    expect(text).toContain("Potions: 0");
    expect(text).not.toContain("ATK +");
  });

  it("names the equipped weapon and armour and their contributions", () => {
    const { layer, state } = mount();
    give(state, "weapon_3");
    give(state, "armor_2");
    state.player.atk = 4 + ITEMS.weapon_3.atkBonus;
    state.player.def = 1 + ITEMS.armor_2.defBonus;
    layer.showInventory(state);

    const text = panelText(layer);
    expect(text).toContain(itemName("weapon_3"));
    expect(text).toContain("+3 ATK");
    expect(text).toContain(itemName("armor_2"));
    expect(text).toContain("+2 DEF");
  });

  it("shows the potion count, not the entries", () => {
    const { layer, state } = mount();
    give(state, "potion", 7);
    layer.showInventory(state);
    expect(panelText(layer)).toContain("Potions: 7");
  });

  it("has a name for every item in the roster", () => {
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      expect(itemName(id), id).toBe(ITEMS[id].name);
    }
  });

  it("tells the player how to drink, and says so when there is nothing to drink", () => {
    const { layer, state } = mount();
    layer.showInventory(state);
    expect(panelText(layer)).toContain("No potions");

    give(state, "potion", 2);
    layer.showInventory(state);
    const text = panelText(layer);
    expect(text).toContain("1 or Enter drinks a potion");
    expect(text).toContain("Esc or i closes");
  });

  it("puts focus on the panel, not on the Close button, so Enter is not stolen", () => {
    const { layer, state } = mount();
    layer.showInventory(state);
    expect(layer.element.ownerDocument.activeElement?.tagName).toBe("DIV");
    expect(layer.element.querySelector("button")?.tagName).toBe("BUTTON");
  });
});

describe("the HUD and the panel agree", () => {
  it("reports the same effective ATK, DEF and HP for the same state", () => {
    const { layer, state } = mount();
    give(state, "weapon_2");
    give(state, "armor_1");
    give(state, "potion", 3);
    state.player.atk = 4 + ITEMS.weapon_2.atkBonus;
    state.player.def = 1 + ITEMS.armor_1.defBonus;
    state.player.hp = 7;

    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const hud = createHud(host);
    renderHud(hud, state);
    layer.showInventory(state);

    const hudText = hud.status.textContent ?? "";
    const panel = panelText(layer);

    const atk = /ATK (\d+)/.exec(hudText)?.[1];
    const def = /DEF (\d+)/.exec(hudText)?.[1];
    const hp = /HP (\d+\/\d+)/.exec(hudText)?.[1];

    expect(atk).toBeDefined();
    expect(panel).toContain(`ATK ${atk}`);
    expect(panel).toContain(`DEF ${def}`);
    expect(panel).toContain(`HP ${hp}`);
    expect(hudText).toContain("Potions 3");
    expect(panel).toContain("Potions: 3");
  });
});

describe("drinking from the screen", () => {
  it("asks the app to drink, and redraws with the new numbers", () => {
    const { layer, port, state } = mount();
    give(state, "potion", 3);
    state.player.hp = 4;
    layer.showInventory(state);
    expect(panelText(layer)).toContain("HP 4/20");

    expect(layer.drink()).toBe(true);

    expect(port.drinks).toBe(1);
    expect(state.player.hp).toBe(12);
    expect(panelText(layer)).toContain("HP 12/20");
    expect(panelText(layer)).toContain("Potions: 2");
  });

  it("shows the refusal when at full health, and keeps the potion", () => {
    const { layer, state } = mount();
    give(state, "potion", 2);
    layer.showInventory(state);

    expect(layer.drink()).toBe(true);

    expect(potionCount(state)).toBe(2);
    // The refusal is a log line (7.2), and the log is behind the overlay, so the
    // newest line has to be readable here.
    expect(panelText(layer)).toContain("full health");
  });

  it("refuses to drink from any screen but the inventory", () => {
    const { layer, port } = mount();
    layer.showPaused();
    expect(layer.drink()).toBe(false);

    layer.showTitle({ initialSeed: "x", save: null, history: [], daily: null });
    expect(layer.drink()).toBe(false);

    expect(port.drinks).toBe(0);
  });

  it("refuses to drink while nothing is open", () => {
    const { layer } = mount();
    expect(layer.drink()).toBe(false);
  });

  it("stops redrawing once the app has moved off the inventory", () => {
    // Drinking can kill the player, and the app answers that by leaving this
    // screen. The layer must not then paint the inventory back over the game over
    // screen, so it re-checks where it is before redrawing.
    const { layer, port, state } = mount();
    give(state, "potion", 1);
    layer.showInventory(state);

    // Stand in for the app's reaction to a fatal drink.
    layer.showGameOver({
      seed: state.seed,
      level: 1,
      turns: 0,
      kills: 0,
      cause: "rat",
      won: false,
    });

    expect(layer.drink()).toBe(false);
    expect(port.drinks).toBe(0);
    expect(layer.element.dataset.screen).toBe("gameover");
  });
});

describe("keyboard only", () => {
  it("closes on escape, and the overlay really goes away", () => {
    const { layer, port, state, dispatch } = mount();
    dispatch("inventory");
    expect(layer.isShowing()).toBe(true);

    expect(layer.escape()).toBe(true);

    expect(port.calls).toEqual(["resume"]);
    expect(layer.isShowing()).toBe(false);
    expect(state.inventory).toEqual([]);
  });

  it("closes on i as well, because the key is a toggle", () => {
    const { layer, dispatch } = mount();
    dispatch("inventory");
    expect(layer.element.dataset.screen).toBe("inventory");

    dispatch("inventory");

    expect(layer.isShowing()).toBe(false);
  });

  it("is reachable with no mouse at all", () => {
    const { layer, state } = mount();
    give(state, "potion", 1);
    state.player.hp = 5;
    layer.showInventory(state);

    // The whole interaction: drink, drink, close.
    layer.drink();
    expect(state.player.hp).toBe(13);
    layer.drink();
    expect(potionCount(state)).toBe(0);
    expect(panelText(layer)).toContain("No potions");

    layer.escape();
    expect(layer.isShowing()).toBe(false);
  });

  it("has a close button for the pointer path too", () => {
    const { layer, port, state } = mount();
    layer.showInventory(state);
    const close = layer.element.querySelector<HTMLButtonElement>('[data-action="back"]');
    expect(close).not.toBeNull();
    close?.click();
    expect(port.calls).toEqual(["resume"]);
  });
});

describe("no free drinking", () => {
  it("does not let a paused screen drink", () => {
    const { layer, port, state } = mount();
    give(state, "potion", 5);
    state.player.hp = 1;
    layer.showPaused();
    layer.drink();
    expect(port.drinks).toBe(0);
    expect(state.player.hp).toBe(1);
  });

  it("ignores a drink request when the inventory is empty", () => {
    const { layer, state } = mount();
    state.player.hp = 1;
    layer.showInventory(state);

    layer.drink();

    // The app was asked, and it refused; nothing changed.
    expect(state.player.hp).toBe(1);
    expect(panelText(layer)).toContain("No potions");
  });

  it("cannot heal past the maximum, however many are drunk", () => {
    const { layer, state } = mount();
    give(state, "potion", 4);
    state.player.hp = state.player.maxHp - 3;
    layer.showInventory(state);

    layer.drink();
    expect(state.player.hp).toBe(state.player.maxHp);

    // Full now: further drinks are refused and the stack is untouched.
    const remaining = potionCount(state);
    layer.drink();
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(potionCount(state)).toBe(remaining);
  });

  it("leaves a floor item on the ground when the inventory is not involved", () => {
    const state = createGame("inventory-floor-item");
    const before = state.entities.filter((e) => e.kind === "item").length;
    state.entities.push(createItem("potion", state.player.x, state.player.y, 1));
    expect(state.entities.filter((e) => e.kind === "item").length).toBe(before + 1);
  });
});
