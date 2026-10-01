import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLORS, GLYPHS, GRID_HEIGHT, GRID_WIDTH } from "../src/game/config.js";
import { createGame } from "../src/game/turns.js";
import { refreshFov } from "../src/game/turns.js";
import { createEnemy, resetEntityIds } from "../src/game/entities.js";
import { buildKeymap, DIRECTIONS, type GameAction } from "../src/ui/keymap.js";
import { renderFrame, terrainGlyph, tileVisibility } from "../src/ui/renderer.js";
import { Tile, type GameState } from "../src/game/types.js";

function exploredState(seed = "renderer-seed"): GameState {
  const state = createGame(seed);
  state.explored.fill(1);
  refreshFov(state);
  return state;
}

describe("terrainGlyph", () => {
  it("matches DESIGN.md 10.1 for every tile kind", () => {
    expect(terrainGlyph(Tile.Floor)).toBe(".");
    expect(terrainGlyph(Tile.Wall)).toBe("#");
    expect(terrainGlyph(Tile.Door)).toBe("+");
  });
});

describe("glyph table", () => {
  it("contains only printable ASCII", () => {
    const entries: string[] = [...Object.values(GLYPHS), ...Object.values(COLORS)];
    for (const entry of entries) {
      expect(entry).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("uses the exact glyphs from the spec", () => {
    expect(GLYPHS).toEqual({
      wall: "#",
      floor: ".",
      door: "+",
      stairs: ">",
      player: "@",
      corpse: "%",
    });
  });
});

describe("tileVisibility", () => {
  it("puts every tile in exactly one of the three states", () => {
    const state = exploredState();
    const total = GRID_WIDTH * GRID_HEIGHT;
    const visible: number[] = [];
    const dimmed: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < total; i++) {
      const kind = tileVisibility(state, i);
      if (kind === "visible") visible.push(i);
      else if (kind === "explored") dimmed.push(i);
      else unknown.push(i);
    }
    expect(visible.length + dimmed.length + unknown.length).toBe(total);
    expect(visible.length).toBeGreaterThan(0);
    expect(dimmed.length).toBeGreaterThan(0);
  });

  it("reports unknown for a tile never seen", () => {
    const state = exploredState();
    const far = 0;
    expect(state.visible.has(far)).toBe(false);
    state.explored[far] = 0;
    expect(tileVisibility(state, far)).toBe("unknown");
  });
});

describe("renderFrame", () => {
  it("writes one draw per known tile plus entity draws", () => {
    const state = exploredState();
    state.explored.fill(1);
    const calls = renderFrame(state);
    const terrainCalls = calls.filter((c) => c.bg !== COLORS.background).length;
    expect(terrainCalls).toBe(GRID_WIDTH * GRID_HEIGHT);

    const entityCalls = calls.filter((c) => c.bg === COLORS.background);
    // The player, plus every enemy and item inside the FOV.
    expect(entityCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("emits no draw call for an unexplored tile", () => {
    const state = exploredState();
    const wallX = 0;
    const wallY = 0;
    const index = wallY * state.map.width + wallX;
    expect(state.map.tiles[index]).toBe(Tile.Wall);

    state.explored[index] = 0;
    const call = renderFrame(state).find((c) => c.x === wallX && c.y === wallY);
    expect(call).toBeUndefined();
  });

  it("emits no draw call for an entity outside the FOV, even on explored ground", () => {
    const state = exploredState();
    const ghost = createEnemy("rat", 2, 2, 0);
    state.entities = [...state.entities, ghost];
    const index = ghost.y * state.map.width + ghost.x;
    state.explored[index] = 1;
    expect(state.visible.has(index)).toBe(false);

    const calls = renderFrame(state);
    expect(calls.some((c) => c.x === ghost.x && c.y === ghost.y && c.fg === COLORS.enemyFg)).toBe(
      false,
    );
  });

  it("emits exactly one draw call for a corpse inside the FOV", () => {
    const state = exploredState();
    const corpse = {
      kind: "corpse" as const,
      id: "e999",
      x: state.player.x,
      y: state.player.y + 1,
      glyph: "%",
      hp: 0,
      maxHp: 0,
      atk: 0,
      def: 0,
      type: "rat" as const,
    };
    state.explored[corpse.y * state.map.width + corpse.x] = 1;
    state.entities = [...state.entities, corpse];

    const calls = renderFrame(state);
    // Terrain is drawn first, then the corpse on top of it.
    const atTile = calls.filter((c) => c.x === corpse.x && c.y === corpse.y);
    expect(atTile).toHaveLength(2);
    const corpseCalls = calls.filter(
      (c) => c.x === corpse.x && c.y === corpse.y && c.fg === COLORS.corpseFg,
    );
    expect(corpseCalls).toHaveLength(1);
    expect(corpseCalls[0]?.ch).toBe("%");
  });

  it("draws explored-only terrain with the dimmed foreground", () => {
    const state = exploredState();
    const calls = renderFrame(state);
    const dimmed = calls.filter((c) => c.fg === COLORS.exploredFg);
    expect(dimmed.length).toBeGreaterThan(0);
    for (const call of dimmed) {
      const index = call.y * state.map.width + call.x;
      expect(state.visible.has(index)).toBe(false);
    }
  });

  it("draws the stairs glyph, and greys it while the boss lives", () => {
    const open = exploredState();
    open.player.x = open.map.stairs.x;
    open.player.y = open.map.stairs.y - 1;
    refreshFov(open);
    const openCall = renderFrame(open).find(
      (c) => c.x === open.map.stairs.x && c.y === open.map.stairs.y && c.ch === ">",
    );
    expect(openCall?.fg).toBe(COLORS.stairsFg);

    resetEntityIds();
    const sealed = exploredState();
    sealed.player.x = sealed.map.stairs.x;
    sealed.player.y = sealed.map.stairs.y - 1;
    sealed.entities = [
      ...sealed.entities.filter((e) => e.kind !== "enemy"),
      createEnemy("guardian", sealed.map.stairs.x, sealed.map.stairs.y, 1),
    ];
    refreshFov(sealed);
    const sealedCall = renderFrame(sealed).find(
      (c) => c.x === sealed.map.stairs.x && c.y === sealed.map.stairs.y && c.ch === ">",
    );
    expect(sealedCall?.fg).toBe(COLORS.stairsSealedFg);
  });

  it("is a pure function of state", () => {
    const state = exploredState();
    const first = renderFrame(state);
    const second = renderFrame(state);
    expect(second).toEqual(first);
  });
});

describe("keymap", () => {
  const keymap = buildKeymap();

  it("covers every key in DESIGN.md 9 and nothing else", () => {
    expect(Object.keys(keymap).sort()).toEqual(
      [
        "ArrowUp",
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "w",
        "a",
        "s",
        "d",
        "q",
        "e",
        "z",
        "c",
        ".",
        "5",
        " ",
        "i",
        "Escape",
        "?",
      ].sort(),
    );
  });

  it("binds '.', '5' and Space to wait", () => {
    expect(keymap["."]).toEqual({ kind: "wait" });
    expect(keymap["5"]).toEqual({ kind: "wait" });
    expect(keymap[" "]).toEqual({ kind: "wait" });
  });

  it("resolves every key to a direction or a named action, never undefined", () => {
    for (const [key, action] of Object.entries(keymap)) {
      expect(action, key).toBeDefined();
      if (action.kind === "move") {
        const known = DIRECTIONS.some((d) => d.dx === action.dx && d.dy === action.dy);
        expect(known, key).toBe(true);
      } else {
        expect(["wait", "inventory", "pause", "help"]).toContain(action.kind);
      }
    }
  });

  it("binds all 8 directions across the movement keys", () => {
    const dirs = Object.values(keymap)
      .filter((a: GameAction) => a.kind === "move")
      .map((a) => a as { dx: number; dy: number });
    for (const dir of DIRECTIONS) {
      expect(dirs.some((d) => d.dx === dir.dx && d.dy === dir.dy)).toBe(true);
    }
  });

  it("has no '>' or 'g' key: stairs and items are automatic", () => {
    expect(keymap[">"]).toBeUndefined();
    expect(keymap.g).toBeUndefined();
  });
});

describe("source hygiene", () => {
  it("index.html references no external font, CDN or analytics", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/fonts\.googleapis|cdn|analytics|https?:\/\//i);
  });
});
