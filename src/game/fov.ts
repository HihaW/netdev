import * as ROT from "rot-js";
import { Tile } from "./types.js";

export function computeFov(
  tiles: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
): Set<number> {
  const visible = new Set<number>();
  const fov = new ROT.FOV.PreciseShadowcasting(
    (x, y) => {
      return tiles[y * width + x] !== Tile.Wall;
    },
    { topology: 8 },
  );
  fov.compute(ox, oy, radius, (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    visible.add(y * width + x);
  });
  return visible;
}

export function markExplored(explored: Uint8Array, visible: Set<number>): void {
  for (const index of visible) {
    if (index >= 0 && index < explored.length) {
      explored[index] = 1;
    }
  }
}

export function isVisible(explored: Uint8Array, visible: Set<number>, index: number): boolean {
  return visible.has(index);
}

export function enemyCanSee(
  tiles: Uint8Array,
  width: number,
  height: number,
  ex: number,
  ey: number,
  senses: number,
  px: number,
  py: number,
): boolean {
  if (Math.max(Math.abs(px - ex), Math.abs(py - ey)) > senses) return false;
  return computeFov(tiles, width, height, ex, ey, senses).has(py * width + px);
}

export function playerCanSeeEntity(
  visible: Set<number>,
  width: number,
  x: number,
  y: number,
): boolean {
  return visible.has(y * width + x);
}
