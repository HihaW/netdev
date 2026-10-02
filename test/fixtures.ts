import { clearBfsCache, distanceField, nextStep } from "../src/game/bfs.js";
import { setSaveClock, setStorage, type StorageLike } from "../src/game/save.js";
import { Tile, type GameState } from "../src/game/types.js";
import { DIRECTIONS } from "../src/ui/keymap.js";

export interface FixtureMap {
  tiles: Uint8Array;
  width: number;
  height: number;
}

export function mapFromStrings(rows: string[]): FixtureMap {
  clearBfsCache();
  const first = rows[0];
  if (!first) throw new Error("map needs at least one row");
  const height = rows.length;
  const width = first.length;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y]?.[x] ?? ".";
      tiles[y * width + x] = ch === "#" ? Tile.Wall : ch === "+" ? Tile.Door : Tile.Floor;
    }
  }
  return { tiles, width, height };
}

export function openMap(width: number, height: number): FixtureMap {
  return mapFromStrings(Array.from({ length: height }, () => ".".repeat(width)));
}

export function roomMap(width: number, height: number): FixtureMap {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    if (y === 0 || y === height - 1) rows.push("#".repeat(width));
    else rows.push(`#${".".repeat(width - 2)}#`);
  }
  return mapFromStrings(rows);
}

export function passableCount(map: FixtureMap): number {
  let count = 0;
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const t = map.tiles[y * map.width + x];
      if (t === 0 || t === 2) count++;
    }
  }
  return count;
}

// A Storage that lives in a Map. `localStorage` does not exist under
// vitest's node environment, and adding JSDOM to the whole suite would hide a
// layering problem T01 deliberately set up (see the T13 ticket).
export function fakeStorage(): StorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

export const FIXED_ISO = "2026-10-02T12:00:00.000Z";

// Every test that starts a run needs this: createGame checkpoints on level
// entry (DESIGN.md 8.3), so it needs storage and a clock before it can return.
export function installTestStorage(iso: string = FIXED_ISO): StorageLike {
  const storage = fakeStorage();
  setStorage(storage);
  setSaveClock(() => iso);
  return storage;
}

// A test must be reproducible from its name alone, so seeds and scripted input
// come from here rather than from Math.random (T20 makes that a rule).
export function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const STEPS: readonly { dx: number; dy: number }[] = DIRECTIONS;

// One step toward the stairs, the way a player would walk. Returns null when the
// stairs cannot be reached at all.
export function stepTowardStairs(state: GameState): { dx: number; dy: number } | null {
  const { map } = state;
  const field = distanceField(map.tiles, map.width, map.height, map.stairs.x, map.stairs.y);
  const step = nextStep(field, map.width, state.player.x, state.player.y);
  if (!step) return null;
  return { dx: step.x - state.player.x, dy: step.y - state.player.y };
}

export { STEPS };
