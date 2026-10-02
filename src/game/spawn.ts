import * as ROT from "rot-js";
import { ENEMY_STATS } from "../data/enemies.js";
import { ITEM_WEIGHT_BANDS, type ItemCategory, type ItemWeights } from "../data/items.js";
import {
  ARMOR_TIER_DIVISOR,
  DEF_SCALE_LEVELS,
  ENEMY_COUNT_SLOPE,
  GUARDIAN_LEVEL,
  ITEM_COUNT_DIVISOR,
  MAX_ENEMIES_BASE,
  MAX_ENEMIES_CAP,
  MAX_SPAWN_PLACEMENT_RETRIES,
  MIN_SPAWN_DISTANCE,
  WEAPON_TIER_DIVISOR,
} from "./config.js";
import { chebyshev } from "./bfs.js";
import { beginLevelConstruction } from "./rng.js";
import { createEnemy, createItem, createPlayer } from "./entities.js";
import {
  Tile,
  type EnemyEntity,
  type EnemyId,
  type ItemEntity,
  type ItemId,
  type LevelData,
  type PlayerEntity,
} from "./types.js";

export interface Placement {
  player: PlayerEntity;
  enemies: EnemyEntity[];
  items: ItemEntity[];
}

interface TilePos {
  x: number;
  y: number;
}

export function enemyCountForLevel(level: number): number {
  return Math.min(MAX_ENEMIES_CAP, MAX_ENEMIES_BASE + Math.floor(level * ENEMY_COUNT_SLOPE));
}

export function defScaleForLevel(level: number): number {
  return DEF_SCALE_LEVELS.includes(level) ? 1 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function weaponTierForLevel(level: number): number {
  return clamp(1 + Math.floor((level - 1) / WEAPON_TIER_DIVISOR), 1, 3);
}

export function armorTierForLevel(level: number): number {
  return clamp(1 + Math.floor((level - 1) / ARMOR_TIER_DIVISOR), 1, 2);
}

function unlockedEnemyWeights(level: number): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const [id, stats] of Object.entries(ENEMY_STATS)) {
    if (stats.unlockLevel <= level) weights[id] = 1;
  }
  return weights;
}

export function itemWeightsForLevel(level: number): ItemWeights {
  const band = ITEM_WEIGHT_BANDS.find((b) => level >= b.minLevel && level <= b.maxLevel);
  if (!band) throw new Error(`No item weight band covers level ${level}`);
  return band.weights;
}

function candidateTiles(level: LevelData): TilePos[] {
  const tiles: TilePos[] = [];
  for (const room of level.rooms.slice(1)) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const t = level.tiles[y * level.width + x];
        if (t === Tile.Floor || t === Tile.Door) tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

function placeTile(
  candidates: TilePos[],
  occupied: Set<number>,
  level: LevelData,
  minDistance: number,
): TilePos | null {
  if (candidates.length === 0) return null;
  for (let attempt = 0; attempt < MAX_SPAWN_PLACEMENT_RETRIES; attempt++) {
    const pick = candidates[ROT.RNG.getUniformInt(0, candidates.length - 1)];
    if (!pick) return null;
    if (occupied.has(pick.y * level.width + pick.x)) continue;
    if (chebyshev(pick.x, pick.y, level.spawn.x, level.spawn.y) < minDistance) continue;
    return pick;
  }
  return null;
}

// The tier is derived from depth rather than rolled, so reaching level 7 means
// the best blade is out there (DESIGN.md 7.3).
export function resolveItemId(category: ItemCategory, level: number): ItemId {
  if (category === "weapon") return `weapon_${weaponTierForLevel(level)}` as ItemId;
  if (category === "armor") return `armor_${armorTierForLevel(level)}` as ItemId;
  return "potion";
}

// Exported so the roster's weights can be tested against the table that drives
// placement, rather than against a copy of it in a test.
export function drawItemCategory(level: number): ItemCategory {
  return ROT.RNG.getWeightedValue(itemWeightsForLevel(level)) as ItemCategory;
}

export function placeEntities(level: LevelData, seed: string): Placement {
  beginLevelConstruction(seed, level.level, level.attempt);

  const player = createPlayer(level.spawn.x, level.spawn.y);
  const enemies: EnemyEntity[] = [];
  const items: ItemEntity[] = [];
  const occupied = new Set<number>([level.spawn.y * level.width + level.spawn.x]);

  if (level.level === GUARDIAN_LEVEL) {
    occupied.add(level.stairs.y * level.width + level.stairs.x);
    enemies.push(
      createEnemy("guardian", level.stairs.x, level.stairs.y, defScaleForLevel(level.level)),
    );
    return { player, enemies, items };
  }

  const candidates = candidateTiles(level);

  const enemyWeights = unlockedEnemyWeights(level.level);
  const defScale = defScaleForLevel(level.level);
  for (let i = 0; i < enemyCountForLevel(level.level); i++) {
    const type = ROT.RNG.getWeightedValue(enemyWeights) as EnemyId;
    const spot = placeTile(candidates, occupied, level, MIN_SPAWN_DISTANCE);
    if (!spot) continue;
    occupied.add(spot.y * level.width + spot.x);
    enemies.push(createEnemy(type, spot.x, spot.y, defScale));
  }

  const itemCount = Math.floor((level.rooms.length - 1) / ITEM_COUNT_DIVISOR);
  for (let i = 0; i < itemCount; i++) {
    const category = drawItemCategory(level.level);
    const spot = placeTile(candidates, occupied, level, 0);
    if (!spot) continue;
    occupied.add(spot.y * level.width + spot.x);
    items.push(createItem(resolveItemId(category, level.level), spot.x, spot.y));
  }

  return { player, enemies, items };
}
