import { describe, expect, it } from "vitest";
import { deriveSeed } from "../src/game/rng.js";
import { KEY_BINDINGS, buildKeymap, helpRows } from "../src/ui/keymap.js";
import {
  SCREEN_EVENTS,
  SCREENS,
  causeText,
  decideKey,
  nextScreen,
  normalizeSeed,
  reachableTransitions,
  seedLabel,
  type Screen,
} from "../src/ui/menus.js";

// The screen union has no seventh member and no implicit state: "?" opens the key
// reference inside the pause menu, and run history is a view of the title.
describe("the screen union", () => {
  it("has exactly the six states DESIGN.md 9 implies", () => {
    expect(SCREENS).toEqual(["title", "playing", "inventory", "paused", "gameover", "victory"]);
    expect(new Set(SCREENS).size).toBe(SCREENS.length);
  });

  it("can reach every screen from the title", () => {
    const reached = new Set<Screen>(["title"]);
    for (let hop = 0; hop < 3; hop++) {
      for (const from of [...reached]) {
        for (const event of SCREEN_EVENTS) reached.add(nextScreen(from, event));
      }
    }
    for (const screen of SCREENS) {
      expect(reached, screen).toContain(screen);
    }
  });

  it("reports transitions that nextScreen actually produces", () => {
    // The table is derived, not declared, so it cannot claim a transition the
    // switch does not make.
    for (const [from, to] of reachableTransitions()) {
      expect(SCREENS).toContain(from);
      expect(SCREENS).toContain(to);
      expect(SCREEN_EVENTS.some((event) => nextScreen(from, event) === to)).toBe(true);
    }
    // And every screen except the title is entered by at least one event.
    const entered = new Set(reachableTransitions().map(([, to]) => to));
    for (const screen of SCREENS) {
      if (screen === "title") continue;
      expect([...entered], screen).toContain(screen);
    }
  });

  it("toggles pause and inventory, and treats the rest as absolute", () => {
    expect(nextScreen("playing", "pause")).toBe("paused");
    expect(nextScreen("paused", "pause")).toBe("playing");
    expect(nextScreen("playing", "inventory")).toBe("inventory");
    expect(nextScreen("inventory", "inventory")).toBe("playing");
    expect(nextScreen("playing", "help")).toBe("paused");
    expect(nextScreen("playing", "died")).toBe("gameover");
    expect(nextScreen("playing", "won")).toBe("victory");
    expect(nextScreen("paused", "save-and-quit")).toBe("title");
    expect(nextScreen("paused", "to-title")).toBe("title");
    expect(nextScreen("gameover", "restart")).toBe("playing");
  });

  it("never resolves an event to a screen outside the union", () => {
    for (const screen of SCREENS) {
      for (const event of SCREEN_EVENTS) {
        expect(SCREENS, `${screen} + ${event}`).toContain(nextScreen(screen, event));
      }
    }
  });
});

// The ticket's anti-drift requirement: the help screen is rendered from the same
// table the input layer uses, so this has to hold in both directions.
describe("the help screen and the input keymap", () => {
  const keymap = buildKeymap();
  const rows = helpRows();

  it("documents every key the input layer binds", () => {
    const documented = rows.flatMap((row) => row.keys.split(" / "));
    expect(documented.sort()).toEqual(Object.keys(keymap).sort());
  });

  it("binds every key it documents to the action the row describes", () => {
    for (const binding of KEY_BINDINGS) {
      for (const key of binding.keys) {
        expect(keymap[key], key).toEqual(binding.action);
      }
      expect(rows.some((row) => row.keys === binding.keys.join(" / "))).toBe(true);
    }
  });

  it("has no binding without a help row and no help row without a binding", () => {
    expect(rows).toHaveLength(KEY_BINDINGS.length);
    for (const row of rows) {
      expect(
        KEY_BINDINGS.some((b) => b.keys.join(" / ") === row.keys),
        row.keys,
      ).toBe(true);
    }
  });

  it("names every movement key after its own direction", () => {
    // Eight directions across twelve keys: four share a key with an arrow.
    const movement = rows.filter((row) => row.action.startsWith("Move"));
    expect(movement).toHaveLength(8);
    expect(new Set(movement.map((row) => row.action)).size).toBe(8);
  });
});

describe("seed handling", () => {
  it("trims and never returns an empty seed as valid", () => {
    expect(normalizeSeed("  netdev  ")).toBe("netdev");
    expect(normalizeSeed("")).toBe("");
    expect(normalizeSeed("   \t\n ")).toBe("");
  });

  it("accepts a 10 000 character seed and still hashes to a valid one", () => {
    const long = "x".repeat(10_000);
    const seed = normalizeSeed(long);
    expect(seed).toHaveLength(10_000);

    const hashed = deriveSeed(seed, 1, "gen");
    expect(Number.isInteger(hashed)).toBe(true);
    expect(hashed).toBeGreaterThanOrEqual(1);
    expect(hashed).toBeLessThanOrEqual(0xffffffff);
  });

  it("hashes any non-empty string, not just words", () => {
    for (const seed of ["0", "!", "  spaced  ", "日本語", "a".repeat(10_000)]) {
      const hashed = deriveSeed(normalizeSeed(seed), 1, "gen");
      expect(Number.isInteger(hashed), seed).toBe(true);
      expect(hashed).toBeGreaterThanOrEqual(1);
    }
  });

  it("shortens only a label, never the seed itself", () => {
    expect(seedLabel("netdev")).toBe("netdev");
    const long = "y".repeat(500);
    const label = seedLabel(long);
    expect(label).not.toContain(long);
    expect(label).toContain("500 chars");
  });
});

describe("cause text", () => {
  it("names the enemy, or the dungeon when nothing did", () => {
    expect(causeText("rat")).toBe("rat");
    expect(causeText("guardian")).toBe("guardian");
    expect(causeText(null)).toBe("the dungeon");
  });
});

// Both bugs that shipped in the first cut of T13 lived here: a turn that was
// resolved but never drawn, and Escape that could not close an overlay. Neither
// is visible to a DOM assertion, so the routing is decided by a pure function and
// tested directly.
describe("key routing", () => {
  const keymap = buildKeymap();
  const decide = (key: string, screen: Screen, overlayOpen = false) =>
    decideKey({ action: keymap[key], isEscape: key === "Escape", screen, overlayOpen });

  it("resolves a movement key to a turn while playing", () => {
    expect(decide("d", "playing")).toEqual({ kind: "act", action: { kind: "move", dx: 1, dy: 0 } });
    expect(decide("ArrowUp", "playing")).toEqual({
      kind: "act",
      action: { kind: "move", dx: 0, dy: -1 },
    });
    expect(decide(" ", "playing")).toEqual({ kind: "act", action: { kind: "wait" } });
  });

  it("never resolves a turn outside playing", () => {
    for (const screen of ["title", "inventory", "paused", "gameover", "victory"] as const) {
      expect(decide("d", screen).kind, screen).not.toBe("act");
    }
  });

  it("routes the screen keys", () => {
    expect(decide("i", "playing")).toEqual({ kind: "screen", event: "inventory" });
    expect(decide("Escape", "playing")).toEqual({ kind: "screen", event: "pause" });
    expect(decide("?", "playing")).toEqual({ kind: "screen", event: "help" });
  });

  it("gives Escape to an open overlay instead of the game", () => {
    // The bug: Escape was dropped because the app ignored every key while an
    // overlay was up, so an overlay could not be closed from the keyboard.
    for (const screen of ["title", "inventory", "paused", "gameover", "victory"] as const) {
      expect(decide("Escape", screen, true), screen).toEqual({ kind: "escape-overlay" });
    }
    // Even when the game would otherwise have consumed it as a pause toggle.
    expect(decide("Escape", "paused", true)).toEqual({ kind: "escape-overlay" });
  });

  it("leaves the rest of the keyboard to the browser while an overlay is up", () => {
    for (const key of ["d", "w", " ", "5", "q", "?", "i"]) {
      expect(decide(key, "playing", true).kind, key).toBe("ignore");
    }
  });

  it("still lets i close the inventory, because DESIGN.md 9 calls it a toggle", () => {
    expect(decide("i", "inventory", true)).toEqual({ kind: "close-inventory" });
    // But not while some other overlay is up.
    expect(decide("i", "paused", true).kind).toBe("ignore");
  });

  it("ignores a key the keymap does not bind, in every state", () => {
    for (const key of ["F1", "x", "Enter", "Tab"]) {
      expect(
        decideKey({ action: keymap[key], isEscape: false, screen: "playing", overlayOpen: false })
          .kind,
        key,
      ).toBe("ignore");
    }
  });

  it("gives every bound key a defined decision in every state", () => {
    for (const key of Object.keys(keymap)) {
      for (const screen of SCREENS) {
        for (const overlayOpen of [false, true]) {
          const decision = decideKey({
            action: keymap[key],
            isEscape: key === "Escape",
            screen,
            overlayOpen,
          });
          expect(["ignore", "escape-overlay", "close-inventory", "act", "screen"]).toContain(
            decision.kind,
          );
          if (decision.kind === "screen") {
            expect(SCREENS).toContain(nextScreen(screen, decision.event));
          }
        }
      }
    }
  });
});
