# T20 — Determinism test suite

**Depends on:** T04, T08, T12
**Spec:** DESIGN.md §0, §8.2 · PRD.md §9
**Phase:** 4 — **RELEASE GATE**

## Goal

Make the project's headline claim falsifiable. Right now "same seed, same dungeon" is a
promise in a markdown file. This ticket turns it into a suite that fails CI when it stops being
true.

It is deliberately the **last** substantive ticket: it audits code that does not fully exist
until T08 and T12 land, and a determinism suite that runs before the thing it verifies is
finished is theatre.

## The claim under test

> Given a seed string `S` and a level number `L`, the dungeon layout, the room list, the door
> positions, the player spawn, the stairs position, every enemy spawn, and every item spawn are
> byte-identical on every machine, every browser, forever.

## What to write — `test/determinism.test.ts`

### 1. The headline test

1000 pseudo-random seeds × 10 levels. For each pair, run `generateLevel` + `placeEntities`
**twice** and assert the two results are deep-equal on `tiles`, `rooms`, `spawn`, `stairs`, and
the full entity list (id, kind, x, y, hp, atk, def, type, itemId, stack).

Seed the test's own seed generator with a fixed constant so a failure is reproducible from the
test name alone. Never use `Math.random()` to pick the 1000 seeds — a non-reproducible test
suite is worse than none.

### 2. The cross-stream test

The one that catches the real bug class. Generate a level, then:

- assert the **global** `ROT.RNG` state is identical after two independent generation passes
  (proves construction is fully determined by the seed)
- assert the **gameplay** RNG state is identical after two passes that each spent the same
  number of combat rolls and drop rolls (proves the split holds)

### 3. The contamination test — the one that actually matters

For 50 seeds: generate a level, then spend 10 000 draws from the **gameplay** RNG, then
regenerate the same level. The regenerated level must be byte-identical to the first.

This is the test that fails the moment someone calls `ROT.RNG.random()` in `combat.ts`, and it
is the reason the global RNG is dedicated to construction. It is the single most valuable test
in the repository. Write it first.

### 4. Save round-trip

- `serialize → deserialize` preserves `playRngState` exactly
- The 100 draws after a round-trip equal the 100 draws that would have followed without it
- A save from level 7 restores to a level 7 with identical tiles, rooms, and enemy positions
- Two runs driven by the same scripted input sequence produce the same save file, byte for
  byte, except for `savedAt`

### 5. Daily purity

`dailySeed(date)` is a pure function: the same `Date` instant yields the same string regardless
of the machine timezone, and it flips exactly at UTC midnight.

### 6. The negative test

Prove the suite would catch a regression. In a scratch branch, add one `ROT.RNG.random()` call
inside `combat.ts`, run the suite, and **confirm it fails**. Then revert.

An unverified determinism test is a test that has never been shown to detect anything. Record
the output in the PR description — "this test fails when I break determinism on purpose" is
worth more than any amount of green checkmarks.

## Tests

- [ ] The headline test: 1000 seeds × 10 levels, two passes, deep-equal
- [ ] Level 1–10 for one fixed seed are individually asserted against a checked-in fixture
      (`.json` of tile arrays) so a change to Digger's behaviour is caught even if the suite is
      run on a different platform
- [ ] The contamination test (10 000 intervening gameplay draws)
- [ ] Global RNG state identical after two passes
- [ ] Gameplay RNG state identical after matched roll sequences
- [ ] Save round-trip preserves the gameplay stream
- [ ] Two identical scripted runs produce byte-identical saves except `savedAt`
- [ ] `dailySeed` is timezone-independent and flips at UTC midnight
- [ ] The negative test was performed and its failure output is recorded
- [ ] `grep -rn "Math.random" src/` returns nothing
- [ ] `grep -rn "ROT.RNG" src/` matches only `rng.ts`, `dungeon.ts`, and `spawn.ts`
- [ ] `grep -rn "Date.now\|performance.now\|new Date()" src/game/` returns nothing outside
      `daily.ts` — no wall-clock value may influence a seed

## Done when

- [ ] All of the above green
- [ ] The suite runs in under 60 seconds (if it is slower, reduce the seed count before
      reducing the assertions — a slow determinism suite stops being run)
- [ ] `npm run verify` exits 0
- [ ] The negative-test evidence is attached to the PR
