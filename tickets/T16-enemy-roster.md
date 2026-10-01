# T16 — Enemy roster and behaviours

**Depends on:** T09, T10
**Spec:** DESIGN.md §6.1–§6.3
**Phase:** 2

## Goal

`src/data/enemies.ts` fully populated, and the three behaviour flags wired into T10's dispatch.
The stat table was created in T07; this ticket adds the behaviour and the unlock schedule.

**Honest note on scope:** the PRD asks for "3–5 enemy types with different behaviour". Three
types ship, and two of them differ mainly in stats and senses. The Skeleton's cadence and the
Goblin's flee are the two genuine behavioural differences. That is a deliberate trade — the
project's priority is deterministic generation, and one more enemy type is worth less than the
determinism suite (T20). If you want a fourth distinct behaviour, the cheapest real one is a
ranged attacker, which needs an attack-range concept and a line-of-sight check. Do not add it
without asking.

## What to build

### 1. The stat table (DESIGN.md §6.1)

| id | Glyph | HP | ATK | DEF | senses |
|---|---|---|---|---|---|
| `rat` | `r` | 5 | 2 | 0 | 8 |
| `skeleton` | `k` | 15 | 5 | 2 | 4 |
| `goblin` | `g` | 10 | 4 | 1 | 8 |
| `guardian` | `G` | 60 | 7 | 3 | 10 |

The Guardian's row is created here; its AI and arena placement are T18.

### 2. Behaviour flags

Data, not branches. T10 asserts `grep "type === " turns.ts` returns nothing.

| Flag | Value | Effect |
|---|---|---|
| `fleeBelowHpPct` | `0.3` on the Goblin | Flee when `hp / maxHp < 0.3` |
| `attackCooldownTurns` | `1` on the Skeleton | Alternate strike / hold |
| `cleave` | `true` on the Guardian | T18 |
| `unlockLevel` | rat 1, skeleton 2, goblin 4, guardian 10 | Spawn weighting (T08) |

### 3. The Skeleton's cadence — the one that needs care

`attackCooldownTurns: 1` means (DESIGN.md §6.2):

- `attackCooldown === 0` and adjacent → attack, then set `attackCooldown = 1`
- `attackCooldown > 0` → decrement to 0, do not attack, and take one path step if one exists

So it alternates strike / hold, and its off-turn is a **free window for the player**. That window
is the entire reason a 15 HP / 5 ATK / 2 DEF enemy is a real threat rather than a slow rat:
standing next to it costs a hit every other turn, and the correct play is to hit back during
its hold.

The player needs to *see* the hold, or it reads as the game cheating. Emit
`The skeleton recovers from its swing.` on the off-turn — and remember the non-leak rule
(DESIGN.md §3.3): only when the Skeleton is in the player's current FOV.

### 4. The Goblin's flee

Flees while alerted and below the threshold. Paths to the adjacent tile with the greatest BFS
distance **from the player** — the one consumer that needs a field from the player rather than
from the enemy, so it uses `distanceField(player)` through the same memo cache. If already at
the maximum, attack instead. Message: `The goblin breaks off and runs.`, non-leak gated.

### 5. `senses` is the real difficulty knob

Rat and Skeleton both have 8, the Skeleton's DEF is 2, and it attacks every other turn. Play a
few turns of each and adjust `senses` and the DEF scaling before touching anything else. The
numbers in DESIGN.md are a starting point, and DESIGN.md §4.3 says so.

If early levels play too quietly, lower `GIVE_UP_TURNS` from 6 to 4 **before** changing
anything else. Quiet early levels are almost always the give-up timer, not the stat block.

## Tests — `test/enemies.test.ts`

- [ ] Every id in the table matches DESIGN.md §6.1 exactly (table-driven)
- [ ] `unlockLevel` values are 1 / 2 / 4 / 10
- [ ] Level 1 can spawn only the Rat; level 3 adds the Skeleton; level 4 adds the Goblin
- [ ] The Skeleton attacks on turns 1, 3, 5 and holds on 2, 4, 6 while adjacent
- [ ] The Skeleton's hold is visible in the log, and the log line is FOV-gated
- [ ] The Goblin flees at `hp / maxHp < 0.3` and does **not** flee at exactly 0.3
- [ ] The Goblin's flee increases its BFS distance from the player
- [ ] The Goblin at the maximum reachable distance attacks instead
- [ ] The Goblin does not flee while unalerted (it is frozen)
- [ ] A dead Skeleton's `attackCooldown` does not leak into its corpse
- [ ] `defScale` adds exactly 1 DEF at levels 4, 7, 10 and nothing elsewhere, for every type
- [ ] No enemy uses `hp` growth — HP is the table value at every level (DESIGN.md §6.3)

## Done when

- [ ] `test/enemies.test.ts` green
- [ ] `grep -n "type === \|type !== " src/game/turns.ts` returns nothing
- [ ] All four enemy types are reachable in a real run
- [ ] `npm run verify` exits 0
