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

export interface KeyBinding {
  keys: readonly string[];
  action: GameAction;
  help: string;
}

function move(dx: number, dy: number): GameAction {
  return { kind: "move", dx, dy };
}

// The one place a key is described. Both the input layer and the help screen
// read this table, which is the only way they cannot drift apart (DESIGN.md 9,
// and the T13 Done-when requirement).
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { keys: ["ArrowUp", "w"], action: move(0, -1), help: "Move north" },
  { keys: ["ArrowRight", "d"], action: move(1, 0), help: "Move east" },
  { keys: ["ArrowDown", "s"], action: move(0, 1), help: "Move south" },
  { keys: ["ArrowLeft", "a"], action: move(-1, 0), help: "Move west" },
  { keys: ["e"], action: move(1, -1), help: "Move north-east" },
  { keys: ["c"], action: move(1, 1), help: "Move south-east" },
  { keys: ["z"], action: move(-1, 1), help: "Move south-west" },
  { keys: ["q"], action: move(-1, -1), help: "Move north-west" },
  { keys: [".", "5", " "], action: { kind: "wait" }, help: "Wait one turn" },
  { keys: ["i"], action: { kind: "inventory" }, help: "Inventory" },
  { keys: ["Escape"], action: { kind: "pause" }, help: "Pause menu" },
  { keys: ["?"], action: { kind: "help" }, help: "Key reference" },
];

export function buildKeymap(): Record<string, GameAction> {
  const keymap: Record<string, GameAction> = {};
  for (const binding of KEY_BINDINGS) {
    for (const key of binding.keys) keymap[key] = binding.action;
  }
  return keymap;
}

export interface HelpRow {
  keys: string;
  action: string;
}

export function helpRows(): HelpRow[] {
  return KEY_BINDINGS.map((binding) => ({
    keys: binding.keys.join(" / "),
    action: binding.help,
  }));
}

// The facts DESIGN.md states about the controls that are not keys at all. They
// are notes rather than bindings, so there is nothing here to drift out of sync
// with the keymap.
export const HELP_NOTES: readonly string[] = [
  "Bumping a hostile entity attacks it. There is no attack key.",
  "Stepping onto the stairs descends. There is no '>' key.",
  "Walking over an item picks it up. There is no 'g' key.",
];
