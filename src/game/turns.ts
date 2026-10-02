import { ENEMY_STATS } from "../data/enemies.js";
import { ITEMS } from "../data/items.js";
import { chebyshev, clearBfsCache, distanceField, NEIGHBORS, nextStep } from "./bfs.js";
import { blocksAi, isHostile, resolveAttack, toCorpse } from "./combat.js";
import {
  FOV_RADIUS,
  GIVE_UP_TURNS,
  MESSAGE_LOG_LENGTH,
  PLAYER_BASE_ATK,
  PLAYER_BASE_DEF,
  POTION_HEAL_AMOUNT,
} from "./config.js";
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
  type InventoryEntry,
  type ItemEntity,
  type ItemId,
  type LevelData,
  type PlayerEntity,
} from "./types.js";

// `drink` is the one action that comes from a screen rather than from a
// direction key, and it is here rather than in the UI because drinking a potion
// costs a turn: enemies act, FOV recomputes, the counter moves (DESIGN.md 7.2).
export type PlayerAction =
  { kind: "move"; dx: number; dy: number } | { kind: "wait" } | { kind: "drink" };

export interface EffectiveStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  atkBonus: number;
  defBonus: number;
}

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

// A dropped potion lands on the corpse's tile (DESIGN.md 5.2), so a tile can hold
// two entities. entityAt returns whichever comes first, which is the corpse, so
// item lookups need their own search or a drop would be unpickable.
export function itemAt(state: GameState, x: number, y: number): ItemEntity | undefined {
  return state.entities.find((e): e is ItemEntity => e.kind === "item" && e.x === x && e.y === y);
}

export function equippedItem(
  state: GameState,
  category: "weapon" | "armor",
): InventoryEntry | undefined {
  return state.inventory.find((entry) => ITEMS[entry.itemId].category === category);
}

export function potionCount(state: GameState): number {
  return state.inventory
    .filter((entry) => entry.itemId === "potion")
    .reduce((total, entry) => total + entry.stack, 0);
}

// One source of truth for "your ATK" and "your DEF". The HUD and the inventory
// screen both read this, because two of them is a guaranteed bug report.
export function effectiveStats(state: GameState): EffectiveStats {
  const weapon = equippedItem(state, "weapon");
  const armor = equippedItem(state, "armor");
  return {
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    atk: state.player.atk,
    def: state.player.def,
    atkBonus: weapon ? ITEMS[weapon.itemId].atkBonus : 0,
    defBonus: armor ? ITEMS[armor.itemId].defBonus : 0,
  };
}

// Equipment is recorded in the inventory and folded into the player's own stats,
// so combat and the HUD need no idea that equipment exists. Both halves travel in
// the save file, so a resumed run cannot come back lopsided.
function applyEquipment(state: GameState): void {
  let atkBonus = 0;
  let defBonus = 0;
  for (const entry of state.inventory) {
    atkBonus += ITEMS[entry.itemId].atkBonus;
    defBonus += ITEMS[entry.itemId].defBonus;
  }
  state.player.atk = PLAYER_BASE_ATK + atkBonus;
  state.player.def = PLAYER_BASE_DEF + defBonus;
}

export function pickUpItem(state: GameState, item: ItemEntity): void {
  const index = state.entities.indexOf(item);
  if (index >= 0) state.entities.splice(index, 1);

  const def = ITEMS[item.itemId];
  if (def.category === "potion") {
    const stack = state.inventory.find((entry) => entry.itemId === item.itemId);
    if (stack) stack.stack += item.stack;
    else state.inventory.push({ itemId: item.itemId, stack: item.stack });
    pushMessage(state, `You pick up a ${def.name}.`);
    return;
  }

  // A weapon or armour replaces the worn piece of the same kind. The old one is
  // discarded, never dropped, so nothing is added to the floor (DESIGN.md 5.3).
  const category = def.category;
  const replaced = equippedItem(state, category);
  state.inventory = state.inventory.filter((entry) => ITEMS[entry.itemId].category !== category);
  state.inventory.push({ itemId: item.itemId, stack: 1 });
  applyEquipment(state);

  pushMessage(
    state,
    replaced ? `You equip the ${def.name} and discard the old one.` : `You equip the ${def.name}.`,
  );
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

// Returns whether the drink happened, because that is whether a turn is spent.
// Drinking at full health is refused and costs nothing (DESIGN.md 7.2), which is
// why this is a boolean and not a void.
export function drinkPotion(state: GameState): boolean {
  const entry = state.inventory.find((candidate) => candidate.itemId === "potion");
  if (!entry || entry.stack <= 0) {
    pushMessage(state, "You have no potion.");
    return false;
  }
  if (state.player.hp >= state.player.maxHp) {
    pushMessage(state, "You are already at full health.");
    return false;
  }

  // Never overshoots: at 4 HP below the maximum it heals 4, not 8.
  const healed = Math.min(POTION_HEAL_AMOUNT, state.player.maxHp - state.player.hp);
  state.player.hp += healed;
  entry.stack -= 1;
  if (entry.stack <= 0) {
    state.inventory = state.inventory.filter((candidate) => candidate !== entry);
  }
  pushMessage(state, `You drink a potion and recover ${healed} HP.`);
  return true;
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

  // The cadence is armed by swinging, not by standing near (DESIGN.md 6.2):
  // "attackCooldown === 0 and adjacent -> attack, then set attackCooldown = 1".
  // Arming it on a turn with no attack in it cost the player a free window every
  // time the skeleton closed the last step, because the turn it arrived it would
  // spend holding instead of striking.
  const cadence = stats.attackCooldownTurns;
  if (cadence !== undefined && enemy.attackCooldown > 0) {
    enemy.attackCooldown -= 1;
    if (
      enemy.attackCooldown === 0 &&
      playerCanSeeEntity(state.visible, state.map.width, enemy.x, enemy.y)
    ) {
      pushMessage(state, `The ${enemyName(enemy.type)} recovers from its swing.`);
    }
    // When adjacent there is no step to take, so the skeleton simply holds. That
    // hold is the window the player is meant to hit back in.
    if (!adjacent) stepTowardTarget(state, enemy);
    return;
  }

  if (adjacent) {
    enemyAttacksPlayer(state, enemy);
    if (cadence !== undefined) enemy.attackCooldown = cadence;
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
  if (action.kind === "drink") return drinkPotion(state);

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
  // Items are picked up by walking over them, as part of the move that already
  // cost the turn (DESIGN.md 5.3).
  const item = itemAt(state, nx, ny);
  if (item) pickUpItem(state, item);
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
