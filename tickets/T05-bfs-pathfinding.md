# T05 — BFS distance field and stepping

**Depends on:** T01
**Spec:** DESIGN.md §4.4
**Phase:** 1

## Goal

`src/game/bfs.ts`. A breadth-first search over the tile grid, plus one-step pathing and a
per-turn memo cache.

## Why we implement this ourselves

`ROT.Path.Dijkstra` has no public distance map. Its `_computed` dictionary holds every visited
node but is `private`, and `compute(fromX, fromY, callback)` requires the target coordinate
before it can start — which is exactly what a "distance map from the stairs" needs and exactly
what the library cannot give you. `DESIGN.md` §2.5 of the original spec called for a distance
map that does not exist.

Reaching into `_computed` would be a private-API dependency on an unmaintained library, so
thirty lines of BFS is the better trade. It is also the algorithmic centrepiece of the
portfolio piece, so writing it is the point.

## What to build

```ts
export function distanceField(
  tiles: Uint8Array, width: number, height: number, ox: number, oy: number
): Int32Array                       // -1 = unreachable

export function nextStep(
  field: Int32Array, width: number, x: number, y: number
): { x: number; y: number } | null  // one tile toward the field's origin; null if none

export function clearBfsCache(): void
```

- 8-directional, uniform cost, so a plain FIFO queue is the correct structure — no priority queue
- Unreachable tiles are `-1`, including the origin-adjacent impossible cases
- **`nextStep` walks *down* the gradient toward the origin**, i.e. it returns the neighbouring
  tile with `field === field[here] - 1`. If the caller is standing on the origin, or no such
  neighbour exists (unreachable), return `null`

### No corner cutting — the rule that must not be omitted

A diagonal step from `(x, y)` to `(x + dx, y + dy)` is legal only when **both** `(x + dx, y)`
and `(x, y + dy)` are passable.

Without this rule, entities visibly slip between the corners of two diagonal walls — a bug
players notice immediately and a reviewer spots in a screenshot. With it, the BFS is
symmetric: if B can reach A, A can reach B.

Passable means `Tile.Floor` or `Tile.Door`. Treat out-of-bounds as impassable, not as
wrap-around.

### The memo cache

Cache `distanceField` results for the duration of a single turn, keyed by origin tile
(`` `${x},${y}` ``). Enemies sharing a target share one traversal. Clear the cache at the start
of every turn.

At 10 entities on 1500 tiles the worst case is ~15 000 cell visits per turn, which is free.
The cache is for clarity, not necessity — do not add invalidation complexity, TTLs, or
cross-turn caching. A stale cross-turn cache is a nondeterminism bug waiting to happen.

## Tests — `test/bfs.test.ts`

Build small hand-authored maps as fixtures rather than relying on generated ones, so a failure
points at the algorithm instead of at Digger.

- [ ] On an open 5×5 map, distance from the centre is the Chebyshev distance to every tile
- [ ] A wall fully enclosing a tile makes that tile `-1`, and `nextStep` from it returns `null`
- [ ] A single-tile gap is passable; a diagonal gap between two wall corners is **not**
- [ ] **Symmetry:** for 200 random generated levels and 200 random source tiles, if A reaches B
      then B reaches A. Corner-cutting is the usual cause of asymmetry — this test catches it
- [ ] The origin tile itself has distance 0 and `nextStep` there returns `null`
- [ ] `nextStep` from any reachable tile moves strictly closer to the origin (distance drops
      by exactly 1)
- [ ] Two calls with the same origin within one "turn" return a reference-equal or
      value-equal field; after `clearBfsCache()` the field is recomputed identically
- [ ] Out-of-bounds coordinates return `-1` / `null` rather than throwing or wrapping
- [ ] A fully walled 60×25 map yields all `-1` and terminates (no infinite loop)
