# T17 — Item roster, placement, drops

**Depends on:** T09, T10
**Spec:** DESIGN.md §5.3, §7.1–§7.3
**Phase:** 2

## Goal

`src/data/items.ts` complete, plus drops and the equip/consume plumbing. The original spec had
an `Item` interface with **no `x`/`y`**, so items had nowhere to live. That is fixed in PRD.md §7
— items are entities now — and this ticket makes the loop work.

**Honest note on balance:** potion scarcity is the single biggest difficulty lever in a
roguelike, and a 35% drop rate on a roster of one potion type is a *generous* starting point.
If runs feel too easy, raise the drop chance thresholds in `config.ts` or lower the count
formula before touching enemy stats. Play at least five runs before tuning anything.

## What to build

### 1. The roster (DESIGN.md §7.1)

| id | Glyph | Effect | Source |
|---|---|---|---|
| `potion` | `!` | `hp: 8` | 35% drop, stackable, uncapped |
| `weapon_1` | `/` | `atk: +1` | Found |
| `weapon_2` | `/` | `atk: +2` | Found |
| `weapon_3` | `/` | `atk: +3` | Found |
| `armor_1` | `[` | `def: +1` | Found |
| `armor_2` | `[` | `def: +2` | Found |

The player starts bare-handed: `hp 20, atk 4, def 1`. The first weapon find is therefore a
real decision point, and it is the only one where "should I skip this for the potion" is a live
question.

Weapons and armour are **found, never dropped**. Only potions drop.

### 2. Placement (DESIGN.md §7.3)

- Candidate count per level: `floor(nonStartingRoomCount / 3)` — roughly 2–3 per level
- Type: the per-level weighted table

| Level | Potion | Weapon | Armour |
|---|---|---|---|
| 1–2 | 40% | 40% | 20% |
| 3–5 | 35% | 40% | 25% |
| 6–9 | 30% | 40% | 30% |

- **Tier is derived from depth, not rolled:** `weaponTier = clamp(1 + floor((level - 1) / 3), 1, 3)`,
  `armorTier = clamp(1 + floor((level - 1) / 4), 1, 2)`

Derived tiers matter for the determinism contract: a rolled tier is still deterministic, but a
derived one is also *legible*. A player who reaches level 7 knows the Mithril Edge is the best
blade, and that expectation is part of what makes a seeded run shareable as a story.

- Placement, retry, and skip policy come from T08 — reuse it, do not re-implement
- Level 10 places nothing (the Guardian duels alone)

### 3. Pickup is automatic

Stepping onto an item tile picks it up. Weapons and armour **replace** the equipped piece; the
old one is discarded, not dropped. Potions stack. No `g` key, no confirm (DESIGN.md §5.3).

### 4. Drops

On enemy death, roll `DROP_CHANCE` (0.35) from the **gameplay** RNG (wired in T09). On success,
spawn a `potion` with `stack: 1` on the corpse's tile. This is one of only two consumers of the
gameplay stream — see DESIGN.md §0.

### 5. Every number goes in `config.ts`

Drop chance, per-level weights, tier formulas, heal amount, candidate count. Not inline in
`spawn.ts`.

## Tests — `test/items.test.ts`

- [ ] Every id in the table matches DESIGN.md §7.1 (table-driven)
- [ ] Player starts with `hp 20, atk 4, def 1` and no equipment
- [ ] Walking onto `weapon_1` raises effective ATK by exactly 1
- [ ] Walking onto a second weapon replaces the first; ATK reflects only the new one
- [ ] The replaced weapon is **not** created as a floor item (assert the entity count is
      unchanged apart from the consumed one)
- [ ] Armour replaces armour the same way
- [ ] Walking onto a potion increments `stack` without changing ATK or DEF
- [ ] Potions stack above 5 with no cap error
- [ ] Item count per level matches `floor(nonStartingRoomCount / 3)` on 100 generated levels
- [ ] Level 10 places zero items
- [ ] `weaponTier` is 1 at levels 1–3, 2 at 4–6, 3 at 7–9
- [ ] `armorTier` is 1 at levels 1–4, 2 at levels 5–9
- [ ] The weighted type table's empirical distribution is within 3% of the specified weights
      over 10 000 seeded draws, at level 1 and at level 8
- [ ] The drop roll over 10 000 seeded deaths lands within 1% of 0.35
- [ ] Every drop is a `potion`; no weapon or armour is ever dropped
- [ ] Two runs of the same seed place identical items at identical positions with identical
      stacks

## Done when

- [ ] `test/items.test.ts` green
- [ ] All six item ids appear in a real run
- [ ] `npm run verify` exits 0
