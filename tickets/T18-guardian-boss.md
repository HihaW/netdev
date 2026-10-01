# T18 — Guardian boss and victory

**Depends on:** T16, T17
**Spec:** DESIGN.md §2.5, §5.1, §11
**Phase:** 3

## Goal

Level 10's Guardian, the sealed stairs, and the victory condition. Level 10 is the payoff for
ten levels of escalation, and it should be a positioning and timing test rather than a damage
race.

**Honest note on scope:** the boss was added against the recommendation to ship a plain
10-level game with no boss, on the grounds that a boss is a whole AI plus arena plus balance
problem. Keeping it *minimal* is what makes it affordable: the Guardian reuses the same
per-enemy BFS, the same senses, the same entity struct, and the same adjacency rules as every
other enemy. It adds exactly one new mechanic — a telegraphed cleave. Resist everything else.

## What to build

### 1. The Guardian

`60 HP, 7 ATK, 3 DEF, senses 10` (DESIGN.md §6.1). Spawns **alone** on level 10, at
`level.stairs` (T08 already handles this). Level 10 places no other enemy and no items.

### 2. Sealed stairs

The stairs on level 10 are unusable while the Guardian lives. Stepping onto them is refused, a
log line is emitted, and **no turn is consumed** (DESIGN.md §4.5).

**The seal is not a stored flag.** It is the existence of an entity with `kind: "enemy"` and
`type === "guardian"` on the level:

```ts
export function stairsSealed(entities: Entity[]): boolean {
  return entities.some((e) => e.kind === "enemy" && e.type === "guardian");
}
```

A stored `stairsUnlocked: boolean` would be redundant state that can drift out of sync with the
board — kill the Guardian, forget to clear the flag, and the stairs stay sealed forever. This
is the one place in the project where a derived value is strictly better than a cached one.

Log line: `The stairs will not open while the guardian lives.`

### 3. The telegraphed cleave

At the **start** of its turn, if the player is adjacent, the Guardian spends that turn winding
up. On its **next** turn it lands the cleave.

- Wind-up log: `The guardian winds up a massive swing.`
- Damage: `atk` to the player **and to every entity on a tile orthogonally adjacent to the
  Guardian**. The Guardian itself is not hit by its own cleave.
- Land log: `The guardian's cleave hits you for {n}.`
- Any other adjacency: the normal single-target attack from DESIGN.md §5.1

Because turns are instantaneous (DESIGN.md §4.1), the log line **is** the telegraph. That is
the whole mechanic: one free turn to disengage, and a player who reads the log wins and a
player who does not takes 7 damage to the face.

Both log lines are FOV-gated (DESIGN.md §3.3) — but the Guardian has `senses 10` and the player
must be adjacent for the cleave to trigger, so it is adjacent and therefore visible. Add the
gate anyway for consistency.

### 4. Victory

Guardian dies → corpse → `stairsSealed` returns `false` → the stairs become walkable →
stepping on them triggers the victory screen (T13).

The victory sequence must **delete the save** exactly as death does (DESIGN.md §8.3). A
finished run is not a resumable run, and leaving a save behind means Continue offers a run
that ends immediately.

### 5. Balance against a level-9 player

A player arriving at level 10 has, in the worst case: `hp 20, atk 4-7, def 1-3`, maybe one
potion, and an unknown amount of HP spent getting there. 60 HP against `atk 4` and `def 3`
means 5 damage per hit, so roughly 12 hits — two or three full potions' worth of healing, and
they may not have that.

**This is intended to be hard, and possibly lethal.** But it should be hard because of
positioning and timing, not because the HP pool is arithmetically unwinnable. Play it. If the
Guardian is simply unkillable without a full potion stock, lower its HP to 45 in `config.ts`
and record the change — do not add a second phase or a new mechanic to compensate.

## Tests — `test/guardian.test.ts`

- [ ] Level 10 spawns exactly one entity, the Guardian, at `level.stairs`
- [ ] `stairsSealed` is `true` with the Guardian alive and `false` after it dies
- [ ] `stairsSealed` returns `false` on a Guardian corpse (`kind === "corpse"`) — a very easy
      place to write this wrong
- [ ] Stepping onto sealed stairs is refused, logs, and does **not** increment `turnCount`
- [ ] Stepping onto sealed stairs does not let any enemy act
- [ ] The Guardian's turn 1 while adjacent logs the wind-up and deals no damage
- [ ] Its turn 2 deals cleave damage
- [ ] The cleave hits the player and all orthogonally adjacent entities
- [ ] The cleave does **not** hit diagonal neighbours
- [ ] The cleave does not hit the Guardian itself
- [ ] The cleave kills an adjacent rat corpse-free (a live rat in the crossfire)
- [ ] Leaving adjacency before the cleave lands cancels it, and the Guardian resumes normal
      attacks
- [ ] The Guardian is unreachable-but-alive from level 10 spawn in at least 50% of 200 random
      seeds — if it is always adjacent on spawn, the fight has no opening
- [ ] The wind-up log is FOV-gated
- [ ] Killing the Guardian creates a corpse and unseals the stairs
- [ ] Stepping onto the stairs after the kill shows the victory screen
- [ ] Victory deletes the save slot
- [ ] The victory screen reports level 10 and `won: true`
- [ ] A full run from a fresh seed to victory is completable

## Done when

- [ ] `test/guardian.test.ts` green
- [ ] A full run is completable start to finish
- [ ] `grep -rn "stairsUnlocked\|stairsOpen" src/` returns nothing — the seal is derived
- [ ] `npm run verify` exits 0
