export const GRID_WIDTH = 60;
export const GRID_HEIGHT = 25;

export const FOV_RADIUS = 8;

export const GIVE_UP_TURNS = 6;

export const PLAYER_BASE_HP = 20;
export const PLAYER_BASE_ATK = 4;
export const PLAYER_BASE_DEF = 1;

export const DROPPED_POTION_CHANCE = 0.35;
export const POTION_HEAL_AMOUNT = 8;

export const MIN_SPAWN_DISTANCE = 5;
export const MAX_SPAWN_PLACEMENT_RETRIES = 20;

export const MAX_ENEMIES_BASE = 3;
export const MAX_ENEMIES_CAP = 10;
export const ENEMY_COUNT_SLOPE = 0.8;
export const DEF_SCALE_LEVELS: readonly number[] = [4, 7, 10];

export const FINAL_LEVEL = 10;
export const GUARDIAN_LEVEL = 10;

export const ITEM_COUNT_DIVISOR = 3;
export const WEAPON_TIER_DIVISOR = 3;
export const ARMOR_TIER_DIVISOR = 4;

export const MESSAGE_LOG_LENGTH = 3;

export const RUN_HISTORY_CAP = 50;

export const SAVE_KEY = "netdev_save_v1";
export const HISTORY_KEY = "netdev_history_v1";

// Glyph colours and terrain tile colours, from DESIGN.md 10.1. Terrain colours
// are backgrounds; the glyph itself is drawn in `defaultFg`, except the stairs.
export const COLORS = {
  defaultFg: "#c0c0c0",
  background: "#000",
  wallBg: "#5a5a5a",
  floorBg: "#2a2a2a",
  doorBg: "#8a6d3b",
  exploredFg: "#4a4a4a",
  stairsFg: "#e0e0e0",
  stairsSealedFg: "#555",
  playerFg: "#ffffff",
  enemyFg: "#e05a5a",
  guardianFg: "#ffdd44",
  itemFg: "#e0c060",
  corpseFg: "#3a3a3a",
} as const;

export const GLYPHS = {
  wall: "#",
  floor: ".",
  door: "+",
  stairs: ">",
  player: "@",
  corpse: "%",
} as const;

export const FONT_SIZE = 14;
export const FONT_FAMILY = "monospace";
