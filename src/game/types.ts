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

export interface GameState {
  seed: string;
  level: number;
  turnCount: number;
  player: PlayerEntity;
  map: LevelData;
  entities: Entity[];
  explored: Uint8Array;
  messages: string[];
  visible: Set<number>;
  gameOver: boolean;
}
