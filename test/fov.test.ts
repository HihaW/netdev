import { describe, expect, it } from "vitest";
import { computeFov, enemyCanSee, isVisible, markExplored } from "../src/game/fov.js";
import { Tile } from "../src/game/types.js";
import { mapFromStrings, openMap } from "./fixtures.js";

const CORRIDOR = ["#######", "#.....#", "#######", "#.....#", "########"];

const DOOR_ROOM = ["#######", "#.....#", "#.###.#", "#.+###", "#.....#", "#######"];

describe("computeFov", () => {
  it("the origin tile is always visible", () => {
    const map = openMap(21, 21);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(10 * 21 + 10)).toBe(true);
  });

  it("includes a tile at Chebyshev distance 8 on an unobstructed origin", () => {
    const map = openMap(21, 21);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(10 * 21 + 2)).toBe(true);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(2 * 21 + 10)).toBe(true);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(10 * 21 + 18)).toBe(true);
  });

  it("excludes a tile at Chebyshev distance 9", () => {
    const map = openMap(21, 21);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(10 * 21 + 1)).toBe(false);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(1 * 21 + 10)).toBe(false);
    expect(computeFov(map.tiles, map.width, map.height, 10, 10, 8).has(19 * 21 + 10)).toBe(false);
  });

  it("a wall blocks vision: a player sees the length of the corridor, not past the corner", () => {
    const map = mapFromStrings(CORRIDOR);
    const visible = computeFov(map.tiles, map.width, map.height, 1, 1, 8);
    for (let x = 1; x <= 5; x++) {
      expect(visible.has(1 * 7 + x)).toBe(true);
    }
    expect(visible.has(3 * 7 + 3)).toBe(false);
  });

  it("reports wall tiles themselves as visible", () => {
    const map = mapFromStrings(CORRIDOR);
    const visible = computeFov(map.tiles, map.width, map.height, 1, 1, 8);
    expect(map.tiles[2 * 7 + 3]).toBe(Tile.Wall);
    expect(visible.has(2 * 7 + 3)).toBe(true);
  });

  it("doors let light through", () => {
    const map = mapFromStrings(DOOR_ROOM);
    expect(computeFov(map.tiles, map.width, map.height, 3, 1, 8).has(1 * 7 + 5)).toBe(true);
  });

  it("leaves unexplored tiles untouched: a wall beyond radius stays unknown", () => {
    const map = openMap(21, 21);
    const explored = new Uint8Array(21 * 21);
    markExplored(explored, computeFov(map.tiles, map.width, map.height, 10, 10, 8));
    expect(explored[10 * 21 + 1]).toBe(0);
    expect(explored[10 * 21 + 18]).toBe(1);
  });

  it("is deterministic for the same inputs", () => {
    const map = openMap(21, 21);
    const a = computeFov(map.tiles, map.width, map.height, 10, 10, 8);
    const b = computeFov(map.tiles, map.width, map.height, 10, 10, 8);
    expect([...a].sort((l, r) => l - r)).toEqual([...b].sort((l, r) => l - r));
  });

  // rot.js#218: precise shadowcasting is not symmetric. "You see B from A" does not
  // imply "you see A from B". Do NOT add a symmetry assertion here — it would fail,
  // and that is not a bug in this code. The BFS in bfs.ts IS symmetric; that one is
  // asserted in bfs.test.ts.
});

describe("explored bitmap", () => {
  it("is cumulative: tiles seen in turn 1 stay explored after walking away", () => {
    const map = openMap(21, 21);
    const explored = new Uint8Array(21 * 21);
    const first = computeFov(map.tiles, map.width, map.height, 3, 3, 8);
    markExplored(explored, first);
    const afterFirst = [...explored].filter((v) => v === 1).length;
    expect(afterFirst).toBe(first.size);

    const second = computeFov(map.tiles, map.width, map.height, 15, 15, 8);
    markExplored(explored, second);
    const afterSecond = [...explored].filter((v) => v === 1).length;
    for (const index of first) {
      expect(explored[index]).toBe(1);
    }
    expect(afterSecond).toBeGreaterThanOrEqual(afterFirst);
    expect(afterSecond).toBeLessThanOrEqual(afterFirst + second.size);
    expect(explored[15 * 21 + 15]).toBe(1);
  });

  it("a new level starts fully unexplored", () => {
    const fresh = new Uint8Array(21 * 21);
    expect(fresh.length).toBe(21 * 21);
    expect([...fresh].some((v) => v === 1)).toBe(false);
  });

  it("isVisible reports current visibility, not memory", () => {
    const map = openMap(21, 21);
    const explored = new Uint8Array(21 * 21);
    const first = computeFov(map.tiles, map.width, map.height, 3, 3, 8);
    markExplored(explored, first);
    const second = computeFov(map.tiles, map.width, map.height, 15, 15, 8);
    const remembered = 3 * 21 + 3;
    expect(isVisible(explored, first, remembered)).toBe(true);
    expect(isVisible(explored, second, remembered)).toBe(false);
    expect(explored[remembered]).toBe(1);
  });
});

describe("enemyCanSee", () => {
  it("returns true when the player is within senses with clear line of sight", () => {
    const map = openMap(21, 21);
    expect(enemyCanSee(map.tiles, map.width, map.height, 10, 10, 8, 15, 12)).toBe(true);
  });

  it("returns false when the player is beyond senses even with clear line of sight", () => {
    const map = openMap(21, 21);
    expect(enemyCanSee(map.tiles, map.width, map.height, 5, 5, 8, 15, 15)).toBe(false);
  });

  it("returns false when the player is within senses but behind a wall", () => {
    const map = mapFromStrings(CORRIDOR);
    expect(map.tiles[3 * 7 + 3]).toBe(Tile.Floor);
    expect(enemyCanSee(map.tiles, map.width, map.height, 1, 1, 8, 3, 3)).toBe(false);
  });

  it("uses each enemy's own senses radius", () => {
    const map = openMap(21, 21);
    expect(enemyCanSee(map.tiles, map.width, map.height, 10, 10, 4, 14, 10)).toBe(true);
    expect(enemyCanSee(map.tiles, map.width, map.height, 10, 10, 3, 14, 10)).toBe(false);
  });

  it("does not mutate explored", () => {
    const map = openMap(21, 21);
    const explored = new Uint8Array(21 * 21);
    markExplored(explored, computeFov(map.tiles, map.width, map.height, 10, 10, 8));
    const before = [...explored];
    enemyCanSee(map.tiles, map.width, map.height, 2, 2, 8, 18, 18);
    expect([...explored]).toEqual(before);
  });

  it("is a pure query: repeated calls agree", () => {
    const map = openMap(21, 21);
    const a = enemyCanSee(map.tiles, map.width, map.height, 4, 4, 8, 9, 9);
    const b = enemyCanSee(map.tiles, map.width, map.height, 4, 4, 8, 9, 9);
    expect(a).toBe(b);
  });
});
