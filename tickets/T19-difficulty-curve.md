# T19 — Difficulty curve configuration

**Depends on:** T16, T17
**Spec:** DESIGN.md §6.3, §12
**Phase:** 2

## Goal

Move every difficulty number out of scattered code into `config.ts`, and play the game enough
to know whether the curve works. This ticket is mostly **measurement**, not code.

## What to build

### 1. The curve, as specified

| Rule | Value |
|---|---|
| Enemy count, levels 1–9 | `min(10, 3 + floor(level * 0.8))` — L1→3, L2→4, L5→7, L9→10 |
| Enemy count, level 10 | 0 (the Guardian alone) |
| DEF scaling | `+1` at levels 4, 7, 10. No HP growth, no ATK growth |
| Unlocks | Rat L1 · Skeleton L2 · Goblin L4 |
| Give-up timer | 6 turns without sight |
| Drop chance | 0.35 |
| Item candidates | `floor(nonStartingRooms / 3)` |
| Spawn distance | 5 tiles Chebyshev from spawn |

The flat DEF-only scaling is deliberate. HP and ATK growth turns difficulty into a spreadsheet;
a single DEF step every three levels is tunable by feel, and feel is the only instrument you
have at this scale.

### 2. `src/game/config.ts`

Every number above, plus grid size, FOV radius, colours, glyphs, heal amount, and tier
formulas. Nothing numeric in `spawn.ts`, `turns.ts`, or `combat.ts`.

If you change a number, change it here and say so in the commit message. `DESIGN.md` is the
source of truth; `config.ts` is its executable form. If they disagree, that is a bug.

### 3. Play it, and record the result

At least **ten runs**, logging for each: level reached, cause of death or victory, turns, HP
remaining at each level transition, and how many potions were in the inventory at death.

The questions you are answering:

- Do levels 1–3 teach without killing anyone outright?
- Does the first Skeleton (L2) feel like a wall, or like a slow rat that is easy to kite?
- Does the first Goblin (L4) create a real decision, or is it simply a meat shield?
- Is the give-up timer of 6 turns making enemies forget you too fast or too slowly?
- Is the 35% drop rate leaving you without potions exactly when you need one?
- Is level 10's Guardian a fight or an execution?

### 4. Tuning order

Change **one** number at a time, and in this order:

1. **`GIVE_UP_TURNS`** — if early levels feel quiet or empty, this is the cause, not the stats.
   6 → 4 makes alerted enemies meaningfully more persistent.
2. **`DROP_CHANCE`** — if potions are too scarce, raise it before touching enemy HP. Scarcity
   is a cheaper difficulty lever than enemy stats.
3. **Enemy count formula** — the `0.8` slope and the cap of 10.
4. **DEF scaling step** — moving 4/7/10 to 3/6/9 is a one-line change.

Do not touch HP or ATK growth. DESIGN.md §6.3 specifies none, and adding it converts a
feel-tuned curve into an unplayable one.

Record every change in a `TUNING.md` at the repo root — the number, the old value, the new
value, and the run that motivated it. This is the part of a portfolio piece that shows
iteration discipline, and it costs ten minutes.

## Tests — `test/curve.test.ts`

- [ ] `enemyCount(1) === 3` … `enemyCount(9) === 10`, and `enemyCount(10) === 0`
- [ ] `enemyCount` is monotonically non-decreasing across levels 1–9
- [ ] `enemyCount` never exceeds the cap of 10
- [ ] `defScale(4) === 1`, `defScale(7) === 1`, `defScale(10) === 1`, and 0 elsewhere
- [ ] `defScale` adds DEF without changing HP or ATK, for every enemy type
- [ ] `unlockedTypes(1)`, `unlockedTypes(2)`, `unlockedTypes(4)` are exactly the specified sets
- [ ] `enemyCount(10) === 0` and level 10 spawns no items
- [ ] Every spawned enemy at level N is a type unlocked at level N
- [ ] Over 200 seeds per level, the empirical count of each enemy type is within 10% of the
      uniform-draw expectation (guards against a weighting bug that looks like tuning)
- [ ] No two entities share a tile, across 10 full levels for 20 seeds

## Done when

- [ ] `test/curve.test.ts` green
- [ ] `TUNING.md` exists and records at least ten runs
- [ ] `grep -rnE "[0-9]" src/game/spawn.ts src/game/turns.ts src/game/combat.ts` shows no
      unexplained magic numbers
- [ ] At least one full run to level 10 has been completed
- [ ] `npm run verify` exits 0
