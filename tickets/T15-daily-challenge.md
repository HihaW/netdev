# T15 — Daily challenge mode

**Depends on:** T13
**Spec:** DESIGN.md §8.4 · PRD.md §1, §5
**Phase:** 3

## Goal

One shared dungeon per UTC calendar day, playable by anyone, comparable with anyone.

## The decision, and why it is not Wordle's

The daily seed is `new Date().toISOString().slice(0, 10)` — the **UTC** calendar date, e.g.
`"2026-09-27"`.

Wordle resets at the player's *local* midnight. That is friendlier to an individual player, but
it means two players in different timezones get **different dungeons on the same calendar
date** — which directly contradicts the share-a-daily premise, and produces a steady trickle of
"why is my friend's daily different from mine?" reports.

UTC makes the daily seed a pure function of the date, so "everyone on Earth plays the same
dungeon today" is literally true. The cost is a rollover hour that is not midnight for some
players. That trade is worth it for a project whose entire premise is seed comparability.

Do not "fix" this to local time. If it bothers you, show the next daily's countdown in the
menu so the rollover hour is not a surprise.

## What to build

`src/game/daily.ts` (per DESIGN.md §10):

```ts
export function dailySeed(now: Date = new Date()): string   // "YYYY-MM-DD", UTC
export function msUntilNextDaily(now: Date = new Date()): number
```

- `dailySeed` must be a pure function of its argument. No ambient clock reads inside it beyond
  the default parameter.
- Start a run in daily mode with `dailySeed()` as the seed string. Everything downstream is
  identical to a normal run — daily mode is just a seed, not a mode. Do not add a
  `daily: true` flag that changes generation.
- The main menu shows the active daily date and the countdown to the next one.
- Daily runs appear in run history like any other run.

## Tests — `test/daily.test.ts`

- [ ] `dailySeed(new Date("2026-09-27T23:59:59Z")) === "2026-09-27"`
- [ ] `dailySeed(new Date("2026-09-28T00:00:00Z")) === "2026-09-28"` — flips exactly at UTC
      midnight, not at local midnight
- [ ] `dailySeed` is identical regardless of the machine's timezone: assert the same `Date`
      instant yields the same string
- [ ] A `Date` at 23:59:59 UTC on the last day of a month and 00:00:00 UTC on the first of the
      next yield correctly formatted, zero-padded dates
- [ ] A `Date` in December/January yields `"2026-12-31"` / `"2027-01-01"` with 4-digit years
- [ ] `dailySeed` is stable across repeated calls in the same day
- [ ] The same daily seed produces the same level 1 layout as a normal run with that seed
- [ ] `msUntilNextDaily` is positive and ≤ 24 hours
- [ ] `msUntilNextDaily` at 23:59:59.999 UTC returns ≤ 1 ms
- [ ] `msUntilNextDaily` is 0 exactly at UTC midnight
- [ ] A daily run's save round-trips like any other run

## Done when

- [ ] `test/daily.test.ts` green
- [ ] The daily date shown in the menu matches the date in a run started from it
- [ ] Two players on different timezones get the same daily layout
- [ ] `npm run verify` exits 0
