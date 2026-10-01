# T03 — Seed derivation and dual RNG streams

**Depends on:** T01
**Spec:** DESIGN.md §0, §1, §1.1–§1.4
**Phase:** 1

## Goal

`src/game/rng.ts`. The seed string becomes a number, and that number becomes two independent,
reproducible random streams. Nothing else in the codebase is allowed to touch randomness.

## Why this comes first

rot.js cannot hash strings and cannot accept an injected RNG. Every other ticket's
determinism guarantee rests on this file, so it ships first and in isolation.

## What to build

### 1. `cyrb53`

The 53-bit string hash exactly as written in DESIGN.md §1.1. Copy it verbatim — the constant
choices are part of the output, and a "cleaned up" variant produces a different hash and
invalidates every seed anyone has ever shared.

### 2. `toSeed`

Coerce a 53-bit float to a 32-bit integer in `[1, 0xFFFFFFFF]`. `0` is excluded because
rot.js computes `seed < 1 ? 1/seed : seed`, and `1/0` → `Infinity` → truncates back to `0`,
which is a valid-looking but broken seed.

### 3. `deriveSeed(seed, level, purpose, attempt = 0)`

Exactly the signature and string format in DESIGN.md §1.2. Attempt 0 omits the `|r{n}` suffix.

### 4. Stream control

```ts
export function beginLevelConstruction(seed: string, level: number, attempt: number): void
export function beginLevelGameplay(seed: string, level: number): void
export function restoreGameplayState(state: RngState): void
export function getGameplayState(): RngState
```

- `beginLevelConstruction` calls `ROT.RNG.setSeed(deriveSeed(seed, level, "gen", attempt))` on
  the **global** singleton.
- `beginLevelGameplay` sets a module-private `playRng = new RNG().setSeed(deriveSeed(seed, level, "play"))`.
- `getGameplayState` / `restoreGameplayState` wrap `getState()` / `setState()`.

`RngState` is `[number, number, number, number]` — the shape rot.js's `getState()` returns.

### 5. The one guard

Export a single function that gameplay code uses for randomness:

```ts
export function gameplayRandom(): number   // delegates to playRng.random()
```

Do not export `playRng` itself. A single chokepoint means the "global RNG is
construction-only" rule is enforceable with one grep, and it makes an audit trivial:

```bash
grep -rn "ROT\.RNG" src/ --include=*.ts   # must only match rng.ts and dungeon.ts
```

## Tests — `test/rng.test.ts`

- [ ] `deriveSeed("hello", 1, "gen")` is a stable integer equal to a hard-coded expected value
      (pin it — this is the project's compatibility contract with every seed ever shared)
- [ ] `toSeed` never returns 0, across 10 000 random strings
- [ ] The same `(seed, level, purpose, attempt)` always yields the same number
- [ ] `gen` and `play` for the same `(seed, level)` yield **different** numbers
- [ ] Different `attempt` values yield different numbers
- [ ] `deriveSeed` output is accepted by `ROT.RNG.setSeed` and produces a non-degenerate
      stream: two `setSeed` calls with the same value give the same first 100 draws, and
      different values give different first draws
- [ ] `getGameplayState()` → `restoreGameplayState()` round-trips: 100 draws after restore
      equal the 100 draws that would have followed without the round-trip
- [ ] A string of any length (including `"0"`, `""`, 10 000 characters) produces a valid seed

## Done when

- [ ] `test/rng.test.ts` green
- [ ] `grep -rn "ROT\.RNG" src/ --include=*.ts` matches only `rng.ts`
- [ ] `npm run verify` exits 0
