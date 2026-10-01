# T06 — FOV wrapper and explored bitmap

**Depends on:** T01
**Spec:** DESIGN.md §3.1–§3.3
**Phase:** 1

## Goal

`src/game/fov.ts`. Compute what the player can see, maintain what they have ever seen, and
answer whether a given enemy can see them.

## What to build

### 1. Player FOV

```ts
export function computeFov(
  tiles: Uint8Array, width: number, height: number,
  ox: number, oy: number, radius: number
): Set<number>          // tile indices, or a Uint8Array mask
```

`ROT.FOV.PreciseShadowcasting` with `topology: 8`, radius **8**, origin at the player.

The light-passes callback is `tiles[i] !== Tile.Wall`. Doors (`Tile.Door`, value 2) let light
through — a doorway you cannot see through is worse than a minor realism issue.

**Discard the callback's `visibility` value.** It is `1` for fully lit tiles and fractional
for partially lit ones. v1 has no partial transparency, so record every callback hit as
visible. Do not store fractional values in the mask; a later tile that happens to be
fractionally lit should not read as "less explored" than a fully lit one.

`ROT.FOV` is a namespace, not a singleton — you must `new` the class. It consumes no RNG, so
it cannot perturb the determinism contract.

### 2. Explored bitmap

```ts
export function markExplored(explored: Uint8Array, visible: Set<number>): void
export function isVisible(explored: Uint8Array, visible: Set<number>, index: number): boolean
```

One `Uint8Array(width * height)` of 0/1, owned by the game state, persisted in the save file
(DESIGN.md §8.2). It is **never reset within a level** and is a fresh array on every new level.

### 3. Enemy senses

```ts
export function enemyCanSee(
  tiles, width, height, ex, ey, senses, px, py
): boolean
```

Two-stage, cheapest first:

1. `chebyshev(ex, ey, px, py) > senses` → `false`, no FOV computed
2. otherwise run `PreciseShadowcasting` from the enemy with radius `senses` and test
   membership of the player's tile

This is what makes the FOV a two-way mechanic (DESIGN.md §3.2). It is **not** "the player's FOV
alerts every enemy" — that was the original spec, and it lets a goblin notice you from behind
a wall it has no line of sight to. The distance gate first is also why 10 enemies sensing
per turn is not a performance problem.

`enemyCanSee` is a pure query. It must not mutate `explored` — the explored bitmap is the
*player's* memory, not the enemies'.

### 4. The non-leak rule

DESIGN.md §3.3: any log line revealing an enemy action is emitted only if that enemy is in
the player's **current** FOV. Since unseen enemies are frozen, a log line can never disclose a
position the player cannot see.

Export a single helper that T10 uses for every such message:

```ts
export function playerCanSeeEntity(visible: Set<number>, x: number, y: number): boolean
```

Do not scatter ad-hoc membership checks through the turn loop.

## Tests — `test/fov.test.ts`

- [ ] Radius 8: a tile at Chebyshev distance 9 is **not** visible; at distance 8 it may be
      (it depends on walls, so assert distance 9 from an unobstructed origin)
- [ ] A wall blocks: a player in a corridor sees the length of the corridor and not past the
      corner
- [ ] Doors let light through
- [ ] The origin tile is always visible
- [ ] `markExplored` is cumulative: tiles visible in turn 1 remain explored after the player
      walks away
- [ ] A new level starts with a fully unexplored bitmap
- [ ] `enemyCanSee` returns `false` when the player is beyond `senses`, even with clear line
      of sight
- [ ] `enemyCanSee` returns `false` when the player is within `senses` but behind a wall the
      enemy cannot see through
- [ ] `enemyCanSee` returns `true` when the player is within `senses` with clear line of sight
- [ ] `enemyCanSee` does not mutate `explored`
- [ ] **Symmetry caveat:** shadowcasting is not symmetric (rot.js#218 — "you see B from A"
      does not imply "you see A from B"). Do **not** write a symmetry assertion here. It will
      fail, and it is not a bug in your code. Note it in a comment so the next person does not
      file it as a regression.
