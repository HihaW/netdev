import { describe, expect, it } from "vitest";
import * as ROT from "rot-js";
import {
  beginLevelConstruction,
  beginLevelGameplay,
  cyrb53,
  deriveSeed,
  gameplayRandom,
  getGameplayState,
  restoreGameplayState,
  toSeed,
} from "../src/game/rng.js";

describe("cyrb53", () => {
  it("is deterministic for the same input", () => {
    expect(cyrb53("hello|gen|1")).toBe(cyrb53("hello|gen|1"));
  });

  it("produces different hashes for different inputs", () => {
    expect(cyrb53("hello")).not.toBe(cyrb53("world"));
  });
});

describe("toSeed", () => {
  it("never returns 0 across 10 000 random strings", () => {
    for (let i = 0; i < 10_000; i++) {
      const s = Math.random().toString(36) + i.toString(36);
      const v = toSeed(cyrb53(s));
      expect(v).not.toBe(0);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("deriveSeed", () => {
  it("matches the pinned compatibility value", () => {
    expect(deriveSeed("hello", 1, "gen")).toBe(989392909);
  });

  it("is stable for the same (seed, level, purpose, attempt)", () => {
    expect(deriveSeed("hello", 1, "gen")).toBe(deriveSeed("hello", 1, "gen"));
    expect(deriveSeed("hello", 3, "play", 2)).toBe(deriveSeed("hello", 3, "play", 2));
  });

  it("yields different numbers for gen and play at the same (seed, level)", () => {
    expect(deriveSeed("hello", 1, "gen")).not.toBe(deriveSeed("hello", 1, "play"));
  });

  it("yields different numbers for different attempts", () => {
    const base = deriveSeed("hello", 1, "gen", 0);
    expect(deriveSeed("hello", 1, "gen", 1)).not.toBe(base);
    expect(deriveSeed("hello", 1, "gen", 2)).not.toBe(base);
    expect(deriveSeed("hello", 1, "gen", 1)).not.toBe(deriveSeed("hello", 1, "gen", 2));
  });

  it("produces a valid seed for strings of any length", () => {
    const cases = ["0", "", "a", "x".repeat(10_000)];
    for (const s of cases) {
      const v = deriveSeed(s, 1, "gen");
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("ROT.RNG integration", () => {
  it("accepts deriveSeed output and produces a non-degenerate stream", () => {
    const a = deriveSeed("hello", 1, "gen");
    const b = deriveSeed("world", 1, "gen");

    ROT.RNG.setSeed(a);
    const first = Array.from({ length: 100 }, () => ROT.RNG.getUniform());

    ROT.RNG.setSeed(a);
    const repeat = Array.from({ length: 100 }, () => ROT.RNG.getUniform());
    expect(repeat).toEqual(first);

    ROT.RNG.setSeed(b);
    const other = Array.from({ length: 100 }, () => ROT.RNG.getUniform());
    expect(other).not.toEqual(first);
  });
});

describe("gameplay stream", () => {
  it("getGameplayState → restoreGameplayState round-trips", () => {
    beginLevelGameplay("hello", 1);
    const state = getGameplayState();
    const expected = Array.from({ length: 100 }, () => gameplayRandom());

    restoreGameplayState(state);
    const actual = Array.from({ length: 100 }, () => gameplayRandom());
    expect(actual).toEqual(expected);
  });

  it("beginLevelGameplay is reproducible for the same (seed, level)", () => {
    beginLevelGameplay("hello", 1);
    const first = Array.from({ length: 50 }, () => gameplayRandom());

    beginLevelGameplay("hello", 1);
    const second = Array.from({ length: 50 }, () => gameplayRandom());
    expect(second).toEqual(first);
  });

  it("beginLevelConstruction seeds the global RNG deterministically", () => {
    beginLevelConstruction("hello", 1, 0);
    const first = Array.from({ length: 50 }, () => ROT.RNG.getUniform());

    beginLevelConstruction("hello", 1, 0);
    const second = Array.from({ length: 50 }, () => ROT.RNG.getUniform());
    expect(second).toEqual(first);
  });
});
