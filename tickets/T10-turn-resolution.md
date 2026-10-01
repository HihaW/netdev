# T10 — Turn resolution and enemy AI

**Depends on:** T05, T06, T09
**Spec:** DESIGN.md §4.1–§4.5, §3.2, §3.3, §6.2, §6.3
**Phase:** 1

## Goal

`src/game/turns.ts`. One function that takes a player action and resolves an entire turn. This
is the piece the whole project hangs off, and it replaces a spec that contradicted itself
(§3 said one thing about enemy activation, §4 said another, and neither said what unseen
enemies did).

## The one enemy action rule

For each enemy, in ascending-id order:

1. **Sense.** If the player is inside the enemy's FOV (DESIGN.md §3.2), set `isAlerted = true`,
   record `lastKnown = player position`, reset `giveUp = GIVE_UP_TURNS` (6).
2. **If not alerted, do nothing.** No patrol, no wandering. Unseen enemies are frozen. This is
   what makes the FOV a tactical resource rather than decoration.
3. **Melee.** If Chebyshev distance ≤ 1, attack.
   - The Skeleton also requires `attackCooldown === 0`
   - The Guardian additionally checks its cleave windup (T18)
   - The Goblin additionally checks its flee threshold (§6.2 below)
4. **Otherwise, step.** One `nextStep` along a BFS field toward `lastKnown`. If `lastKnown` is
   unreachable, hold position.
5. **Decay.** `giveUp--`. At 0, clear `isAlerted` and `lastKnown`; the enemy stays put and is
   frozen again.

## Behaviour flags

Keep these in `src/data/enemies.ts` as data, not as `if (type === "goblin")` branches in the
turn loop. One dispatch site, one table.

| Flag | Effect |
|---|---|
| `fleeBelowHpPct` | `0.3` — Goblin. Flees when `hp / maxHp < 0.3` (Goblin: below 3 HP) |
| `attackCooldownTurns` | `1` — Skeleton. Alternates strike / hold |
| `cleave` | `true` — Guardian. T18 |

**Goblin flee:** path to the adjacent tile with the greatest BFS distance **from the player**.
This is the one consumer that needs a field from the player rather than from the enemy, so it
uses `distanceField(player)` — the same module, same memo cache. If it already stands on the
maximum, attack instead. Only while alerted.

**Skeleton cadence** (DESIGN.md §6.2): `attackCooldown === 0` and adjacent → attack, set
`attackCooldown = 1`. `attackCooldown > 0` → decrement to 0, do not attack, and take one path
step if one exists. So it alternates strike / hold, and its off-turn is a free window for the
player. That window is the whole reason a 15 HP / 5 ATK / 2 DEF enemy is a real threat instead
of a slow rat.

## Turn order (DESIGN.md §4.2)

1. Apply the player's action
2. If the player is dead → **abort immediately.** No enemy acts, no effects, no `turnCount++`
3. Each enemy takes exactly one action
4. Recompute the player's FOV
5. `turnCount++`
6. Render
7. If the player is dead → game over, delete the save (T12/T13)

Auto-descend and the level transition short-circuit this order as specified below.

## Level transition (DESIGN.md §4.5)

Stepping onto the stairs tile descends. No `>` key, no "standing on stairs" state.

If the stairs are sealed — a Guardian is alive on the level (T18) — the step is refused, a log
line is emitted, and **no turn is consumed**. The seal is the existence of the Guardian entity,
not a stored flag, so it cannot drift out of sync with the board.

## The message log

`pushMessage(line)` keeps the last **3** lines. Every enemy-action message is gated on
`playerCanSeeEntity` (T06) so the log can never disclose a position the player cannot see.
Since unseen enemies are frozen, this is not a filter — it is a guarantee.

## Tests — `test/turns.test.ts`

Build a small hand-authored level rather than a generated one, so failures point at the turn
logic and not at Digger.

- [ ] An enemy never in the player's FOV and never alerted does not move
- [ ] An enemy that can see the player becomes alerted and steps toward them
- [ ] Stepping into a wall consumes no turn and produces no message
- [ ] Player death aborts before any enemy acts (assert an adjacent enemy did not move and did
      not attack)
- [ ] `turnCount` does not increment on an aborted turn
- [ ] Iteration order is by ascending id and is stable across a full run
- [ ] **Give-up:** an alerted enemy whose target becomes unreachable de-alerts after exactly
      6 turns, then freezes
- [ ] Moving the player out of an enemy's senses radius starts the give-up countdown
- [ ] The Skeleton attacks on turns 1, 3, 5 and holds on 2, 4, 6 while adjacent
- [ ] The Skeleton's `attackCooldown` does not reset while it is off-turn
- [ ] The Goblin flees when `hp / maxHp < 0.3` and does not flee at exactly 30%
- [ ] The Goblin flees *away* — the resulting distance from the player increases
- [ ] The Goblin at the maximum reachable distance attacks instead of fleeing
- [ ] An enemy with an unreachable `lastKnown` holds position and does not throw
- [ ] A message about an unseen enemy is never pushed to the log
- [ ] Stepping onto stairs with no Guardian constructs level N+1 and resets `turnCount`'s
      level-scoped state
- [ ] Stepping onto sealed stairs is refused, logs, and consumes no turn
- [ ] A 40-turn scripted sequence replays identically from a seeded initial state

## Done when

- [ ] `test/turns.test.ts` green
- [ ] `grep -rn "type === \|type !== " src/game/turns.ts` returns nothing — behaviour is
      table-driven, not branch-driven
- [ ] `npm run verify` exits 0
