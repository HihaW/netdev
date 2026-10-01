# T04 — Dungeon generation with the acceptance guard

**Depends on:** T03
**Spec:** DESIGN.md §2.1–§2.5
**Phase:** 1

## Goal

`src/game/dungeon.ts` plus the `LevelData` type. Turn `(seed, level)` into a map, and never
return one that cannot be played.

## The problem this solves

`ROT.Map.Digger` has no room-count parameter — `dugPercentage` is the only density knob — and
its `timeLimit` is wall-clock. A bad seed can in principle yield two rooms, an unreachable
stairs room, or a spawn inside a wall. A daily-challenge game that hands someone an
unwinnable dungeon by date is a bug report, not a roguelike.

## What to build

### 1. Types (`src/game/types.ts`)

`Tile`, `Room`, `LevelData` exactly as in DESIGN.md §2.1 and §2.4. `tiles` is a flat
`Uint8Array` of `width * height`, indexed `y * width + x`.

### 2. `generateDiggerLevel(seed, level)`

`ROT.Map.Digger(60, 25, {...})` with the exact options from DESIGN.md §2.2. Harvest the
result via the `create()` callback — remember the callback's value is the tile code
(`0` floor, `1` wall, `2` door) and that `getFeatures()` **does not exist**; use
`getRooms()` and `getCorridors()` from the `Dungeon` base class.

Rooms come from `getRooms()` with `cx`/`cy` computed as the integer centre.

### 3. Acceptance checks

The three checks in DESIGN.md §2.3, in order:

1. `rooms.length >= 4`
2. spawn tile is `Tile.Floor`
3. the stairs room is reachable from the spawn via BFS (`distance >= 0`)

Stairs are placed **after** checks 1 and 2: the reachable room whose centre has the greatest
BFS distance from the spawn, ties broken toward the lowest room index. Reachability is
filtered *before* taking the maximum, so a disconnected room can never be chosen. If no room
is reachable, check 3 fails.

### 4. The regeneration guard

```ts
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {   // MAX_ATTEMPTS = 3
  beginLevelConstruction(seed, level, attempt);
  const level = buildWithDigger();
  if (passesAcceptance(level)) return level;
}
return generateUniformLevel(seed, level);   // attempt 3
```

The attempt index feeds `deriveSeed`, so the retry sequence is itself deterministic. A seed
that needs two attempts always needs two attempts, in the same order, forever.

### 5. `generateUniformLevel(seed, level)`

`ROT.Map.Uniform(60, 25, {...})` with the options from DESIGN.md §2.3.

**`create()` returns `null`** if its time limit expires before two rooms are connected. The
fallback must null-check. If the Uniform result is also null or fails the same three checks,
throw `LevelGenerationError(seed, level)` (DESIGN.md §2.3). The main menu catches it and shows
a re-roll action rather than crashing.

### 6. `generateLevel(seed, level)`

The public entry point. Returns `LevelData` with `generator` and `attempt` filled in
correctly — both are persisted in the save file (DESIGN.md §8.2) and asserted by T20.

## Tests — `test/dungeon.test.ts`

- [ ] **Determinism:** for 200 fixed seeds × levels 1–3, two consecutive `generateLevel` calls
      produce `tiles` arrays that are byte-identical
- [ ] **No unplayable seed:** for 1000 random seeds at level 1, every result passes all three
      acceptance checks — assert this explicitly, do not assume it
- [ ] **Attempt determinism:** if a seed exhausts attempts and lands on `uniform`, it does so
      every time, with the same `attempt` value
- [ ] `rooms.length >= 4` and every room centre is `Tile.Floor`
- [ ] The spawn tile is `Tile.Floor` and is not inside any wall
- [ ] The stairs tile is `Tile.Floor` or `Tile.Door` and is reachable from spawn
- [ ] `tiles.length === 60 * 25`
- [ ] The border ring of the map is all `Tile.Wall` (a leaked interior tile means an indexing
      bug — this check has caught real ones)
- [ ] `LevelGenerationError` is thrown for a seed known to be unwinnable, if one can be found;
      otherwise assert the guard's attempt sequence directly
- [ ] Generation of 10 levels completes in under 100 ms total (guards against the wall-clock
      `timeLimit` ever becoming load-bearing)

## Done when

- [ ] `test/dungeon.test.ts` green
- [ ] `grep -rn "ROT\.RNG" src/ --include=*.ts` matches only `rng.ts` and `dungeon.ts`
- [ ] `npm run verify` exits 0
