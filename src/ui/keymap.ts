export type Direction = { dx: number; dy: number };

export type GameAction =
  | ({ kind: "move" } & Direction)
  | { kind: "wait" }
  | { kind: "inventory" }
  | { kind: "pause" }
  | { kind: "help" };

export const DIRECTIONS: readonly Direction[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

const up: GameAction = { kind: "move", dx: 0, dy: -1 };
const upRight: GameAction = { kind: "move", dx: 1, dy: -1 };
const right: GameAction = { kind: "move", dx: 1, dy: 0 };
const downRight: GameAction = { kind: "move", dx: 1, dy: 1 };
const down: GameAction = { kind: "move", dx: 0, dy: 1 };
const downLeft: GameAction = { kind: "move", dx: -1, dy: 1 };
const left: GameAction = { kind: "move", dx: -1, dy: 0 };
const upLeft: GameAction = { kind: "move", dx: -1, dy: -1 };
const wait: GameAction = { kind: "wait" };

export function buildKeymap(): Record<string, GameAction> {
  return {
    ArrowUp: up,
    ArrowRight: right,
    ArrowDown: down,
    ArrowLeft: left,
    w: up,
    d: right,
    s: down,
    a: left,
    q: upLeft,
    e: upRight,
    z: downLeft,
    c: downRight,
    ".": wait,
    "5": wait,
    " ": wait,
    i: { kind: "inventory" },
    Escape: { kind: "pause" },
    "?": { kind: "help" },
  };
}
