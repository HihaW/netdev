export const enum Tile {
  Floor = 0,
  Wall = 1,
  Door = 2,
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface LevelData {
  level: number;
  width: number;
  height: number;
  tiles: Uint8Array;
  rooms: Room[];
  spawn: { x: number; y: number };
  stairs: { x: number; y: number };
  generator: "digger" | "digger-retry" | "uniform";
  attempt: number;
}
