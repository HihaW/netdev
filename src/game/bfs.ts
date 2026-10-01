import { Tile } from "./types.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function isPassable(tile: number | undefined): boolean {
  return tile === Tile.Floor || tile === Tile.Door;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

const cache = new Map<string, Int32Array>();

export function clearBfsCache(): void {
  cache.clear();
}

export function distanceField(
  tiles: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
): Int32Array {
  const key = `${ox},${oy}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const field = new Int32Array(width * height).fill(-1);
  if (ox < 0 || oy < 0 || ox >= width || oy >= height) {
    cache.set(key, field);
    return field;
  }
  if (!isPassable(tiles[oy * width + ox])) {
    cache.set(key, field);
    return field;
  }

  const origin = oy * width + ox;
  field[origin] = 0;
  const queue: number[] = [origin];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === undefined) break;
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const d = field[cur] ?? -1;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (field[ni] !== -1) continue;
      if (!isPassable(tiles[ni])) continue;
      if (dx !== 0 && dy !== 0) {
        if (!isPassable(tiles[cy * width + nx]) || !isPassable(tiles[ny * width + cx])) {
          continue;
        }
      }
      field[ni] = d + 1;
      queue.push(ni);
    }
  }

  cache.set(key, field);
  return field;
}

export function nextStep(
  field: Int32Array,
  width: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const height = field.length / width;
  const here = field[y * width + x];
  if (here === undefined || here <= 0) return null;

  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (field[ny * width + nx] === here - 1) {
      return { x: nx, y: ny };
    }
  }
  return null;
}
