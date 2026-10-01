import type * as ROT from "rot-js";
import { ENEMY_STATS } from "../data/enemies.js";
import { COLORS, GLYPHS } from "../game/config.js";
import { Tile, type Entity, type GameState } from "../game/types.js";
import { stairsSealed } from "../game/turns.js";

export type Visibility = "visible" | "explored" | "unknown";

export interface DrawCall {
  x: number;
  y: number;
  ch: string;
  fg: string;
  bg: string;
}

export function tileVisibility(state: GameState, index: number): Visibility {
  if (state.visible.has(index)) return "visible";
  if (state.explored[index] === 1) return "explored";
  return "unknown";
}

interface TerrainStyle {
  ch: string;
  bg: string;
}

// The tile codes are Tile's numeric values, so the mapping is a table rather
// than a chain of comparisons. The stairs always sit on a room centre, which
// dungeon.test.ts asserts is floor, so they need no tile check of their own.
const TERRAIN_BY_TILE: Record<number, TerrainStyle> = {
  [Tile.Floor]: { ch: GLYPHS.floor, bg: COLORS.floorBg },
  [Tile.Wall]: { ch: GLYPHS.wall, bg: COLORS.wallBg },
  [Tile.Door]: { ch: GLYPHS.door, bg: COLORS.doorBg },
};

const DEFAULT_TERRAIN: TerrainStyle = { ch: GLYPHS.floor, bg: COLORS.floorBg };

export function terrainGlyph(tile: number): string {
  return TERRAIN_BY_TILE[tile]?.ch ?? DEFAULT_TERRAIN.ch;
}

function isStairs(state: GameState, x: number, y: number): boolean {
  return x === state.map.stairs.x && y === state.map.stairs.y;
}

function entityColor(entity: Entity): string {
  if (entity.kind === "item") return COLORS.itemFg;
  if (entity.kind === "corpse") return COLORS.corpseFg;
  if (entity.kind === "enemy") {
    return ENEMY_STATS[entity.type].isBoss ? COLORS.guardianFg : COLORS.enemyFg;
  }
  return COLORS.playerFg;
}

export function renderFrame(state: GameState): DrawCall[] {
  const { map, player, entities } = state;
  const calls: DrawCall[] = [];
  const sealed = stairsSealed(state);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      const visibility = tileVisibility(state, index);
      if (visibility === "unknown") continue;

      const tile: number = map.tiles[index] ?? Tile.Floor;
      const style: TerrainStyle = TERRAIN_BY_TILE[tile] ?? DEFAULT_TERRAIN;
      let ch: string = style.ch;
      let fg: string = COLORS.defaultFg;
      const bg: string = style.bg;

      if (isStairs(state, x, y)) {
        ch = GLYPHS.stairs;
        fg = sealed ? COLORS.stairsSealedFg : COLORS.stairsFg;
      }

      if (visibility === "explored") fg = COLORS.exploredFg;

      calls.push({ x, y, ch, fg, bg });
    }
  }

  const playerIndex = player.y * map.width + player.x;
  if (state.visible.has(playerIndex)) {
    calls.push({
      x: player.x,
      y: player.y,
      ch: player.glyph,
      fg: COLORS.playerFg,
      bg: COLORS.background,
    });
  }

  for (const entity of entities) {
    if (!state.visible.has(entity.y * map.width + entity.x)) continue;
    calls.push({
      x: entity.x,
      y: entity.y,
      ch: entity.glyph,
      fg: entityColor(entity),
      bg: COLORS.background,
    });
  }

  return calls;
}

export function drawFrame(display: ROT.Display, calls: DrawCall[]): void {
  for (const call of calls) {
    display.draw(call.x, call.y, call.ch, call.fg, call.bg);
  }
}
