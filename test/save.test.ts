import { beforeEach, describe, expect, it } from "vitest";
import { FIXED_ISO, STEPS, installTestStorage, makeRng, stepTowardStairs } from "./fixtures.js";
import { NEIGHBORS } from "../src/game/bfs.js";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  HISTORY_KEY,
  RUN_HISTORY_CAP,
  SAVE_KEY,
  SAVE_VERSION,
} from "../src/game/config.js";
import { generateUniformLevel } from "../src/game/dungeon.js";
import { createEnemy, createItem } from "../src/game/entities.js";
import { beginLevelGameplay, gameplayRandom, getGameplayState } from "../src/game/rng.js";
import {
  appendRun,
  decodeBase64,
  deserialize,
  encodeBase64,
  endRun,
  hasSave,
  loadGame,
  readHistory,
  readSave,
  SaveError,
  serialize,
  writeSave,
  type StorageLike,
} from "../src/game/save.js";
import { createGame, resolveTurn } from "../src/game/turns.js";
import { Tile, type GameState, type SaveFile } from "../src/game/types.js";

const TILE_COUNT = GRID_WIDTH * GRID_HEIGHT;

let storage: StorageLike;

beforeEach(() => {
  storage = installTestStorage();
});

// Every field of the state except the message log. The log is deliberately not
// persisted — DESIGN.md 8.2 has no field for it — so it is the one exclusion,
// and it is an exclusion rather than a saved-empty so the test still catches a
// state field that quietly stops round-tripping.
function comparable(state: GameState): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...state };
  delete copy.messages;
  return copy;
}

// A run driven by a scripted input sequence, so the state under test carries
// real enemy AI, corpses, drops, and explored tiles rather than a fresh board.
function scriptedRun(seed: string, turns: number, random: () => number): GameState {
  const state = createGame(seed);
  for (let i = 0; i < turns && !state.gameOver; i++) {
    const roll = random();
    if (roll < 0.5) {
      const step = stepTowardStairs(state);
      if (step) {
        resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
        continue;
      }
    }
    if (roll < 0.6) {
      resolveTurn(state, { kind: "wait" });
      continue;
    }
    const dir = STEPS[Math.floor(random() * STEPS.length)] ?? { dx: 1, dy: 0 };
    resolveTurn(state, { kind: "move", dx: dir.dx, dy: dir.dy });
  }
  return state;
}

// A dead run cannot round-trip: the save is deleted on death, so `gameOver` is
// always false on the far side. Skip those and keep going until there are 50
// live ones, with a bound so a change that kills everything fails loudly.
function liveRuns(count: number, turns: number): GameState[] {
  const random = makeRng(0x5eed);
  const states: GameState[] = [];
  for (let attempt = 0; states.length < count && attempt < count * 20; attempt++) {
    const state = scriptedRun(`save-run-${attempt}`, turns, random);
    if (!state.gameOver) states.push(state);
  }
  return states;
}

function passableNeighbour(state: GameState): { x: number; y: number } | null {
  const { map } = state;
  for (const [dx, dy] of NEIGHBORS) {
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const tile = map.tiles[y * map.width + x];
    if (tile === Tile.Floor || tile === Tile.Door) return { x, y };
  }
  return null;
}

// Put a rat next to a 1 HP player and let it hit them, so the real death path in
// resolveTurn runs rather than a hand-called endRun.
function dieToARat(state: GameState): void {
  const spot = passableNeighbour(state);
  if (!spot) throw new Error("the player spawn has no passable neighbour");
  state.player.hp = 1;
  state.entities.push(createEnemy("rat", spot.x, spot.y, 0));
  expect(resolveTurn(state, { kind: "wait" }).gameOver).toBe(true);
}

describe("schema", () => {
  it("uses the storage keys named in DESIGN.md 8.1", () => {
    expect(SAVE_KEY).toBe("netdev_save_v1");
    expect(HISTORY_KEY).toBe("netdev_history_v1");
  });

  it("writes a version 1 slot for a run", () => {
    const state = createGame("schema-keys");
    const raw = storage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    expect(storage.getItem(HISTORY_KEY)).toBeNull();
    const save = serialize(state);
    expect(save.version).toBe(SAVE_VERSION);
    expect(Object.keys(save).sort()).toEqual(
      [
        "attempt",
        "entities",
        "explored",
        "generator",
        "inventory",
        "kills",
        "level",
        "playRngState",
        "player",
        "savedAt",
        "seed",
        "turnCount",
        "version",
      ].sort(),
    );
    expect(save.explored).toBe(encodeBase64(state.explored));
    expect(save.playRngState).toHaveLength(4);
  });

  it("keeps the player out of the entity list (DESIGN.md 8.2)", () => {
    const state = createGame("schema-player");
    const save = serialize(state);
    expect(save.player.kind).toBe("player");
    expect(save.entities.some((entity) => entity.kind === "player")).toBe(false);
  });
});

describe("round trip", () => {
  it("restores a deep-equal state across 50 scripted runs", () => {
    const states = liveRuns(50, 30);
    expect(states).toHaveLength(50);
    for (const state of states) {
      const restored = deserialize(serialize(state));
      expect(comparable(restored)).toEqual(comparable(state));
    }
    // 50 runs of 30 turns, each regenerating its level from the seed on the way
    // back. Slower than the 5s default, and worth the cost: it is the test that
    // says a resume loses nothing.
  }, 30_000);

  it("regenerates tiles, rooms, spawn and stairs from the seed", () => {
    const states = liveRuns(10, 12);
    expect(states.length).toBeGreaterThan(0);
    for (const state of states) {
      const restored = deserialize(serialize(state));
      expect(restored.map.tiles).toEqual(state.map.tiles);
      expect(restored.map.rooms).toEqual(state.map.rooms);
      expect(restored.map.spawn).toEqual(state.map.spawn);
      expect(restored.map.stairs).toEqual(state.map.stairs);
      expect(restored.map.generator).toBe(state.map.generator);
      expect(restored.map.attempt).toBe(state.map.attempt);
    }
  });

  it("recomputes the visible set instead of saving it", () => {
    const state = createGame("visible-set");
    const restored = deserialize(serialize(state));
    expect(restored.visible).toEqual(state.visible);
    expect(restored.visible.size).toBeGreaterThan(1);
  });

  it("round-trips the explored bitmap exactly, empty, full, and explored", () => {
    for (const fill of [0, 1]) {
      const state = createGame(`explored-${fill}`);
      state.explored.fill(fill);
      const restored = deserialize(serialize(state));
      expect(restored.explored).toEqual(state.explored);
      expect(restored.explored.length).toBe(TILE_COUNT);
    }

    const walked = scriptedRun("explored-walked", 40, makeRng(7));
    expect(walked.explored.some((byte) => byte === 1)).toBe(true);
    expect(deserialize(serialize(walked)).explored).toEqual(walked.explored);
  });

  it("does not reuse an entity id after a resume", () => {
    const state = createGame("id-floor");
    const before = new Set(state.entities.map((entity) => entity.id));
    const restored = loadGame();
    expect(restored).not.toBeNull();
    const fresh = createItem("potion", restored?.player.x ?? 0, restored?.player.y ?? 0);
    expect(before.has(fresh.id)).toBe(false);
    expect(restored?.entities.some((entity) => entity.id === fresh.id)).toBe(false);
  });
});

describe("the gameplay stream", () => {
  it("resumes the exact stream, and the next 100 draws are unchanged", () => {
    const state = createGame("rng-resume");
    // Spend some rolls first, so the save is not captured at its seed.
    for (let i = 0; i < 7; i++) resolveTurn(state, { kind: "wait" });

    const save = serialize(state);
    const expected = Array.from({ length: 100 }, () => gameplayRandom());

    const restored = deserialize(save);
    expect(getGameplayState()).toEqual(save.playRngState);

    const actual = Array.from({ length: 100 }, () => gameplayRandom());
    expect(actual).toEqual(expected);
    expect(restored.turnCount).toBe(state.turnCount);
  });

  it("spends the same stream in a resumed run as in an uninterrupted one", () => {
    const script = [{ kind: "wait" }, { kind: "move", dx: 1, dy: 0 }, { kind: "wait" }] as const;

    // Baseline first, and immediately: the next 100 draws must be taken from the
    // uninterrupted run's stream before any other game re-seeds it.
    const uninterrupted = createGame("stream-parity");
    for (const action of script) resolveTurn(uninterrupted, action);
    const expected = Array.from({ length: 100 }, () => gameplayRandom());

    installTestStorage();
    const interrupted = createGame("stream-parity");
    resolveTurn(interrupted, script[0]);
    // The pause menu's "Save and Quit" is the only trigger mid-level, so this is
    // the one that has to carry the stream.
    writeSave(interrupted);
    const resumed = loadGame();
    expect(resumed).not.toBeNull();
    expect(resumed?.turnCount).toBe(1);
    for (const action of script.slice(1)) {
      if (!resumed) break;
      resolveTurn(resumed, action);
    }

    const actual = Array.from({ length: 100 }, () => gameplayRandom());
    expect(actual).toEqual(expected);
    expect(resumed?.turnCount).toBe(uninterrupted.turnCount);
  });

  it("resumes from the last checkpoint, not the last keystroke (8.3)", () => {
    const state = createGame("checkpoint-honesty");
    for (let i = 0; i < 5; i++) resolveTurn(state, { kind: "wait" });
    expect(state.turnCount).toBe(5);

    // No trigger fired, so the slot still holds the level-entry checkpoint and
    // turnCount says 0. Claiming 5 here would be the dishonest version.
    const resumed = loadGame();
    expect(resumed?.turnCount).toBe(0);
    expect(state.turnCount).toBe(5);
  });
});

describe("level entry", () => {
  it("checkpoints on descend and reloads to the same level", () => {
    const state = createGame("level-entry");
    expect(readSave()?.level).toBe(1);

    let guard = 0;
    while (state.level === 1 && guard < 600) {
      const step = stepTowardStairs(state);
      if (!step) break;
      resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
      guard += 1;
    }
    expect(state.level).toBe(2);
    expect(readSave()?.level).toBe(2);

    const restored = loadGame();
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.level).toBe(2);
    expect(restored.map.level).toBe(2);
    expect(restored.map.tiles).toEqual(state.map.tiles);
    expect(restored.map.rooms).toEqual(state.map.rooms);
    expect(restored.map.stairs).toEqual(state.map.stairs);
    expect(restored.entities).toEqual(state.entities);
    expect(restored.player.x).toBe(state.player.x);
    expect(restored.player.y).toBe(state.player.y);
    expect(restored.kills).toBe(state.kills);
    expect(restored.turnCount).toBe(state.turnCount);
  });

  it("writes the save before the player spends a roll on the new level", () => {
    const state = createGame("checkpoint-timing");
    let guard = 0;
    while (state.level === 1 && guard < 600) {
      const step = stepTowardStairs(state);
      if (!step) break;
      resolveTurn(state, { kind: "move", dx: step.dx, dy: step.dy });
      guard += 1;
    }
    const save = readSave();
    expect(save?.level).toBe(2);

    // The stream captured at level-2 entry is the one level 2 starts from, not
    // the level-1 stream the player spent twenty turns drawing from.
    beginLevelGameplay(state.seed, 2);
    expect(save?.playRngState).toEqual(getGameplayState());
  });
});

describe("two runs, one seed", () => {
  it("produce the same save at the same turn count", () => {
    const first = scriptedRun("identical-save", 25, makeRng(0xc0ffee));
    const second = scriptedRun("identical-save", 25, makeRng(0xc0ffee));

    expect(first.turnCount).toBe(second.turnCount);
    expect(serialize(first)).toEqual(serialize(second));
    expect(JSON.stringify(serialize(first))).toBe(JSON.stringify(serialize(second)));
  });

  it("produce a save that differs from a different seed", () => {
    const first = serialize(scriptedRun("identical-save", 25, makeRng(0xc0ffee)));
    const second = serialize(scriptedRun("other-save", 25, makeRng(0xc0ffee)));
    expect(second.explored).not.toBe(first.explored);
  });
});

describe("base64 codec", () => {
  it("survives the chunk boundary and matches the reference encoder", () => {
    for (const length of [0, 1, 8191, 8192, 8193, TILE_COUNT]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 7 + 3) % 256;

      const text = encodeBase64(bytes);
      expect(text.length).toBe(Math.ceil(length / 3) * 4);
      expect(text).toBe(Buffer.from(bytes).toString("base64"));
      expect(decodeBase64(text)).toEqual(bytes);
    }
  });
});

describe("rejection", () => {
  it("refuses a version it does not know rather than guessing", () => {
    const save = serialize(createGame("version-mismatch"));
    const bumped = { ...save, version: SAVE_VERSION + 1 } as unknown as SaveFile;

    expect(() => deserialize(bumped)).toThrow(SaveError);
    storage.setItem(SAVE_KEY, JSON.stringify(bumped));
    expect(hasSave()).toBe(false);
    expect(readSave()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it("treats malformed JSON as no save instead of crashing", () => {
    storage.setItem(SAVE_KEY, "{ this is not json");
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBeNull();

    storage.setItem(SAVE_KEY, "null");
    expect(hasSave()).toBe(false);

    // Valid JSON, wrong shape: still no save, and still no crash.
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, seed: 42 }));
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBeNull();
  });

  it("rejects an explored bitmap that is not one byte per tile", () => {
    const save = serialize(createGame("bad-bitmap"));
    for (const length of [0, TILE_COUNT - 1, TILE_COUNT + 1]) {
      const broken: SaveFile = { ...save, explored: encodeBase64(new Uint8Array(length)) };
      expect(() => deserialize(broken)).toThrow(SaveError);
      storage.setItem(SAVE_KEY, JSON.stringify(broken));
      expect(hasSave()).toBe(false);
    }
  });

  it("rejects a truncated play stream", () => {
    const save = serialize(createGame("bad-rng"));
    const broken: SaveFile = {
      ...save,
      playRngState: [1, 2, 3] as unknown as SaveFile["playRngState"],
    };
    expect(() => deserialize(broken)).toThrow(SaveError);
  });

  it("rejects an entity of an unknown kind", () => {
    const save = serialize(createGame("bad-entity"));
    const entity = save.entities[0];
    if (!entity) throw new Error("the run spawned no entities to corrupt");
    const broken: SaveFile = {
      ...save,
      entities: [{ ...entity, kind: "dragon" } as unknown as typeof entity],
    };
    expect(() => deserialize(broken)).toThrow(SaveError);
  });

  it("survives base64 that decodes to the wrong number of bytes", () => {
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...serialize(createGame("bad-b64")), explored: "###" }),
    );
    expect(hasSave()).toBe(false);
  });
});

describe("the uniform fallback", () => {
  it("restores a save whose level came from Uniform", () => {
    // A run only reaches Uniform once three Digger attempts fail, which a short
    // seed search cannot promise, so the level is built directly — the same
    // approach test/dungeon.test.ts takes for the fallback.
    const seed = "fallback-1";
    const state = createGame(seed);
    state.map = generateUniformLevel(seed, 1);

    const save = serialize(state);
    expect(save.generator).toBe("uniform");

    const restored = deserialize(save);
    expect(restored.map.generator).toBe("uniform");
    expect(restored.map.attempt).toBe(save.attempt);
    expect(restored.map.tiles).toEqual(state.map.tiles);
    expect(restored.map.rooms).toEqual(state.map.rooms);
  });
});

describe("death", () => {
  it("deletes the save slot, and hasSave() is false afterwards", () => {
    const state = createGame("death-deletes");
    writeSave(state);
    expect(hasSave()).toBe(true);

    dieToARat(state);
    expect(state.gameOver).toBe(true);
    expect(hasSave()).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it("keeps the history after death", () => {
    const state = createGame("death-history");
    writeSave(state);
    dieToARat(state);

    const history = readHistory();
    expect(history).toHaveLength(1);
    const record = history[0];
    expect(record).toEqual({
      seed: "death-history",
      level: 1,
      turns: state.turnCount,
      kills: state.kills,
      cause: "rat",
      won: false,
      endedAt: FIXED_ISO,
    });
  });

  it("records the killing blow as the cause", () => {
    const state = createGame("death-cause");
    const spot = passableNeighbour(state);
    if (!spot) throw new Error("the player spawn has no passable neighbour");
    state.entities.push(createEnemy("skeleton", spot.x, spot.y, 0));
    state.player.hp = 1;

    expect(resolveTurn(state, { kind: "wait" }).gameOver).toBe(true);
    expect(state.deathCause).toBe("skeleton");
    expect(readHistory()[0]?.cause).toBe("skeleton");
  });

  it("counts a player kill", () => {
    const state = createGame("kill-count");
    const spot = passableNeighbour(state);
    if (!spot) throw new Error("the player spawn has no passable neighbour");
    state.entities.push(createEnemy("rat", spot.x, spot.y, 0));
    const before = state.kills;

    // Two bump-to-attacks: a rat has 5 HP and the player has 4 ATK, so two are
    // always enough and the rat never gets the turns it would need to kill.
    for (let i = 0; i < 2; i++) {
      resolveTurn(state, {
        kind: "move",
        dx: spot.x - state.player.x,
        dy: spot.y - state.player.y,
      });
    }

    expect(state.kills).toBe(before + 1);
    expect(state.entities.some((entity) => entity.kind === "corpse")).toBe(true);
    expect(state.gameOver).toBe(false);
  });
});

describe("run history", () => {
  it("is capped at 50 and ordered newest first", () => {
    for (let i = 0; i < RUN_HISTORY_CAP + 20; i++) {
      appendRun({
        seed: `seed-${i}`,
        level: 1 + (i % 10),
        turns: i,
        kills: i,
        cause: i % 2 === 0 ? "rat" : null,
        won: i % 3 === 0,
        endedAt: FIXED_ISO,
      });
    }

    const history = readHistory();
    expect(history).toHaveLength(RUN_HISTORY_CAP);
    expect(history[0]?.seed).toBe(`seed-${RUN_HISTORY_CAP + 19}`);
    expect(history[history.length - 1]?.seed).toBe("seed-20");
  });

  it("is empty when nothing has been recorded", () => {
    expect(readHistory()).toEqual([]);
    storage.setItem(HISTORY_KEY, "not json at all");
    expect(readHistory()).toEqual([]);
  });

  it("drops one unreadable entry rather than the whole list", () => {
    const good = {
      seed: "kept",
      level: 3,
      turns: 40,
      kills: 7,
      cause: "goblin",
      won: false,
      endedAt: FIXED_ISO,
    };
    storage.setItem(HISTORY_KEY, JSON.stringify([good, { seed: 12 }]));
    const history = readHistory();
    expect(history).toEqual([good]);
  });

  it("records a won run as won", () => {
    const state = createGame("victory-record");
    state.level = 10;
    const record = endRun(state, { won: true, endedAt: FIXED_ISO });
    expect(record.won).toBe(true);
    expect(record.level).toBe(10);
    expect(readHistory()[0]?.won).toBe(true);
    expect(hasSave()).toBe(false);
  });
});
