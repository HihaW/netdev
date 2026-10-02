import { ENEMY_STATS } from "../data/enemies.js";
import { ITEMS } from "../data/items.js";
import { PLAYER_BASE_ATK, PLAYER_BASE_DEF, PLAYER_BASE_HP } from "./config.js";
import type {
  CorpseEntity,
  EnemyEntity,
  EnemyId,
  ItemEntity,
  ItemId,
  PlayerEntity,
} from "./types.js";

let nextId = 1;

export function resetEntityIds(): void {
  nextId = 1;
}

// After a resume, the id counter is still at 1 while the restored entities
// already hold e1..eN. Without raising the floor, the next drop would mint a
// duplicate id and break the ascending-id enemy order the turn loop relies on.
export function reserveEntityIds(ids: Iterable<string>): void {
  let max = 0;
  for (const id of ids) {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  nextId = max + 1;
}

function allocateId(): string {
  const id = `e${nextId}`;
  nextId += 1;
  return id;
}

export function createPlayer(x: number, y: number): PlayerEntity {
  return {
    kind: "player",
    id: allocateId(),
    x,
    y,
    glyph: "@",
    hp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    atk: PLAYER_BASE_ATK,
    def: PLAYER_BASE_DEF,
  };
}

export function createEnemy(type: EnemyId, x: number, y: number, defScale: number): EnemyEntity {
  const stats = ENEMY_STATS[type];
  return {
    kind: "enemy",
    id: allocateId(),
    x,
    y,
    glyph: stats.glyph,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    def: stats.def + defScale,
    type: stats.id,
    senses: stats.senses,
    isAlerted: false,
    lastKnown: null,
    giveUp: 0,
    attackCooldown: 0,
    cleaving: false,
  };
}

export function createItem(itemId: ItemId, x: number, y: number, stack = 1): ItemEntity {
  const def = ITEMS[itemId];
  return {
    kind: "item",
    id: allocateId(),
    x,
    y,
    glyph: def.glyph,
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    itemId: def.id,
    stack,
  };
}

export function createCorpse(from: EnemyEntity): CorpseEntity {
  return {
    kind: "corpse",
    id: from.id,
    x: from.x,
    y: from.y,
    glyph: from.glyph,
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    type: from.type,
  };
}
