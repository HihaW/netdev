# T08 — Spawn placement

**Depends on:** T04, T05, T07
**Spec:** DESIGN.md §2.5, §6.3, §7.3
**Phase:** 1

## Goal

`src/game/spawn.ts`. Given a `LevelData`, produce the player, the enemies, and the items.
All placement randomness comes from the **global** RNG — this file is one of only two permitted
callers (DESIGN.md §0).

## What to build

```ts
export interface Placement {
  player: PlayerEntity;
  enemies: EnemyEntity[];
  items: ItemEntity[];
}

export function placeEntities(level: LevelData, seed: string): Placement
```

### 1. Player

Centre tile of `rooms[0]` (`level.spawn`, already computed in T04). Nothing to do but build
the entity.

### 2. Enemies

- **Level 10 is special-cased: the Guardian spawns alone, and no other enemy spawns.**
  It goes at `level.stairs` — the sealed-stairs rule (DESIGN.md §11) depends on the Guardian
  physically occupying the stairs tile.
- Levels 1–9: count is `min(10, 3 + floor(level * 0.8))`.
- Type is a uniform draw from the set unlocked at that level: Rat L1+, Skeleton L2+, Goblin L4+.
  Use a weight table, not a linear scan, so adding an enemy is a one-line change.
- `defScale` is 1 at levels 4, 7, 10, else 0.
- Placement: a random floor tile in a room **other than `rooms[0]`**, at Chebyshev distance ≥ 5
  from the player spawn, and not already occupied by another entity. Up to 20 retries per
  enemy; if all 20 fail, skip that enemy.

Skipping is deliberate. A level with one fewer rat is fine; a level with a rat inside a wall
is a crash.

### 3. Items

- Candidate count: `floor(nonStartingRoomCount / 3)` — roughly 2–3 per level. Level 10 places
  nothing.
- Type comes from the per-level weighted table in DESIGN.md §7.3.
- **Tier is derived from depth, not rolled:** `weaponTier = clamp(1 + floor((level - 1) / 3), 1, 3)`,
  `armorTier = clamp(1 + floor((level - 1) / 4), 1, 2)`.
- Placement: a random free floor tile in a non-starting room, same retry-and-skip policy as
  enemies.

### 4. Occupancy

One tile holds at most one entity. Maintain a `Set<number>` of occupied tile indices built from
the player first, then enemies, then items — so the order is fixed and reproducible. The stairs
tile is also reserved on level 10.

## Tests — `test/spawn.test.ts`

- [ ] **Determinism:** 100 (seed, level) pairs placed twice produce identical enemy and item
      positions, types, and stats
- [ ] Level 1 produces exactly 3 enemies; level 9 exactly 10
- [ ] No level 1–9 spawns a Goblin; level 3 spawns no Skeleton
- [ ] Level 10 produces **exactly one** entity type, the Guardian, at `level.stairs`
- [ ] Level 10 places no items
- [ ] No enemy is within Chebyshev distance 5 of the player spawn
- [ ] No two entities share a tile, on 200 random levels
- [ ] Every entity is on a passable tile (`Floor` or `Door`)
- [ ] No entity is placed in `rooms[0]`
- [ ] Item count matches `floor(nonStartingRoomCount / 3)`
- [ ] Weapon tier at level 1 is `weapon_1`; at level 7 it is `weapon_3`; armour at level 5 is
      `armor_2`
- [ ] `defScale` is 1 at levels 4, 7, 10 and 0 elsewhere
- [ ] Occupancy is respected across a full 10-level run for one seed

## Done when

- [ ] `test/spawn.test.ts` green
- [ ] `grep -rn "ROT\.RNG" src/ --include=*.ts` matches only `rng.ts`, `dungeon.ts`, `spawn.ts`
- [ ] `grep -rn "Math.random" src/` returns nothing
- [ ] `npm run verify` exits 0
