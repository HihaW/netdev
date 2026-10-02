// The one place in src/game/ that is allowed to read a clock. CONTEXT.md's
// invariant is that no wall-clock value may influence game state; this file is
// the isolated exception it names, and T20 asserts the exception by grepping
// src/game/ for a Date constructor and finding exactly this file — which is why
// the two default parameters below are the only such reads in the directory.
//
// Nothing here reaches a level. A daily run is a normal run whose seed happens to
// be a date, which is the whole design: there is no `daily: true` flag and no
// branch anywhere downstream.

const DAY_MS = 86_400_000;

// The UTC calendar date, "YYYY-MM-DD". Not the local one: Wordle resets at local
// midnight, which means two players in different timezones get different
// dungeons on the same calendar date and the share-a-daily premise is false.
// UTC makes "everyone on Earth plays the same dungeon today" literally true, at
// the cost of a rollover that is not midnight for some players.
//
// A pure function of its argument. The default parameter is the only ambient
// read, so a caller can pin any instant and get the answer back.
export function dailySeed(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Milliseconds until the next UTC midnight, so the menu can say how long is left
// of today's dungeon. Always in (0, DAY_MS]: a millisecond after midnight there
// is a full day left, and a millisecond before it there is one.
export function msUntilNextDaily(now: Date = new Date()): number {
  const midnightUtcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Date.UTC normalises an overflowing day, so this is midnight tomorrow without
  // any month or leap-year arithmetic of our own.
  return midnightUtcToday + DAY_MS - now.getTime();
}

export { DAY_MS as DAILY_MS };
