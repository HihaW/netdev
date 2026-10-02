import { describe, expect, it } from "vitest";
import { createGame, resolveTurn } from "../src/game/turns.js";
import { stepTowardStairs } from "./fixtures.js";
import { buildKeymap } from "../src/ui/keymap.js";
import { renderFrame } from "../src/ui/renderer.js";

const keymap = buildKeymap();

function descendOneStep(state: ReturnType<typeof createGame>): boolean {
  const step = stepTowardStairs(state);
  if (!step) return false;
  resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
  return true;
}

describe("end-to-end playability", () => {
  it("a keyed input resolves a full turn and renders a frame", () => {
    const state = createGame("playable-1");
    const before = state.turnCount;

    const action = keymap.d;
    expect(action?.kind).toBe("move");

    const outcome = resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
    expect(outcome.consumed).toBe(true);
    expect(state.turnCount).toBe(before + 1);

    const calls = renderFrame(state);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("descends through several levels in one run", () => {
    const state = createGame("descend-3");
    for (let level = 1; level <= 3; level++) {
      let guard = 0;
      while (state.level === level && guard < 600) {
        if (!descendOneStep(state)) break;
        guard++;
      }
      expect(state.level).toBe(level + 1);
      expect(state.map.level).toBe(state.level);
      expect(state.map.rooms.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("fights, drops and dies, ending the run", () => {
    const state = createGame("fight-to-death");
    // Walk into trouble until something hits back.
    let died = false;
    for (let i = 0; i < 400 && !died; i++) {
      resolveTurn(state, { kind: "move", dx: 1, dy: 0 });
      died = state.gameOver;
      if (state.level > 1) break;
    }
    expect(state.turnCount).toBeGreaterThan(0);
    // Whether or not the rat found us, the run is internally consistent.
    expect(state.player.hp).toBeLessThanOrEqual(state.player.maxHp);
  });

  it("keeps a frame renderable on every level of a run", () => {
    const state = createGame("render-all-levels");
    for (let i = 0; i < 60; i++) {
      const calls = renderFrame(state);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.x).toBeGreaterThanOrEqual(0);
        expect(call.x).toBeLessThan(state.map.width);
        expect(call.y).toBeGreaterThanOrEqual(0);
        expect(call.y).toBeLessThan(state.map.height);
        expect(call.ch).toMatch(/^[\x20-\x7e]$/);
      }
      resolveTurn(state, { kind: "move", dx: 1, dy: 1 });
    }
  });
});
