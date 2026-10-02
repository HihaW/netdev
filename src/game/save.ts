import { ENEMY_STATS } from "../data/enemies.js";
import { ITEMS } from "../data/items.js";
import { clearBfsCache } from "./bfs.js";
import {
  FOV_RADIUS,
  GRID_HEIGHT,
  GRID_WIDTH,
  HISTORY_KEY,
  RUN_HISTORY_CAP,
  SAVE_KEY,
  SAVE_VERSION,
} from "./config.js";
import { regenerateLevel } from "./dungeon.js";
import { reserveEntityIds } from "./entities.js";
import { computeFov } from "./fov.js";
import { getGameplayState, restoreGameplayState } from "./rng.js";
import type {
  CorpseEntity,
  EnemyEntity,
  EnemyId,
  Entity,
  GameState,
  InventoryEntry,
  ItemEntity,
  ItemId,
  LevelData,
  PlayerEntity,
  RunRecord,
  SaveFile,
} from "./types.js";

// Persistence is a leaf: it reads the map back out of the seed and never writes
// to `turns.ts`, so `turns.ts` can own the triggers in 8.3 without a cycle.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveError";
  }
}

// `localStorage` and the wall clock are the browser's, and neither exists in the
// node test environment. Both are injected instead of read directly, which also
// keeps `serialize` a pure function of its arguments.
let storageOverride: StorageLike | null = null;
let clockOverride: (() => string) | null = null;

export function setStorage(next: StorageLike | null): void {
  storageOverride = next;
}

export function setSaveClock(next: (() => string) | null): void {
  clockOverride = next;
}

function store(): StorageLike {
  if (storageOverride) return storageOverride;
  const native = globalThis.localStorage;
  if (!native) throw new Error("No storage available — call setStorage() first");
  return native;
}

function now(): string {
  if (!clockOverride) throw new Error("No clock installed — call setSaveClock() first");
  return clockOverride();
}

const BASE64_CHUNK = 8192;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function fail(message: string): never {
  throw new SaveError(`Malformed save: ${message}`);
}

function requireNumber(value: unknown, what: string): number {
  if (!isNumber(value)) fail(`${what} is not a finite number`);
  return value;
}

function requireCount(value: unknown, what: string): number {
  if (!isCount(value)) fail(`${what} is not a non-negative integer`);
  return value;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} is not a string`);
  return value;
}

function requirePosition(value: unknown, what: string): { x: number; y: number } {
  if (!isRecord(value)) fail(`${what} is not an object`);
  return { x: requireNumber(value.x, `${what}.x`), y: requireNumber(value.y, `${what}.y`) };
}

function parseEntity(value: unknown, what: string): Entity {
  if (!isRecord(value)) fail(`${what} is not an object`);
  const id = requireString(value.id, `${what}.id`);
  const x = requireNumber(value.x, `${what}.x`);
  const y = requireNumber(value.y, `${what}.y`);
  const glyph = requireString(value.glyph, `${what}.glyph`);
  const hp = requireNumber(value.hp, `${what}.hp`);
  const maxHp = requireNumber(value.maxHp, `${what}.maxHp`);
  const atk = requireNumber(value.atk, `${what}.atk`);
  const def = requireNumber(value.def, `${what}.def`);

  switch (value.kind) {
    case "player":
      return { kind: "player", id, x, y, glyph, hp, maxHp, atk, def };
    case "enemy": {
      const type = requireEnemyId(value.type, `${what}.type`);
      const enemy: EnemyEntity = {
        kind: "enemy",
        id,
        x,
        y,
        glyph,
        hp,
        maxHp,
        atk,
        def,
        type,
        senses: requireNumber(value.senses, `${what}.senses`),
        isAlerted: value.isAlerted === true,
        lastKnown:
          value.lastKnown === null ? null : requirePosition(value.lastKnown, `${what}.lastKnown`),
        giveUp: requireCount(value.giveUp, `${what}.giveUp`),
        attackCooldown: requireCount(value.attackCooldown, `${what}.attackCooldown`),
      };
      return enemy;
    }
    case "item": {
      const item: ItemEntity = {
        kind: "item",
        id,
        x,
        y,
        glyph,
        hp,
        maxHp,
        atk,
        def,
        itemId: requireItemId(value.itemId, `${what}.itemId`),
        stack: requireCount(value.stack, `${what}.stack`),
      };
      return item;
    }
    case "corpse": {
      const corpse: CorpseEntity = {
        kind: "corpse",
        id,
        x,
        y,
        glyph,
        hp,
        maxHp,
        atk,
        def,
        type: requireEnemyId(value.type, `${what}.type`),
      };
      return corpse;
    }
    default:
      return fail(`${what}.kind is not a known kind`);
  }
}

function requireEnemyId(value: unknown, what: string): EnemyId {
  const id = requireString(value, what);
  if (!(id in ENEMY_STATS)) fail(`${what} is not an enemy id`);
  return id as EnemyId;
}

function requireItemId(value: unknown, what: string): ItemId {
  const id = requireString(value, what);
  if (!(id in ITEMS)) fail(`${what} is not an item id`);
  return id as ItemId;
}

function parseInventory(value: unknown): InventoryEntry[] {
  if (!Array.isArray(value)) fail("inventory is not an array");
  return value.map((entry, index) => {
    if (!isRecord(entry)) fail(`inventory[${index}] is not an object`);
    return {
      itemId: requireItemId(entry.itemId, `inventory[${index}].itemId`),
      stack: requireCount(entry.stack, `inventory[${index}].stack`),
    };
  });
}

function parseRngState(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) fail("playRngState is not 4 numbers");
  const numbers = value.map((n, index) => requireNumber(n, `playRngState[${index}]`));
  return [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!];
}

const GENERATORS: readonly LevelData["generator"][] = ["digger", "digger-retry", "uniform"];

function parseGenerator(value: unknown): LevelData["generator"] {
  const generator = requireString(value, "generator");
  if (!GENERATORS.includes(generator as LevelData["generator"])) fail("generator is unknown");
  return generator as LevelData["generator"];
}

// The validated save, plus the one field that has to be handed back decoded:
// `SaveFile.explored` is base64 (DESIGN.md 8.2) while `GameState.explored` is
// the bitmap itself.
interface ParsedSave {
  file: SaveFile;
  explored: Uint8Array;
}

// Everything the save claims about itself, checked before any of it is used.
// The version is a hard gate (DESIGN.md 8.2): a mismatched save is refused, not
// guessed at.
function parseSaveParts(value: unknown): ParsedSave {
  if (!isRecord(value)) fail("the slot is not an object");
  if (value.version !== SAVE_VERSION) {
    fail(`version ${String(value.version)} is not ${SAVE_VERSION}`);
  }
  const seed = requireString(value.seed, "seed");
  const level = requireCount(value.level, "level");
  const turnCount = requireCount(value.turnCount, "turnCount");
  const kills = requireCount(value.kills, "kills");
  const attempt = requireCount(value.attempt, "attempt");
  const generator = parseGenerator(value.generator);
  const savedAt = requireString(value.savedAt, "savedAt");

  const player = parseEntity(value.player, "player");
  if (player.kind !== "player") fail("player is not a player entity");
  const entities = Array.isArray(value.entities)
    ? value.entities.map((entity, index) => parseEntity(entity, `entities[${index}]`))
    : fail("entities is not an array");
  const inventory = parseInventory(value.inventory);

  const exploredText = requireString(value.explored, "explored");
  let explored: Uint8Array;
  try {
    explored = decodeBase64(exploredText);
  } catch {
    return fail("explored is not valid base64");
  }
  // 8.2 says the bitmap is one byte per tile, and 8.1 gives the grid no other
  // size, so a length that is not width * height is a save that lies.
  if (explored.length !== GRID_WIDTH * GRID_HEIGHT) {
    fail(`explored is ${explored.length} bytes, expected ${GRID_WIDTH * GRID_HEIGHT}`);
  }

  return {
    file: {
      version: SAVE_VERSION,
      seed,
      level,
      turnCount,
      kills,
      player,
      inventory,
      entities,
      explored: exploredText,
      playRngState: parseRngState(value.playRngState),
      generator,
      attempt,
      savedAt,
    },
    explored,
  };
}

export function parseSave(value: unknown): SaveFile {
  return parseSaveParts(value).file;
}

function cloneEntity(entity: Entity): Entity {
  switch (entity.kind) {
    case "player":
      return { ...entity };
    case "enemy":
      return { ...entity, lastKnown: entity.lastKnown ? { ...entity.lastKnown } : null };
    case "item":
    case "corpse":
      return { ...entity };
  }
}

export function serialize(state: GameState): SaveFile {
  return {
    version: SAVE_VERSION,
    seed: state.seed,
    level: state.level,
    turnCount: state.turnCount,
    kills: state.kills,
    player: cloneEntity(state.player),
    inventory: state.inventory.map((entry) => ({ ...entry })),
    entities: state.entities.map(cloneEntity),
    explored: encodeBase64(state.explored),
    playRngState: getGameplayState(),
    generator: state.map.generator,
    attempt: state.map.attempt,
    savedAt: now(),
  };
}

export function deserialize(save: SaveFile): GameState {
  const { file, explored } = parseSaveParts(save);

  // Order matters (DESIGN.md 8.2): regeneration consumes the global stream only,
  // and the gameplay stream is restored after it so that no future change to
  // level construction can disturb a resumed run's dice.
  const map = regenerateLevel(file.seed, file.level, file.generator, file.attempt);
  clearBfsCache();

  const player = file.player as PlayerEntity;
  const state: GameState = {
    seed: file.seed,
    level: file.level,
    turnCount: file.turnCount,
    kills: file.kills,
    deathCause: null,
    player: { ...player },
    map,
    entities: file.entities,
    inventory: file.inventory,
    explored,
    messages: [],
    visible: new Set<number>(),
    gameOver: false,
  };

  reserveEntityIds([player.id, ...file.entities.map((entity) => entity.id)]);
  restoreGameplayState(file.playRngState);
  // The visible set is derived, never saved: FOV is a pure function of the tiles
  // and the player's position, both of which the save fixes.
  state.visible = computeFov(map.tiles, map.width, map.height, player.x, player.y, FOV_RADIUS);
  return state;
}

export function writeSave(state: GameState): void {
  store().setItem(SAVE_KEY, JSON.stringify(serialize(state)));
}

// A corrupt slot reads as no save rather than as a crash, so the main menu can
// offer Continue on exactly the runs that can actually be resumed.
export function readSave(): SaveFile | null {
  const raw = store().getItem(SAVE_KEY);
  if (raw === null) return null;
  try {
    return parseSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return readSave() !== null;
}

export function deleteSave(): void {
  store().removeItem(SAVE_KEY);
}

// A `LevelGenerationError` here is not swallowed: the slot parses, so a failure
// to rebuild its level means the seed no longer reproduces it, and silently
// treating that as "no save" would throw away a run.
export function loadGame(): GameState | null {
  const save = readSave();
  return save === null ? null : deserialize(save);
}

function parseRunRecord(value: unknown): RunRecord | null {
  if (!isRecord(value)) return null;
  try {
    return {
      seed: requireString(value.seed, "seed"),
      level: requireCount(value.level, "level"),
      turns: requireCount(value.turns, "turns"),
      kills: requireCount(value.kills, "kills"),
      cause: value.cause === null ? null : requireEnemyId(value.cause, "cause"),
      won: value.won === true,
      endedAt: requireString(value.endedAt, "endedAt"),
    };
  } catch {
    return null;
  }
}

// History is display data, so one unreadable entry costs that entry and not the
// other 49.
export function readHistory(): RunRecord[] {
  const raw = store().getItem(HISTORY_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseRunRecord)
      .filter((record): record is RunRecord => record !== null)
      .slice(0, RUN_HISTORY_CAP);
  } catch {
    return [];
  }
}

export function appendRun(record: RunRecord): RunRecord[] {
  const history = [record, ...readHistory()].slice(0, RUN_HISTORY_CAP);
  store().setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}

// Permadeath: the save goes, the run is remembered (DESIGN.md 8.3, 8.4).
export function endRun(state: GameState, outcome: { won: boolean; endedAt?: string }): RunRecord {
  const record: RunRecord = {
    seed: state.seed,
    level: state.level,
    turns: state.turnCount,
    kills: state.kills,
    cause: state.deathCause,
    won: outcome.won,
    endedAt: outcome.endedAt ?? now(),
  };
  deleteSave();
  appendRun(record);
  return record;
}
