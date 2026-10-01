import { describe, expect, it } from "vitest";
import { clearBfsCache, distanceField, nextStep } from "../src/game/bfs.js";
import { Tile } from "../src/game/types.js";
import { generateLevel } from "../src/game/dungeon.js";

function mapFromStrings(rows: string[]): { tiles: Uint8Array; width: number; height: number } {
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

const OPEN_5 = [".....", ".....", ".....", ".....", "....."];

describe("distanceField", () => {
  it("on an open 5×5 map, distance from the centre is the Chebyshev distance", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const field = distanceField(tiles, width, height, 2, 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cheb = Math.max(Math.abs(x - 2), Math.abs(y - 2));
        expect(field[y * width + x]).toBe(cheb);
      }
    }
  });

  it("a wall fully enclosing a tile makes it unreachable", () => {
    const { tiles, width, height } = mapFromStrings([
      "#######",
      "#.....#",
      "#.###.#",
      "#.#.#.#",
      "#.###.#",
      "#.....#",
      "#######",
    ]);
    const field = distanceField(tiles, width, height, 1, 1);
    expect(field[3 * width + 3]).toBe(-1);
    expect(nextStep(field, width, 3, 3)).toBeNull();
  });

  it("a single-tile gap is passable", () => {
    const { tiles, width, height } = mapFromStrings([
      "#######",
      "#..#..#",
      "#..#..#",
      "#.....#",
      "#..#..#",
      "#..#..#",
      "#######",
    ]);
    const field = distanceField(tiles, width, height, 1, 1);
    expect(field[1 * width + 5]).toBe(6);
  });

  it("a diagonal gap between two wall corners is not passable", () => {
    const { tiles, width, height } = mapFromStrings([".#", "#."]);
    const field = distanceField(tiles, width, height, 0, 0);
    expect(field[1 * width + 1]).toBe(-1);
  });

  it("doors are passable", () => {
    const { tiles, width, height } = mapFromStrings(["#####", "#...#", "##+##", "#...#", "#####"]);
    const field = distanceField(tiles, width, height, 2, 1);
    expect(field[2 * width + 2]).toBe(1);
    expect(field[3 * width + 2]).toBe(2);
  });

  it("the origin tile itself has distance 0", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const field = distanceField(tiles, width, height, 2, 2);
    expect(field[2 * width + 2]).toBe(0);
  });

  it("is symmetric: if A reaches B then B reaches A", () => {
    for (let i = 0; i < 200; i++) {
      const level = generateLevel(`sym-${i}`, 1 + (i % 3));
      clearBfsCache();
      const { tiles, width, height } = level;
      for (let j = 0; j < 200; j++) {
        const ax = Math.floor(Math.random() * width);
        const ay = Math.floor(Math.random() * height);
        const bx = Math.floor(Math.random() * width);
        const by = Math.floor(Math.random() * height);
        const fieldA = distanceField(tiles, width, height, ax, ay);
        const aReachesB = (fieldA[by * width + bx] ?? -1) >= 0;
        const fieldB = distanceField(tiles, width, height, bx, by);
        const bReachesA = (fieldB[ay * width + ax] ?? -1) >= 0;
        expect(bReachesA).toBe(aReachesB);
      }
    }
  }, 60_000);

  it("a fully walled 60×25 map yields all -1 and terminates", () => {
    const tiles = new Uint8Array(60 * 25).fill(Tile.Wall);
    clearBfsCache();
    const field = distanceField(tiles, 60, 25, 30, 12);
    for (let i = 0; i < field.length; i++) {
      expect(field[i]).toBe(-1);
    }
  });
});

describe("nextStep", () => {
  it("returns null at the origin and on unreachable tiles", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const field = distanceField(tiles, width, height, 2, 2);
    expect(nextStep(field, width, 2, 2)).toBeNull();
  });

  it("from any reachable tile moves strictly closer to the origin", () => {
    const level = generateLevel("step-1", 1);
    clearBfsCache();
    const { tiles, width, height } = level;
    const field = distanceField(tiles, width, height, level.spawn.x, level.spawn.y);
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const d = field[y * width + x];
      if (d === undefined || d <= 0) continue;
      const step = nextStep(field, width, x, y);
      expect(step).not.toBeNull();
      if (!step) continue;
      expect(field[step.y * width + step.x]).toBe(d - 1);
    }
  });

  it("out-of-bounds coordinates return null rather than throwing or wrapping", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const field = distanceField(tiles, width, height, -1, 0);
    expect(Array.from(field).every((v) => v === -1)).toBe(true);
    expect(nextStep(field, width, -1, 0)).toBeNull();
    expect(nextStep(field, width, 0, -1)).toBeNull();
  });
});

describe("cache", () => {
  it("returns a reference-equal field for the same origin within a turn", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const f1 = distanceField(tiles, width, height, 3, 3);
    const f2 = distanceField(tiles, width, height, 3, 3);
    expect(f2).toBe(f1);
  });

  it("recomputes identically after clearBfsCache", () => {
    const { tiles, width, height } = mapFromStrings(OPEN_5);
    const f1 = distanceField(tiles, width, height, 3, 3);
    clearBfsCache();
    const f3 = distanceField(tiles, width, height, 3, 3);
    expect(f3).not.toBe(f1);
    expect(Array.from(f3)).toEqual(Array.from(f1));
  });
});
