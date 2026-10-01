import * as ROT from "rot-js";
import { beginLevelConstruction } from "./rng.js";
import { clearBfsCache, distanceField } from "./bfs.js";
import { Tile, type LevelData, type Room } from "./types.js";

export class LevelGenerationError extends Error {
  constructor(
    readonly seed: string,
    readonly level: number,
  ) {
    super(`Could not generate a valid level for seed "${seed}" at level ${level}`);
  }
}

const WIDTH = 60;
const HEIGHT = 25;
const MAX_ATTEMPTS = 3;
const MIN_ROOMS = 4;

type RotMap = InstanceType<typeof ROT.Map.Digger>;

function harvestRooms(raw: ReturnType<RotMap["getRooms"]>): Room[] {
  return raw.map((r) => {
    const [cx = 0, cy = 0] = r.getCenter();
    return {
      x: r.getLeft(),
      y: r.getTop(),
      w: r.getRight() - r.getLeft() + 1,
      h: r.getBottom() - r.getTop() + 1,
      cx,
      cy,
    };
  });
}

function digInto(
  map: InstanceType<typeof ROT.Map.Digger> | InstanceType<typeof ROT.Map.Uniform>,
): Uint8Array {
  const tiles = new Uint8Array(WIDTH * HEIGHT);
  map.create((x, y, value) => {
    tiles[y * WIDTH + x] = value;
  });
  return tiles;
}

function placeStairs(level: LevelData): { x: number; y: number } | null {
  const { tiles, width, height, rooms, spawn } = level;
  const field = distanceField(tiles, width, height, spawn.x, spawn.y);
  let best: { x: number; y: number } | null = null;
  let bestDist = -1;
  for (const room of rooms.slice(1)) {
    const d = field[room.cy * width + room.cx] ?? -1;
    if (d < 0) continue;
    if (d > bestDist) {
      bestDist = d;
      best = { x: room.cx, y: room.cy };
    }
  }
  return best;
}

function evaluate(candidate: LevelData): LevelData | null {
  if (candidate.rooms.length < MIN_ROOMS) return null;
  const spawnTile = candidate.tiles[candidate.spawn.y * candidate.width + candidate.spawn.x];
  if (spawnTile !== Tile.Floor) return null;
  const stairs = placeStairs(candidate);
  if (!stairs) return null;
  return { ...candidate, stairs };
}

export function generateDiggerLevel(seed: string, level: number, attempt: number): LevelData {
  beginLevelConstruction(seed, level, attempt);
  const digger = new ROT.Map.Digger(WIDTH, HEIGHT, {
    dugPercentage: 0.2,
    roomWidth: [3, 9],
    roomHeight: [3, 5],
    corridorLength: [3, 10],
    timeLimit: 3000,
  });
  const tiles = digInto(digger);
  const rooms = harvestRooms(digger.getRooms());
  const first = rooms[0];
  if (!first) throw new LevelGenerationError(seed, level);
  return {
    level,
    width: WIDTH,
    height: HEIGHT,
    tiles,
    rooms,
    spawn: { x: first.cx, y: first.cy },
    stairs: { x: 0, y: 0 },
    generator: attempt > 0 ? "digger-retry" : "digger",
    attempt,
  };
}

export function generateUniformLevel(seed: string, level: number): LevelData {
  beginLevelConstruction(seed, level, 3);
  const uniform = new ROT.Map.Uniform(WIDTH, HEIGHT, {
    roomDugPercentage: 0.1,
    roomWidth: [3, 9],
    roomHeight: [3, 5],
    timeLimit: 3000,
  });
  const tiles = digInto(uniform);
  const rooms = harvestRooms(uniform.getRooms());
  const first = rooms[0];
  if (!first) throw new LevelGenerationError(seed, level);
  const candidate: LevelData = {
    level,
    width: WIDTH,
    height: HEIGHT,
    tiles,
    rooms,
    spawn: { x: first.cx, y: first.cy },
    stairs: { x: 0, y: 0 },
    generator: "uniform",
    attempt: 3,
  };
  clearBfsCache();
  const accepted = evaluate(candidate);
  if (!accepted) throw new LevelGenerationError(seed, level);
  return accepted;
}

export function generateLevel(seed: string, level: number): LevelData {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateDiggerLevel(seed, level, attempt);
    clearBfsCache();
    const accepted = evaluate(candidate);
    if (accepted) return accepted;
  }
  return generateUniformLevel(seed, level);
}
