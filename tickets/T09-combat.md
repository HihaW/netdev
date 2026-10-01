# T09 — Combat resolution

**Depends on:** T03, T07
**Spec:** DESIGN.md §5.1–§5.3
**Phase:** 1

## Goal

`src/game/combat.ts`. `calculateDamage`, attack resolution, death, and drops. Small, pure, and
completely covered by a table-driven test.

## What to build

### 1. `calculateDamage(atk, def, roll)`

```
damage = max(1, atk - def + roll)      roll ∈ { -1, 0, +1 }
```

The `max(1, …)` floor means armour alone can never make you invulnerable. This is the single
most important line in the combat system and it is the reason the function is separate and
pure: it is trivially testable, and it must never grow a conditional.

`roll` is drawn by the **caller** from the gameplay RNG, not from inside this function. Passing
it in is what makes the function deterministic and testable without a global.

### 2. `resolveAttack(attacker, defender)`

Bump-to-attack. Moving into a tile occupied by a hostile entity attacks instead of moving.
Moving into a wall is a no-op: no turn consumed, no log line (DESIGN.md §5.1).

Returns an `AttackResult` carrying the damage, whether the defender died, and any drop that
was created — the caller logs and mutates the world, this function does not.

### 3. Death

- HP ≤ 0 → the entity's `kind` becomes `corpse` in place. Stats are zeroed, position and glyph
  preserved, `type` copied. Corpses are cosmetic, walkable, and permanent (DESIGN.md §5.2).
- Enemy death rolls `DROP_CHANCE` (0.35) against the **gameplay** RNG. On success, drop one
  potion. Weapons and armour are never dropped.

### 4. The gameplay RNG's only two consumers

DESIGN.md §0 is explicit: the gameplay stream is consumed by combat damage rolls and the
death drop roll. Nothing else. Every draw goes through `gameplayRandom()` from T03.

If you find yourself wanting a third consumer, that is a design change, not a code change.

### 5. Message lines

Emitted by the caller, never from inside `combat.ts`. Exact wording is in the table below; the
log is part of the spec, not incidental text.

| Event | Line |
|---|---|
| Player hits | `You hit the {enemy} for {n}.` |
| Player misses | `You miss the {enemy}.` |
| Enemy hits | `The {enemy} hits you for {n}.` |
| Enemy misses | `The {enemy} misses you.` |
| Enemy dies | `The {enemy} dies.` |
| Skeleton holds | `The skeleton recovers from its swing.` |
| Goblin flees | `The goblin breaks off and runs.` |
| Drop | `The {enemy} drops a potion.` |

Enemy lines are subject to the non-leak rule (DESIGN.md §3.3) — emitted only when the enemy is
in the player's current FOV. Implement that check in T10 where the FOV set is available; put a
`TODO(T10)` comment here so it is not forgotten.

## Tests — `test/combat.test.ts`

Table-driven, with the full table in the spec:

- [ ] `calculateDamage(4, 1, -1) === 2`, `(4, 1, 0) === 3`, `(4, 1, 1) === 4`
- [ ] `calculateDamage(2, 10, -1) === 1` — the floor holds against heavy armour
- [ ] `calculateDamage(1, 99, -1) === 1` — armour can never make you invulnerable
- [ ] Sweep **every** `(atk, def, roll)` combination in the actual stat table range
      (atk 2–7, def 0–3, roll −1..1) and assert `damage >= 1` and `damage <= atk + 1`
- [ ] A damage roll from a seeded gameplay RNG is reproducible: same state, same sequence
- [ ] `resolveAttack` against a wall consumes no turn and returns a no-op result
- [ ] Death zeroes all four stat fields, preserves `x`/`y`/`glyph`/`id`, sets `kind: "corpse"`
- [ ] A corpse is not hostile and is not passable-by-AI
- [ ] A 0.35 drop chance over 10 000 seeded deaths lands within 1% of 0.35 (proves the roll is
      uniform and not, say, inverted)
- [ ] No drop is ever a weapon or armour, over 10 000 seeded deaths
- [ ] Player death returns a result flagged for the caller to abort the turn (DESIGN.md §4.2
      step 2)

## Done when

- [ ] `test/combat.test.ts` green
- [ ] `grep -rn "Math.random\|ROT.RNG" src/game/combat.ts` returns nothing
- [ ] The `TODO(T10)` for the non-leak check is present and referenced
- [ ] `npm run verify` exits 0
