import { clearBfsCache } from "../src/game/bfs.js";
import { Tile } from "../src/game/types.js";

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
