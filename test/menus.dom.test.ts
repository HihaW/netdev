// @vitest-environment jsdom
//
// T01 set the suite to environment: "node" on purpose, so that a test needing a
// DOM signals a layering problem. This file is that signal, deliberately scoped
// to the one layer that is genuinely presentation. Everything else stays in node.
import { beforeEach, describe, expect, it } from "vitest";
import { endRun, hasSave, readHistory, readSave, writeSave } from "../src/game/save.js";
import { createGame, resolveTurn } from "../src/game/turns.js";
import type { GameState, RunRecord } from "../src/game/types.js";
import { buildKeymap, helpRows } from "../src/ui/keymap.js";
import {
  createMenuLayer,
  nextScreen,
  type MenuActions,
  type MenuLayer,
  type RunSummary,
  type Screen,
  type TitleData,
} from "../src/ui/menus.js";
import { installTestStorage } from "./fixtures.js";

interface Port {
  calls: string[];
  started: string[];
  copied: string[];
  actions: MenuActions;
  copyResult: boolean;
}

function mount(overrides: Partial<MenuActions> = {}): {
  layer: MenuLayer;
  port: Port;
  host: HTMLElement;
} {
  const host = document.createElement("div");
  document.body.replaceChildren(host);

  const port: Port = {
    calls: [],
    started: [],
    copied: [],
    copyResult: true,
    actions: {
      startRun: (seed) => {
        port.calls.push("startRun");
        port.started.push(seed);
      },
      continueRun: () => port.calls.push("continueRun"),
      resume: () => port.calls.push("resume"),
      saveAndQuit: () => port.calls.push("saveAndQuit"),
      restartRun: () => port.calls.push("restartRun"),
      toTitle: () => port.calls.push("toTitle"),
      copySeed: (seed) => {
        port.calls.push("copySeed");
        port.copied.push(seed);
        return Promise.resolve(port.copyResult);
      },
      randomSeed: () => "random-seed",
      drinkPotion: () => port.calls.push("drinkPotion"),
      ...overrides,
    },
  };

  return { layer: createMenuLayer(host, port.actions), port, host };
}

function button(layer: MenuLayer, action: string): HTMLButtonElement {
  const node = layer.element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!node) throw new Error(`no button with data-action="${action}"`);
  return node;
}

function hasButton(layer: MenuLayer, action: string): boolean {
  return layer.element.querySelector(`[data-action="${action}"]`) !== null;
}

function seedInput(layer: MenuLayer): HTMLInputElement {
  const node = layer.element.querySelector<HTMLInputElement>('[data-action="seed-input"]');
  if (!node) throw new Error("no seed input");
  return node;
}

function text(layer: MenuLayer): string {
  return layer.element.textContent ?? "";
}

function titleData(overrides: Partial<TitleData> = {}): TitleData {
  return { initialSeed: "netdev", save: null, history: [], ...overrides };
}

const SUMMARY: RunSummary = {
  seed: "the-deep-dungeon",
  level: 3,
  turns: 217,
  kills: 11,
  cause: "rat",
  won: false,
};

beforeEach(() => {
  installTestStorage();
});

describe("the title screen", () => {
  it("starts a run with the typed seed", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());
    expect(text(layer)).toContain("NETDEV");

    seedInput(layer).value = "my-seed";
    button(layer, "start").click();

    expect(port.started).toEqual(["my-seed"]);
  });

  it("prefills the seed field and refills it on Random Seed", () => {
    const { layer } = mount({ randomSeed: () => "freshly-minted" });
    layer.showTitle(titleData({ initialSeed: "prefilled" }));
    expect(seedInput(layer).value).toBe("prefilled");

    button(layer, "random").click();
    expect(seedInput(layer).value).toBe("freshly-minted");
  });

  it("starts on Enter from the seed field", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());
    seedInput(layer).value = "from-enter";
    seedInput(layer).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(port.started).toEqual(["from-enter"]);
  });

  it("refuses an empty or whitespace-only seed without starting a run", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());

    for (const blank of ["", "   ", "\t\n"]) {
      seedInput(layer).value = blank;
      button(layer, "start").click();
      expect(port.started).toEqual([]);
      expect(layer.element.querySelector<HTMLElement>(".menu-error")?.hidden).toBe(false);
    }
    expect(text(layer)).toContain("A run needs a seed");
  });

  it("accepts a 10 000 character seed", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());
    const long = "z".repeat(10_000);
    seedInput(layer).value = long;
    button(layer, "start").click();
    expect(port.started).toEqual([long]);
  });

  it("trims the seed it is given", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());
    seedInput(layer).value = "   padded   ";
    button(layer, "start").click();
    expect(port.started).toEqual(["padded"]);
  });

  it("hides Continue entirely when there is no save", () => {
    const { layer } = mount();
    layer.showTitle(titleData({ save: null }));
    expect(hasButton(layer, "continue")).toBe(false);
    expect(text(layer)).not.toContain("Continue");
  });

  it("offers Continue labelled with the seed and level it will load", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData({ save: { seed: "resume-me", level: 4 } }));

    const label = button(layer, "continue").textContent ?? "";
    expect(label).toContain("resume-me");
    expect(label).toContain("level 4");

    button(layer, "continue").click();
    expect(port.calls).toContain("continueRun");
  });

  it("reaches playing from the title for both Start Run and Continue", () => {
    expect(nextScreen("title", "start-run")).toBe("playing");
    expect(nextScreen("title", "continue")).toBe("playing");
  });
});

describe("the pause menu", () => {
  it("resumes without asking for anything", () => {
    const { layer, port } = mount();
    layer.showPaused();
    expect(layer.pausedView).toBe("menu");
    button(layer, "resume").click();
    expect(port.calls).toEqual(["resume"]);
  });

  it("asks for confirmation before restarting, and Cancel backs out", () => {
    const { layer, port } = mount();
    layer.showPaused();

    button(layer, "restart").click();
    expect(layer.pausedView).toBe("confirm-restart");
    expect(port.calls).not.toContain("restartRun");

    button(layer, "cancel-restart").click();
    expect(layer.pausedView).toBe("menu");
    expect(port.calls).not.toContain("restartRun");
  });

  it("restarts once confirmed", () => {
    const { layer, port } = mount();
    layer.showPaused("confirm-restart");
    button(layer, "confirm-restart").click();
    expect(port.calls).toEqual(["restartRun"]);
  });

  it("offers Save and Quit", () => {
    const { layer, port } = mount();
    layer.showPaused();
    button(layer, "save-quit").click();
    expect(port.calls).toEqual(["saveAndQuit"]);
    expect(nextScreen("paused", "save-and-quit")).toBe("title");
  });

  it("steps back one view at a time on escape", () => {
    const { layer, port } = mount();
    layer.showPaused("help");
    expect(layer.escape()).toBe(true);
    expect(layer.pausedView).toBe("menu");

    expect(layer.escape()).toBe(true);
    expect(port.calls).toEqual(["resume"]);
  });
});

describe("the help screen", () => {
  it("renders the keymap rows and the notes about keys that do not exist", () => {
    const { layer } = mount();
    layer.showPaused("help");

    const rendered = [...layer.element.querySelectorAll("tr")].map((row) => row.textContent ?? "");
    expect(rendered).toHaveLength(helpRows().length);

    const body = text(layer);
    expect(body).toContain("ArrowUp / w");
    expect(body).toContain("Move north-west");
    expect(body).toContain("Bumping a hostile entity attacks it");
    expect(body).toContain("Stepping onto the stairs descends");
    expect(body).toContain("Walking over an item picks it up");
  });

  it("cannot drift from the input layer, in either direction", () => {
    const { layer } = mount();
    layer.showPaused("help");
    const keymap = buildKeymap();

    const documented = [...layer.element.querySelectorAll("th")].map((cell) =>
      (cell.textContent ?? "").split(" / "),
    );

    // Nothing documented that is not bound...
    expect(documented.flat().sort()).toEqual(Object.keys(keymap).sort());
    // ...and every rendered key resolves to the action its row claims.
    for (const [key, action] of Object.entries(keymap)) {
      const row = [...layer.element.querySelectorAll("tr")].find((tr) =>
        (tr.querySelector("th")?.textContent ?? "").split(" / ").includes(key),
      );
      expect(row, key).toBeDefined();
      expect(row?.querySelector("td")?.textContent, key).toBeTruthy();
      expect(action, key).toBeDefined();
    }
  });
});

describe("the inventory screen", () => {
  it("reports bare hands, nothing, and no potions on a fresh run", () => {
    const state = createGame("inventory-screen");
    const { layer } = mount();
    layer.showInventory(state);

    const body = text(layer);
    expect(body).toContain("bare hands");
    expect(body).toContain("nothing");
    expect(body).toContain("Potions: 0");
  });

  it("lists what is actually carried", () => {
    const state = createGame("inventory-carried");
    state.inventory = [
      { itemId: "weapon_2", stack: 1 },
      { itemId: "armor_1", stack: 1 },
      { itemId: "potion", stack: 3 },
    ];
    const { layer } = mount();
    layer.showInventory(state);

    const body = text(layer);
    expect(body).toContain("Steel Sword");
    expect(body).toContain("Leather Vest");
    expect(body).toContain("Potions: 3");
  });

  it("closes back to playing", () => {
    const { layer, port } = mount();
    layer.showInventory(createGame("inventory-close"));
    button(layer, "back").click();
    expect(port.calls).toEqual(["resume"]);
  });

  it("closes on escape as well as on the button", () => {
    const { layer, port } = mount();
    layer.showInventory(createGame("inventory-escape"));
    expect(layer.escape()).toBe(true);
    expect(port.calls).toEqual(["resume"]);
  });
});

describe("the game over screen", () => {
  it("shows the cause, level, turns and kills", () => {
    const { layer } = mount();
    layer.showGameOver(SUMMARY);

    const body = text(layer);
    expect(body).toContain("You died");
    expect(body).toContain("rat");
    expect(body).toContain("Level reached");
    expect(body).toContain("3 of 10");
    expect(body).toContain("217");
    expect(body).toContain("11");
  });

  it("falls back to the dungeon when nothing did the killing", () => {
    const { layer } = mount();
    layer.showGameOver({ ...SUMMARY, cause: null });
    expect(text(layer)).toContain("the dungeon");
  });

  it("shows the seed as its own block and copies exactly that string", async () => {
    const { layer, port } = mount();
    layer.showGameOver(SUMMARY);

    expect(layer.element.querySelector(".seed-value")?.textContent).toBe("the-deep-dungeon");

    button(layer, "copy-seed").click();
    await Promise.resolve();
    expect(port.copied).toEqual(["the-deep-dungeon"]);
  });

  it("says so when the clipboard refuses", async () => {
    const { layer, port } = mount({ copySeed: () => Promise.resolve(false) });
    port.copyResult = false;
    layer.showGameOver(SUMMARY);

    button(layer, "copy-seed").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(button(layer, "copy-seed").textContent).toContain("Copy blocked");
  });

  it("offers Play again and Main Menu, so the screen can be escaped", () => {
    const { layer, port } = mount();
    layer.showGameOver(SUMMARY);

    button(layer, "restart").click();
    expect(port.calls).toEqual(["restartRun"]);

    const second = mount();
    second.layer.showGameOver(SUMMARY);
    button(second.layer, "to-title").click();
    expect(second.port.calls).toEqual(["toTitle"]);
  });

  it("goes to the title on escape, since there is no run left to resume", () => {
    const { layer, port } = mount();
    layer.showGameOver(SUMMARY);
    expect(layer.escape()).toBe(true);
    expect(port.calls).toEqual(["toTitle"]);
  });

  it("sends the victory screen to the title too", () => {
    const { layer, port } = mount();
    layer.showVictory({ ...SUMMARY, level: 10, won: true });
    expect(layer.escape()).toBe(true);
    expect(port.calls).toEqual(["toTitle"]);
  });
});

describe("the victory screen", () => {
  it("reports the final level and the win", () => {
    const { layer } = mount();
    layer.showVictory({ ...SUMMARY, level: 10, won: true, kills: 40 });

    const body = text(layer);
    expect(body).toContain("You escaped the dungeon");
    expect(body).toContain("10 of 10");
    expect(layer.element.querySelector(".seed-value")?.textContent).toBe("the-deep-dungeon");
  });

  it("keeps the killed-by row out of a victory", () => {
    const { layer } = mount();
    layer.showVictory({ ...SUMMARY, level: 10, won: true, cause: null });
    expect(text(layer)).toContain("the dungeon");
  });
});

describe("run history", () => {
  function record(seed: string, index: number): RunRecord {
    return {
      seed,
      level: 1 + (index % 10),
      turns: 40 + index,
      kills: index,
      cause: index % 2 === 0 ? "rat" : null,
      won: index % 3 === 0,
      endedAt: "2026-10-02T12:00:00.000Z",
    };
  }

  it("is reachable from the title and lists newest first", () => {
    const history = [record("newest", 3), record("middle", 2), record("oldest", 1)];
    const { layer } = mount();
    layer.showTitle(titleData({ history }));

    button(layer, "history").click();
    expect(layer.titleView).toBe("history");

    const items = [...layer.element.querySelectorAll<HTMLElement>(".history-item")].map(
      (item) => item.dataset.seed,
    );
    expect(items).toEqual(["newest", "middle", "oldest"]);
  });

  it("copies the entry that was clicked, not the current run's seed", async () => {
    const { layer, port } = mount();
    layer.showTitle(titleData({ history: [record("alpha", 1), record("beta", 2)] }));
    button(layer, "history").click();

    button(layer, "history-seed").click();
    await Promise.resolve();
    expect(port.copied).toEqual(["alpha"]);
  });

  it("is capped at 50 entries", () => {
    const history = Array.from({ length: 70 }, (_, index) => record(`seed-${index}`, index));
    const { layer } = mount();
    layer.showTitle(titleData({ history }));
    button(layer, "history").click();

    expect(layer.element.querySelectorAll(".history-item")).toHaveLength(50);
  });

  it("offers no history button when there is no history", () => {
    const { layer } = mount();
    layer.showTitle(titleData({ history: [] }));
    expect(hasButton(layer, "history")).toBe(false);
  });

  it("returns to the title menu on escape", () => {
    const { layer } = mount();
    layer.showTitle(titleData({ history: [record("only", 1)] }));
    button(layer, "history").click();
    expect(layer.titleView).toBe("history");

    expect(layer.escape()).toBe(true);
    expect(layer.titleView).toBe("menu");
    expect(hasButton(layer, "start")).toBe(true);
  });

  it("stays on the title menu when escape has nowhere left to go", () => {
    const { layer, port } = mount();
    layer.showTitle(titleData());
    expect(layer.escape()).toBe(true);
    expect(layer.titleView).toBe("menu");
    expect(port.calls).toEqual([]);
  });
});

describe("the overlay itself", () => {
  it("reports that escape did nothing while it is closed", () => {
    const { layer } = mount();
    expect(layer.escape()).toBe(false);
  });

  it("stays hidden until a screen is shown, and clears on demand", () => {
    const { layer } = mount();
    expect(layer.isShowing()).toBe(false);

    layer.showPaused();
    expect(layer.isShowing()).toBe(true);

    layer.clear();
    expect(layer.isShowing()).toBe(false);
    expect(layer.element.children).toHaveLength(0);
  });

  it("keeps the host's other children — the canvas and the HUD", () => {
    const { layer, host } = mount();
    const canvas = document.createElement("canvas");
    host.prepend(canvas);

    layer.showPaused();
    expect(host.contains(canvas)).toBe(true);
    expect(canvas.isConnected).toBe(true);
    expect(host.children).toHaveLength(2);
  });
});

// The seam between T12 and T13: the title screen's Continue label is only as
// truthful as writeSave and readSave, so assert across both.
describe("saving and continuing across the ticket boundary", () => {
  it("offers Continue for exactly the run the last checkpoint left behind", () => {
    const state: GameState = createGame("boundary-seed");
    let screen: Screen = "playing";
    resolveTurn(state, { kind: "wait" });
    writeSave(state);

    expect(hasSave()).toBe(true);
    const save = readSave();
    expect(save?.seed).toBe("boundary-seed");

    const resumed = (() => {
      screen = nextScreen(screen, "save-and-quit");
      return screen;
    })();
    expect(resumed).toBe("title");

    const { layer, port } = mount({
      continueRun: () => {
        port.calls.push("continueRun");
      },
    });
    layer.showTitle({
      initialSeed: "whatever",
      save: { seed: save?.seed ?? "", level: save?.level ?? 0 },
      history: readHistory(),
    });

    const label = button(layer, "continue").textContent ?? "";
    expect(label).toContain("boundary-seed");
    expect(label).toContain("level 1");
  });

  it("hides Continue once death has deleted the slot", () => {
    const state = createGame("gone");
    writeSave(state);
    expect(hasSave()).toBe(true);

    // Permadeath is endRun, which is what resolveTurn calls when the player dies.
    const record = endRun(state, { won: false, endedAt: "2026-10-02T12:00:00.000Z" });
    expect(record.seed).toBe("gone");
    expect(hasSave()).toBe(false);

    const { layer } = mount();
    layer.showTitle({ initialSeed: "x", save: null, history: readHistory() });
    expect(hasButton(layer, "continue")).toBe(false);
    expect(hasButton(layer, "history")).toBe(true);
  });
});
