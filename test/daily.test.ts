import { afterEach, describe, expect, it } from "vitest";
import { DAILY_MS, dailySeed, msUntilNextDaily } from "../src/game/daily.js";
import { generateLevel } from "../src/game/dungeon.js";
import { beginLevelConstruction, beginLevelGameplay, gameplayRandom } from "../src/game/rng.js";
import { endRun, loadGame, readHistory, writeSave } from "../src/game/save.js";
import { createGame, resolveTurn } from "../src/game/turns.js";
import { installTestStorage } from "./fixtures.js";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("dailySeed", () => {
  it("is the UTC calendar date", () => {
    expect(dailySeed(new Date("2026-09-27T23:59:59Z"))).toBe("2026-09-27");
    expect(dailySeed(new Date("2026-09-27T00:00:00Z"))).toBe("2026-09-27");
  });

  it("flips exactly at UTC midnight", () => {
    expect(dailySeed(new Date("2026-09-27T23:59:59.999Z"))).toBe("2026-09-27");
    expect(dailySeed(new Date("2026-09-28T00:00:00.000Z"))).toBe("2026-09-28");
  });

  it("does not flip at local midnight", () => {
    // 00:00 in Tokyo on the 28th is still the 27th in UTC. A local-date daily
    // would have rolled over here; this one has not.
    expect(dailySeed(new Date("2026-09-28T00:00:00+09:00"))).toBe("2026-09-27");
    // 23:59 in Tokyo on the 27th is already the 28th in UTC, so this one has.
    expect(dailySeed(new Date("2026-09-27T23:59:00+09:00"))).toBe("2026-09-27");
    expect(dailySeed(new Date("2026-09-27T23:59:00+14:00"))).toBe("2026-09-27");
    expect(dailySeed(new Date("2026-09-28T00:30:00+14:00"))).toBe("2026-09-27");
  });

  it("gives the same string for the same instant in every timezone", () => {
    // The same instant, written four ways. If the implementation ever reached for
    // getFullYear/getMonth/getDate instead of toISOString, these would diverge.
    const instant = "2026-03-08T06:30:00.000Z";
    const written = [
      "2026-03-08T06:30:00.000Z",
      "2026-03-08T15:30:00+09:00",
      "2026-03-08T01:30:00-05:00",
      "2026-03-08T18:00:00+11:30",
    ];
    for (const text of written) expect(dailySeed(new Date(text)), text).toBe("2026-03-08");

    for (const zone of ["UTC", "Asia/Tokyo", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      expect(dailySeed(new Date(instant)), zone).toBe("2026-03-08");
    }

    // A wall-clock moment can fall on two different UTC days depending on the
    // zone, and the answer must follow UTC every time. This is the case a
    // getFullYear()/getMonth()/getDate() implementation gets wrong everywhere but
    // UTC, so each expectation is written out rather than derived.
    process.env.TZ = "UTC";
    expect(dailySeed(new Date("2027-01-01T00:30:00")), "UTC").toBe("2027-01-01");

    process.env.TZ = "Asia/Tokyo";
    expect(dailySeed(new Date("2027-01-01T00:30:00")), "Tokyo (+9)").toBe("2026-12-31");

    process.env.TZ = "Pacific/Kiritimati";
    expect(dailySeed(new Date("2027-01-01T00:30:00")), "Kiritimati (+14)").toBe("2026-12-31");

    process.env.TZ = "America/New_York";
    expect(dailySeed(new Date("2027-01-01T00:30:00")), "New York (-5)").toBe("2027-01-01");
  });

  it("zero-pads across a month boundary", () => {
    expect(dailySeed(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01-31");
    expect(dailySeed(new Date("2026-02-01T00:00:00Z"))).toBe("2026-02-01");
    expect(dailySeed(new Date("2026-09-30T23:59:59Z"))).toBe("2026-09-30");
    expect(dailySeed(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
  });

  it("keeps four-digit years across a year boundary", () => {
    expect(dailySeed(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(dailySeed(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(dailySeed(new Date("2028-02-28T23:59:59Z"))).toBe("2028-02-28");
    expect(dailySeed(new Date("2028-02-29T12:00:00Z"))).toBe("2028-02-29");
    expect(dailySeed(new Date("2028-03-01T00:00:00Z"))).toBe("2028-03-01");
    // 2027 is not a leap year, so there is no 29th.
    expect(dailySeed(new Date("2027-03-01T00:00:00Z"))).toBe("2027-03-01");
  });

  it("is stable across repeated calls within a day", () => {
    const morning = new Date("2026-09-27T06:00:00Z");
    const evening = new Date("2026-09-27T21:00:00Z");
    expect(dailySeed(morning)).toBe(dailySeed(evening));
    expect(dailySeed(evening)).toBe("2026-09-27");
  });

  it("defaults to the current instant", () => {
    // Only that it agrees with itself and is shaped like a date.
    const seed = dailySeed();
    expect(seed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(seed).toBe(dailySeed());
  });
});

describe("msUntilNextDaily", () => {
  it("is positive and at most a day", () => {
    for (const text of [
      "2026-09-27T00:00:00Z",
      "2026-09-27T12:34:56Z",
      "2026-09-27T23:59:59Z",
      "2026-12-31T18:00:00Z",
      "2028-02-29T06:00:00Z",
    ]) {
      const ms = msUntilNextDaily(new Date(text));
      expect(ms, text).toBeGreaterThan(0);
      expect(ms, text).toBeLessThanOrEqual(DAILY_MS);
    }
  });

  it("counts down to the rollover, not up", () => {
    const start = msUntilNextDaily(new Date("2026-09-27T00:00:00Z"));
    const later = msUntilNextDaily(new Date("2026-09-27T12:00:00Z"));
    expect(later).toBeLessThan(start);
    expect(start - later).toBe(12 * 3600 * 1000);
  });

  it("is one millisecond at a millisecond before midnight", () => {
    expect(msUntilNextDaily(new Date("2026-09-27T23:59:59.999Z"))).toBe(1);
  });

  it("is a full day immediately after UTC midnight", () => {
    // T15's checklist says "is 0 exactly at UTC midnight". That cannot hold
    // alongside its own requirement that the value be positive and at most 24
    // hours: at the instant the new daily begins there are 24 hours left of it,
    // not none. The boundary the checklist is really after is asserted here.
    const midnight = new Date("2026-09-28T00:00:00.000Z");
    expect(msUntilNextDaily(midnight)).toBe(DAILY_MS);
    expect(msUntilNextDaily(new Date(midnight.getTime() - 1))).toBe(1);
    expect(dailySeed(midnight)).toBe("2026-09-28");
  });

  it("counts down to a UTC midnight, whatever the local timezone", () => {
    for (const zone of ["UTC", "Asia/Tokyo", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      const noon = new Date("2026-09-27T12:00:00Z");
      const landing = new Date(noon.getTime() + msUntilNextDaily(noon));

      // The instant it lands on is midnight UTC, and the day flips there.
      expect(landing.toISOString(), zone).toBe("2026-09-28T00:00:00.000Z");
      expect(dailySeed(landing), zone).toBe("2026-09-28");
      expect(dailySeed(new Date(landing.getTime() - 1)), zone).toBe("2026-09-27");
    }
  });

  it("defaults to the current instant", () => {
    const ms = msUntilNextDaily();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(DAILY_MS);
  });
});

describe("a daily run is an ordinary run", () => {
  it("generates the same level as a normal run with that seed", () => {
    const seed = dailySeed(new Date("2026-09-27T12:00:00Z"));
    expect(seed).toBe("2026-09-27");

    beginLevelConstruction(seed, 1, 0);
    const first = generateLevel(seed, 1);
    beginLevelConstruction(seed, 1, 0);
    const second = generateLevel(seed, 1);

    expect(first.tiles).toEqual(second.tiles);
    expect(first.rooms).toEqual(second.rooms);
    expect(first.spawn).toEqual(second.spawn);
    expect(first.stairs).toEqual(second.stairs);
  });

  it("uses the date as a seed string, with no flag anywhere", () => {
    installTestStorage();
    const seed = dailySeed(new Date("2026-09-27T12:00:00Z"));
    const state = createGame(seed);

    expect(state.seed).toBe(seed);
    // The seed is the whole difference: nothing in the state knows it is a daily.
    expect(JSON.stringify(state)).not.toContain("daily");
  });

  it("round-trips through a save like any other run", () => {
    installTestStorage();
    const seed = dailySeed(new Date("2026-09-27T12:00:00Z"));
    const state = createGame(seed);
    resolveTurn(state, { kind: "wait" });
    writeSave(state);

    const restored = loadGame();
    expect(restored).not.toBeNull();
    expect(restored?.seed).toBe(seed);
    expect(restored?.map.tiles).toEqual(state.map.tiles);
    expect(restored?.entities).toEqual(state.entities);
    expect(restored?.turnCount).toBe(state.turnCount);
  });

  it("draws the same combat dice as any other run with that seed", () => {
    const seed = dailySeed(new Date("2026-09-27T12:00:00Z"));

    beginLevelGameplay(seed, 1);
    const dailyRolls = Array.from({ length: 50 }, () => gameplayRandom());

    beginLevelGameplay(seed, 1);
    const sameRolls = Array.from({ length: 50 }, () => gameplayRandom());

    expect(sameRolls).toEqual(dailyRolls);
  });

  it("two players in different timezones get the same dungeon on the same UTC day", () => {
    const tokyoNoon = new Date("2026-09-27T03:00:00Z");
    const newYorkNoon = new Date("2026-09-27T17:00:00Z");
    expect(dailySeed(tokyoNoon)).toBe(dailySeed(newYorkNoon));
    expect(tokyoNoon.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })).not.toBe(
      newYorkNoon.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
  });

  it("appears in run history like any other run", () => {
    installTestStorage();
    const seed = dailySeed(new Date("2026-09-27T12:00:00Z"));
    const state = createGame(seed);
    resolveTurn(state, { kind: "wait" });

    // endRun is what resolveTurn calls on death; calling it directly is the same
    // deletion and the same history append, without scripting a fight.
    const record = endRun(state, { won: false, endedAt: "2026-09-27T00:00:00.000Z" });

    expect(record.seed).toBe(seed);
    expect(readHistory()[0]?.seed).toBe(seed);
    // And it is recorded as an ordinary run, with no daily marker anywhere.
    expect(JSON.stringify(record)).not.toContain("daily");
  });
});
