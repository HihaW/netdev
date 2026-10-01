# T07 — Entity model and factories

**Depends on:** T01
**Spec:** PRD.md §7 · DESIGN.md §6.1, §7.1
**Phase:** 1

## Goal

`src/game/types.ts` (the entity half) and `src/game/entities.ts`. One entity type, one array,
one id space, zero special cases.

## The decision this encodes

The original spec had a `GameState` with `entities: Entity[]` alongside a separate
`inventory: Item[]`, and an `Item` interface with **no `x`/`y` at all** — so items had nowhere
to live. Meanwhile stairs, corpses, and doors had no representation.

Everything is one array now, discriminated by `kind`. This is why the renderer has one draw
loop, why removal is one `filter`, and why the save file has one entity collection.

## What to build

### 1. Types

The `Entity` interface from PRD.md §7, plus:

```ts
export type EnemyId = "rat" | "skeleton" | "goblin" | "guardian";
export type ItemId = "potion" | "weapon_1" | "weapon_2" | "weapon_3" | "armor_1" | "armor_2";
export type Kind = "player" | "enemy" | "item" | "corpse";
```

Make the optional-field grouping enforced rather than merely documented. Options, in order of
preference:

1. A discriminated union of four interfaces (`PlayerEntity`, `EnemyEntity`, `ItemEntity`,
   `CorpseEntity`) sharing a base with `kind` as the literal discriminant. Best — TypeScript
   then rejects `{ kind: "item", attackCooldown: 3 }`.
2. One interface with optional fields, as PRD.md §7 shows. Acceptable if the doc stays
   authoritative, but the compiler will not help you.

The PRD shows option 2 for readability. If you implement option 1, update the PRD's snippet to
match — the doc must describe what exists.

### 2. `src/game/entities.ts`

```ts
export function createPlayer(x: number, y: number): PlayerEntity
export function createEnemy(type: EnemyId, x: number, y: number, defScale: number): EnemyEntity
export function createItem(itemId: ItemId, x: number, y: number, stack?: number): ItemEntity
export function createCorpse(from: EnemyEntity): CorpseEntity
```

- Ids are allocated from a monotonic counter as `"e{n}"`, reset per run. Ids are stable within
  a run and are what give enemy iteration order a deterministic tiebreak (T10).
- Stat tables come from `src/data/enemies.ts` (T16) and `src/data/items.ts` (T17). For this
  ticket, create those files with the **full tables from DESIGN.md §6.1 and §7.1 already
  filled in** — the data is specified, so there is no reason to stub it and come back. T16 and
  T17 then add behaviour and wiring, not numbers.
- `defScale` is the `+1 DEF` at levels 4/7/10 (DESIGN.md §6.3). Pass 0 for level 1.
- `createCorpse` keeps `glyph`, `x`, `y`, and `id`; zeroes all four stat fields; sets
  `kind: "corpse"`; copies `type` so the renderer can pick a dim colour.

### 3. Every number belongs in `src/game/config.ts`

Grid size, FOV radius, senses radii, give-up turns, drop chance, spawn distance, item counts,
the colour table — all of it. `DESIGN.md` and `config.ts` must not drift: if you change a
number, change it in `config.ts` and say so in the commit message.

## Tests — `test/entities.test.ts`

- [ ] Ids are unique and strictly increasing within a run
- [ ] Ids reset when a run restarts
- [ ] `createPlayer` gives exactly `hp 20, atk 4, def 1` (DESIGN.md §7.1)
- [ ] Each `EnemyId` produces the exact stat block from DESIGN.md §6.1
- [ ] `createEnemy(type, x, y, 1)` adds exactly 1 DEF and leaves HP/ATK untouched
- [ ] `createCorpse` zeroes hp/maxHp/atk/def, preserves glyph and position, and is not hostile
- [ ] `createItem("potion", x, y)` defaults `stack` to 1
- [ ] Every stat-table id in `data/enemies.ts` and `data/items.ts` is covered by a case
      (a table-driven test over the exported records, so a new id cannot be added untested)
- [ ] A type-level test proves the union rejects a mismatched field (e.g. an item with
      `isAlerted`) — use `@ts-expect-error` and assert it compiles

## Done when

- [ ] `test/entities.test.ts` green
- [ ] PRD.md §7's snippet matches the implemented type (option 1 or 2, but they agree)
- [ ] `npm run verify` exits 0
