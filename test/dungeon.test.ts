import { describe, expect, it } from "vitest";
import { generateLevel, generateUniformLevel, LevelGenerationError } from "../src/game/dungeon.js";
import { clearBfsCache, distanceField } from "../src/game/bfs.js";
import { Tile, type LevelData } from "../src/game/types.js";

const WIDTH = 60;
const HEIGHT = 25;

function isBorderAllWall(tiles: Uint8Array): boolean {
  for (let x = 0; x < WIDTH; x++) {
    if (tiles[x] !== Tile.Wall) return false;
    if (tiles[(HEIGHT - 1) * WIDTH + x] !== Tile.Wall) return false;
  }
  for (let y = 0; y < HEIGHT; y++) {
    if (tiles[y * WIDTH] !== Tile.Wall) return false;
    if (tiles[y * WIDTH + WIDTH - 1] !== Tile.Wall) return false;
  }
  return true;
}

function passesAcceptance(level: LevelData): boolean {
  if (level.rooms.length < 4) return false;
  if (level.tiles[level.spawn.y * level.width + level.spawn.x] !== Tile.Floor) return false;
  clearBfsCache();
  const field = distanceField(level.tiles, level.width, level.height, level.spawn.x, level.spawn.y);
  return (field[level.stairs.y * level.width + level.stairs.x] ?? -1) >= 0;
}

describe("generateLevel", () => {
  it("is deterministic: 200 fixed seeds × levels 1–3, two passes byte-identical", () => {
    for (let i = 0; i < 200; i++) {
      for (let lvl = 1; lvl <= 3; lvl++) {
        const seed = `det-${i}`;
        const a = generateLevel(seed, lvl);
        const b = generateLevel(seed, lvl);
        expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles));
        expect(b.rooms).toEqual(a.rooms);
        expect(b.spawn).toEqual(a.spawn);
        expect(b.stairs).toEqual(a.stairs);
        expect(b.generator).toBe(a.generator);
        expect(b.attempt).toBe(a.attempt);
      }
    }
  }, 60_000);

  it("1000 random seeds at level 1 all pass the three acceptance checks", () => {
    for (let i = 0; i < 1000; i++) {
      const seed = `rand-${Math.random().toString(36).slice(2)}-${i}`;
      const level = generateLevel(seed, 1);
      expect(level.rooms.length).toBeGreaterThanOrEqual(4);
      expect(level.tiles[level.spawn.y * level.width + level.spawn.x]).toBe(Tile.Floor);
      expect(passesAcceptance(level)).toBe(true);
    }
  }, 60_000);

  it("a seed needing a retry lands on the same attempt every time", () => {
    const a = generateLevel("seed-318", 1);
    expect(a.generator).toBe("digger-retry");
    expect(a.attempt).toBeGreaterThan(0);
    expect(a.attempt).toBeLessThan(3);
    const b = generateLevel("seed-318", 1);
    expect(b.generator).toBe(a.generator);
    expect(b.attempt).toBe(a.attempt);
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles));
  });

  it("the uniform fallback is reproducible and passes acceptance", () => {
    const a = generateUniformLevel("fallback-1", 1);
    expect(a.generator).toBe("uniform");
    expect(a.attempt).toBe(3);
    expect(passesAcceptance(a)).toBe(true);
    const b = generateUniformLevel("fallback-1", 1);
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles));
  });

  it("LevelGenerationError carries seed and level", () => {
    const err = new LevelGenerationError("abc", 3);
    expect(err.seed).toBe("abc");
    expect(err.level).toBe(3);
    expect(err.message).toContain("abc");
    expect(err.message).toContain("3");
  });

  it("generation of 10 levels completes in under 100 ms total", () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) generateLevel("perf", i + 1);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe("level shape", () => {
  it("tiles has length 60 × 25", () => {
    const level = generateLevel("shape-1", 1);
    expect(level.tiles.length).toBe(WIDTH * HEIGHT);
    expect(level.width).toBe(WIDTH);
    expect(level.height).toBe(HEIGHT);
  });

  it("rooms.length >= 4 and every room centre is floor", () => {
    for (let i = 0; i < 100; i++) {
      const level = generateLevel(`room-${i}`, 1 + (i % 10));
      expect(level.rooms.length).toBeGreaterThanOrEqual(4);
      for (const room of level.rooms) {
        expect(level.tiles[room.cy * level.width + room.cx]).toBe(Tile.Floor);
      }
    }
  });

  it("the spawn tile is floor", () => {
    for (let i = 0; i < 100; i++) {
      const level = generateLevel(`spawn-${i}`, 1 + (i % 10));
      expect(level.tiles[level.spawn.y * level.width + level.spawn.x]).toBe(Tile.Floor);
    }
  });

  it("the stairs tile is floor or door and reachable from spawn", () => {
    for (let i = 0; i < 100; i++) {
      const level = generateLevel(`stairs-${i}`, 1 + (i % 10));
      const t = level.tiles[level.stairs.y * level.width + level.stairs.x];
      expect(t === Tile.Floor || t === Tile.Door).toBe(true);
      clearBfsCache();
      const field = distanceField(
        level.tiles,
        level.width,
        level.height,
        level.spawn.x,
        level.spawn.y,
      );
      expect(field[level.stairs.y * level.width + level.stairs.x] ?? -1).toBeGreaterThanOrEqual(0);
    }
  });

  it("the border ring is all wall", () => {
    for (let i = 0; i < 100; i++) {
      const level = generateLevel(`border-${i}`, 1 + (i % 10));
      expect(isBorderAllWall(level.tiles)).toBe(true);
    }
  });
});
