import { ENEMY_STATS } from "../data/enemies.js";
import { chebyshev, clearBfsCache, distanceField, NEIGHBORS, nextStep } from "./bfs.js";
import { blocksAi, isHostile, resolveAttack, toCorpse } from "./combat.js";
import { FOV_RADIUS, GIVE_UP_TURNS, MESSAGE_LOG_LENGTH } from "./config.js";
import { generateLevel } from "./dungeon.js";
import { createItem, resetEntityIds } from "./entities.js";
import { computeFov, enemyCanSee, markExplored, playerCanSeeEntity } from "./fov.js";
import { beginLevelGameplay } from "./rng.js";
import { endRun, writeSave } from "./save.js";
import { placeEntities } from "./spawn.js";
import {
  Tile,
  type EnemyEntity,
  type Entity,
  type GameState,
  type ItemId,
  type LevelData,
  type PlayerEntity,
} from "./types.js";

export type PlayerAction = { kind: "move"; dx: number; dy: number } | { kind: "wait" };

export interface TurnOutcome {
  consumed: boolean;
  aborted: boolean;
  descended: boolean;
  gameOver: boolean;
}

export interface LevelScoped {
  map: LevelData;
  player: PlayerEntity;
  entities: Entity[];
  explored: Uint8Array;
}

export function enemyName(type: EnemyEntity["type"]): string {
  return ENEMY_STATS[type].name.toLowerCase();
}

export function idNumber(id: string): number {
  return Number(id.slice(1));
}

export function pushMessage(state: GameState, line: string): void {
  state.messages.push(line);
  if (state.messages.length > MESSAGE_LOG_LENGTH) {
    state.messages.splice(0, state.messages.length - MESSAGE_LOG_LENGTH);
  }
}

export function refreshFov(state: GameState): void {
  const { map, player } = state;
  state.visible = computeFov(map.tiles, map.width, map.height, player.x, player.y, FOV_RADIUS);
  markExplored(state.explored, state.visible);
}

export function stairsSealed(state: GameState): boolean {
  return state.entities.some((e) => e.kind === "enemy" && ENEMY_STATS[e.type].isBoss === true);
}

export function entityAt(state: GameState, x: number, y: number): Entity | undefined {
  return state.entities.find((e) => e.x === x && e.y === y);
}

export function enemiesInOrder(state: GameState): EnemyEntity[] {
  return state.entities
    .filter((e): e is EnemyEntity => e.kind === "enemy")
    .sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

function inBounds(level: LevelData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

function isPassableTile(level: LevelData, x: number, y: number): boolean {
  const t = level.tiles[y * level.width + x];
  return t === Tile.Floor || t === Tile.Door;
}

function isBlocked(state: GameState, x: number, y: number): boolean {
  if (state.player.x === x && state.player.y === y) return true;
  const occupant = entityAt(state, x, y);
  return occupant ? blocksAi(occupant) : false;
}

export function enterLevel(seed: string, level: number): LevelScoped {
  const map = generateLevel(seed, level);
  const placement = placeEntities(map, seed);
  beginLevelGameplay(seed, level);
  clearBfsCache();
  return {
    map,
    player: placement.player,
    entities: [...placement.enemies, ...placement.items],
    explored: new Uint8Array(map.width * map.height),
  };
}

export function createGame(seed: string): GameState {
  resetEntityIds();
  const scoped = enterLevel(seed, 1);
  const state: GameState = {
    seed,
    level: 1,
    turnCount: 0,
    kills: 0,
    deathCause: null,
    player: scoped.player,
    map: scoped.map,
    entities: scoped.entities,
    inventory: [],
    explored: scoped.explored,
    messages: [],
    visible: new Set<number>(),
    gameOver: false,
  };
  refreshFov(state);
  // Starting a run is entering level 1, so it is checkpointed like any other
  // level entry (DESIGN.md 8.3). Construction is complete and the gameplay
  // stream is freshly seeded and unspent, which is exactly the state a resume
  // needs.
  writeSave(state);
  return state;
}

function decayAlert(enemy: EnemyEntity): void {
  enemy.giveUp -= 1;
  if (enemy.giveUp <= 0) {
    enemy.giveUp = 0;
    enemy.isAlerted = false;
    enemy.lastKnown = null;
  }
}

function stepTowardTarget(state: GameState, enemy: EnemyEntity): void {
  const target = enemy.lastKnown;
  if (!target) return;
  const { map } = state;
  const field = distanceField(map.tiles, map.width, map.height, target.x, target.y);
  const step = nextStep(field, map.width, enemy.x, enemy.y);
  if (!step) return;
  if (isBlocked(state, step.x, step.y)) return;
  enemy.x = step.x;
  enemy.y = step.y;
}

function stepAwayFromPlayer(state: GameState, enemy: EnemyEntity): boolean {
  const { map, player } = state;
  const field = distanceField(map.tiles, map.width, map.height, player.x, player.y);
  const here = field[enemy.y * map.width + enemy.x] ?? -1;
  let best: { x: number; y: number } | null = null;
  let bestDist = here;

  for (const [dx, dy] of NEIGHBORS) {
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (!inBounds(map, nx, ny)) continue;
    if (!isPassableTile(map, nx, ny)) continue;
    if (isBlocked(state, nx, ny)) continue;
    const d = field[ny * map.width + nx] ?? -1;
    if (d > bestDist) {
      bestDist = d;
      best = { x: nx, y: ny };
    }
  }

  if (!best) return false;
  enemy.x = best.x;
  enemy.y = best.y;
  return true;
}

function enemyAttacksPlayer(state: GameState, enemy: EnemyEntity): void {
  const result = resolveAttack(enemy, state.player);
  state.player.hp = Math.max(0, state.player.hp - result.damage);
  if (state.player.hp <= 0) {
    state.deathCause = enemy.type;
  }
  if (playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)) {
    pushMessage(state, `The ${enemyName(enemy.type)} hits you for ${result.damage}.`);
  }
}

function actOnEnemy(state: GameState, enemy: EnemyEntity): void {
  const { player } = state;
  const stats = ENEMY_STATS[enemy.type];
  const adjacent = chebyshev(enemy.x, enemy.y, player.x, player.y) <= 1;

  if (stats.fleeBelowHpPct !== undefined && enemy.hp / enemy.maxHp < stats.fleeBelowHpPct) {
    if (stepAwayFromPlayer(state, enemy)) {
      if (playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)) {
        pushMessage(state, `The ${enemyName(enemy.type)} breaks off and runs.`);
      }
      return;
    }
  }

  if (stats.attackCooldownTurns !== undefined) {
    if (enemy.attackCooldown > 0) {
      enemy.attackCooldown -= 1;
      if (enemy.attackCooldown === 0) {
        if (playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)) {
          pushMessage(state, `The ${enemyName(enemy.type)} recovers from its swing.`);
        }
      }
      if (!adjacent) stepTowardTarget(state, enemy);
      return;
    }
    enemy.attackCooldown = stats.attackCooldownTurns;
  }

  if (adjacent) {
    enemyAttacksPlayer(state, enemy);
    return;
  }

  stepTowardTarget(state, enemy);
}

function takeEnemyAction(state: GameState, enemy: EnemyEntity): void {
  const { map, player } = state;
  const canSee = enemyCanSee(
    map.tiles,
    map.width,
    map.height,
    enemy.x,
    enemy.y,
    enemy.senses,
    player.x,
    player.y,
  );
  if (canSee) {
    enemy.isAlerted = true;
    enemy.lastKnown = { x: player.x, y: player.y };
    enemy.giveUp = GIVE_UP_TURNS;
  }
  if (!enemy.isAlerted) return;
  actOnEnemy(state, enemy);
  decayAlert(enemy);
}

function killEnemy(state: GameState, enemy: EnemyEntity, dropItemId: ItemId | null): void {
  const index = state.entities.indexOf(enemy);
  const name = enemyName(enemy.type);
  state.kills += 1;
  if (playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)) {
    pushMessage(state, `The ${name} dies.`);
  }
  if (index >= 0) state.entities[index] = toCorpse(enemy);
  if (dropItemId) {
    state.entities.push(createItem(dropItemId, enemy.x, enemy.y));
    if (playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)) {
      pushMessage(state, `The ${name} drops a ${dropItemId}.`);
    }
  }
}

function applyPlayerAction(state: GameState, action: PlayerAction): boolean {
  if (action.kind === "wait") return true;

  const { map, player } = state;
  const nx = player.x + action.dx;
  const ny = player.y + action.dy;
  if (!inBounds(map, nx, ny)) return false;
  if (!isPassableTile(map, nx, ny)) return false;

  const occupant = entityAt(state, nx, ny);
  if (occupant && isHostile(occupant)) {
    const result = resolveAttack(player, occupant);
    occupant.hp = Math.max(0, occupant.hp - result.damage);
    if (playerCanSeeEntity(state.visible, map.width, occupant.x, occupant.y)) {
      pushMessage(state, `You hit the ${enemyName(occupant.type)} for ${result.damage}.`);
    }
    if (result.killed) killEnemy(state, occupant, result.dropItemId);
    return true;
  }

  if (nx === map.stairs.x && ny === map.stairs.y && stairsSealed(state)) {
    pushMessage(state, "The stairs are sealed.");
    return false;
  }

  player.x = nx;
  player.y = ny;
  return true;
}

function descend(state: GameState): void {
  const nextLevel = state.level + 1;
  const scoped = enterLevel(state.seed, nextLevel);
  state.level = nextLevel;
  state.map = scoped.map;
  state.entities = scoped.entities;
  state.explored = scoped.explored;
  state.player.x = scoped.player.x;
  state.player.y = scoped.player.y;
}

export function resolveTurn(state: GameState, action: PlayerAction): TurnOutcome {
  const consumed = applyPlayerAction(state, action);
  if (!consumed) {
    return { consumed: false, aborted: false, descended: false, gameOver: state.gameOver };
  }

  if (state.player.x === state.map.stairs.x && state.player.y === state.map.stairs.y) {
    descend(state);
    state.turnCount += 1;
    refreshFov(state);
    // 8.3's first trigger: the write happens after construction and after the
    // FOV is honest about the new level, and before the player has spent a
    // single gameplay roll on it.
    writeSave(state);
    return { consumed: true, aborted: false, descended: true, gameOver: false };
  }

  refreshFov(state);

  for (const enemy of enemiesInOrder(state)) {
    takeEnemyAction(state, enemy);
    if (state.player.hp <= 0) {
      state.gameOver = true;
      // 8.3: permadeath. The save goes and the run is remembered.
      endRun(state, { won: false });
      return { consumed: true, aborted: true, descended: false, gameOver: true };
    }
  }

  state.turnCount += 1;
  refreshFov(state);
  return { consumed: true, aborted: false, descended: false, gameOver: false };
}
