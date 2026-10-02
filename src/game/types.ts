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

export type EnemyId = "rat" | "skeleton" | "goblin" | "guardian";
export type ItemId = "potion" | "weapon_1" | "weapon_2" | "weapon_3" | "armor_1" | "armor_2";

interface EntityBase {
  id: string;
  x: number;
  y: number;
  glyph: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
}

export interface PlayerEntity extends EntityBase {
  kind: "player";
}

export interface EnemyEntity extends EntityBase {
  kind: "enemy";
  type: EnemyId;
  senses: number;
  isAlerted: boolean;
  lastKnown: { x: number; y: number } | null;
  giveUp: number;
  attackCooldown: number;
  // Set while the enemy has spent a turn winding up and will land next turn.
  // Only the Guardian has a wind-up, but the field is on every enemy so the
  // turn loop can read it without asking what kind of enemy it is holding.
  cleaving: boolean;
}

export interface ItemEntity extends EntityBase {
  kind: "item";
  itemId: ItemId;
  stack: number;
}

export interface CorpseEntity extends EntityBase {
  kind: "corpse";
  type: EnemyId;
}

export type Entity = PlayerEntity | EnemyEntity | ItemEntity | CorpseEntity;
export type Kind = Entity["kind"];

// Every field of every entity is a JSON primitive or a JSON object of them, so a
// serialized entity is the entity. DESIGN.md 8.2 names the type; this alias is
// what lets the save schema be written in the spec's vocabulary.
export type SerializedEntity = Entity;

// Potions, the equipped weapon, and the equipped armour all have this shape.
// A potion carries a stack; a weapon or armour always has a stack of 1.
export interface InventoryEntry {
  itemId: ItemId;
  stack: number;
}

// DESIGN.md 8.2. The map is absent on purpose: 8.0 guarantees it is
// reproducible from (seed, level, generator, attempt).
export interface SaveFile {
  version: 1;
  seed: string;
  level: number;
  turnCount: number;
  // Run-wide, not per level, so it is persisted: a resumed run must still be
  // able to report how many enemies it killed (8.4).
  kills: number;
  player: SerializedEntity;
  inventory: InventoryEntry[];
  entities: SerializedEntity[];
  explored: string;
  playRngState: [number, number, number, number];
  generator: LevelData["generator"];
  attempt: number;
  savedAt: string;
}

// DESIGN.md 8.4. `cause` is the id of the enemy that landed the killing blow,
// or null when the run did not end in combat; the game over screen is what
// turns it into a sentence.
export interface RunRecord {
  seed: string;
  level: number;
  turns: number;
  kills: number;
  cause: EnemyId | null;
  won: boolean;
  endedAt: string;
}

export interface GameState {
  seed: string;
  level: number;
  turnCount: number;
  // Run-wide counters. `kills` survives a resume because it is in the save;
  // `deathCause` is the enemy id that ended the run, or null.
  kills: number;
  deathCause: EnemyId | null;
  player: PlayerEntity;
  map: LevelData;
  entities: Entity[];
  inventory: InventoryEntry[];
  explored: Uint8Array;
  messages: string[];
  visible: Set<number>;
  gameOver: boolean;
}
