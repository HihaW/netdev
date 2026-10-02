# TUNING.md

Difficulty numbers live in `src/game/config.ts`. `DESIGN.md` is their written form; the two must
agree, and if they ever do not, that is a bug rather than a preference.

This file is the record of **what was measured and what was changed as a result**. A tuning file
with no measurements in it is decoration.

---

## Current curve

| Rule | Value | Source |
|---|---|---|
| Enemy count, levels 1–9 | `min(10, 3 + floor(level * 0.8))` — L1→3, L5→7, L9→10 | `MAX_ENEMIES_BASE`, `ENEMY_COUNT_SLOPE`, `MAX_ENEMIES_CAP` |
| Enemy count, level 10 | 0 — the Guardian alone | `GUARDIAN_LEVEL` |
| DEF scaling | `+1` at levels 4, 7, 10 | `DEF_SCALE_LEVELS` |
| HP / ATK growth | none, ever | `enemies.ts` stat table |
| Unlocks | Rat L1 · Skeleton L2 · Goblin L4 | `unlockLevel` |
| Give-up timer | 6 turns without sight | `GIVE_UP_TURNS` |
| Drop chance | 0.35 | `DROPPED_POTION_CHANCE` |
| Item candidates | `floor(nonStartingRooms / 3)` | `ITEM_COUNT_DIVISOR` |
| Spawn distance | 5 tiles Chebyshev | `MIN_SPAWN_DISTANCE` |
| Potion heal | 8 | `POTION_HEAL_AMOUNT` |

## Changes

| Date | Number | From | To | Motivated by |
|---|---|---|---|---|
| 2026-10-02 | *(none)* | — | — | See "Measurement" below: the evidence did not support a change |

**No tuning number has been changed.** That is a decision, not an omission, and the reasoning is
recorded below so it can be argued with.

---

## Measurement

### What was run

Thirty scripted runs, `curve-00` … `curve-29`, on the commit that closed T16.

**These are bot runs, not human runs**, and the distinction matters more than the numbers. The
policy is deliberately simple and completely unremarkable as play:

- head for the stairs by BFS
- detour to any item within 6 tiles
- attack an enemy only when it stands on the next step of that path
- after 150 turns on one level, stop exploring and attack anything adjacent
- drink below 70% HP
- never retreat, never kite, never use a doorway or a wall to break line of sight

A human does all of those last three things. So this measures **the floor of the curve** — what
happens to a player who never backs away — and not its middle.

| seed | outcome | level | turns | kills | cause | atk/def | wind-ups | cleave hits |
|---|---|---|---|---|---|---|---|---|
| curve-00 | died | 4 | 181 | 4 | goblin | 5/2 | 0 | 0 |
| curve-01 | died | 3 | 146 | 3 | rat | 5/1 | 0 | 0 |
| curve-02 | died | 2 | 60 | 1 | skeleton | 4/1 | 0 | 0 |
| curve-03 | died | 3 | 142 | 1 | skeleton | 5/1 | 0 | 0 |
| curve-04 | died | 8 | 480 | 8 | goblin | 7/2 | 0 | 0 |
| curve-05 | died | 5 | 408 | 5 | skeleton | 5/2 | 0 | 0 |
| curve-06 | died | 3 | 154 | 3 | rat | 5/2 | 0 | 0 |
| curve-07 | died | 3 | 184 | 4 | skeleton | 5/2 | 0 | 0 |
| curve-08 | died | 2 | 92 | 2 | skeleton | 5/1 | 0 | 0 |
| curve-09 | died | 5 | 228 | 9 | skeleton | 5/2 | 0 | 0 |
| curve-10 | died | 4 | 160 | 7 | skeleton | 5/2 | 0 | 0 |
| curve-11 | died | 4 | 287 | 5 | rat | 5/2 | 0 | 0 |
| curve-12 | died | 6 | 281 | 4 | goblin | 6/3 | 0 | 0 |
| curve-13 | died | 3 | 128 | 3 | skeleton | 5/1 | 0 | 0 |
| curve-14 | died | 4 | 155 | 1 | skeleton | 5/2 | 0 | 0 |
| **curve-15** | **won** | **10** | 7863 | 14 | — | 6/3 | 126 | **0** |
| curve-16 | died | 4 | 146 | 3 | goblin | 4/2 | 0 | 0 |
| curve-17 | died | 2 | 71 | 0 | skeleton | 5/1 | 0 | 0 |
| curve-18 | died | 4 | 253 | 5 | goblin | 5/2 | 0 | 0 |
| curve-19 | died | 4 | 190 | 6 | goblin | 5/2 | 0 | 0 |
| curve-20 | died | 3 | 126 | 2 | skeleton | 4/1 | 0 | 0 |
| curve-21 | died | 2 | 64 | 1 | skeleton | 4/1 | 0 | 0 |
| curve-22 | stalled | 6 | 371 | 14 | — | 6/2 | 0 | 0 |
| curve-23 | died | 2 | 90 | 1 | skeleton | 4/1 | 0 | 0 |
| curve-24 | died | 5 | 227 | 5 | goblin | 5/2 | 0 | 0 |
| curve-25 | died | 4 | 343 | 4 | goblin | 5/2 | 0 | 0 |
| curve-26 | died | 10 | 560 | 12 | **guardian** | 7/2 | 33 | 15 |
| curve-27 | died | 6 | 309 | 9 | skeleton | 6/2 | 0 | 0 |
| curve-28 | died | 3 | 124 | 4 | skeleton | 4/2 | 0 | 0 |
| curve-29 | died | 3 | 106 | 2 | skeleton | 4/2 | 0 | 0 |

### What the numbers say

- **One run was won outright** (curve-15), and two reached level 10. Mean level reached **4.2**.
  Death causes: Skeleton 15, goblin 9, rat 3, Guardian 1, two runs ended without dying.
- **The Skeleton killed 15 of 30** and is still the single biggest killer. Goblins killed 9.
  Deaths cluster hard on levels 2–4, exactly where the Skeleton unlocks.
- **curve-15 is the interesting one.** It took 7 863 turns — most of them the bot oscillating
  rather than a fair measure of the fight — and it saw the Guardian wind up **126 times and took
  the cleave zero times**. It stepped out of range every single time it was telegraphed, which is
  the whole mechanic working: `DESIGN.md` §11 says the telegraph is the mechanic, and a player who
  reads it takes no cleave damage at all.
- **curve-26 is the counter-example**: it reached level 10 at 7 ATK / 2 DEF, ignored the telegraph,
  took **15 cleave hits**, and died to the Guardian. So the fight is decided entirely by whether
  the player disengages on the wind-up, which is precisely the positioning-and-timing test §11
  asked for, rather than a damage race.
- Potions are not the bottleneck at this stage: the bot drinks below 70% and most runs end before
  the inventory matters.

### What the numbers do **not** say

They cannot say the curve is too hard, because "too hard" is a statement about a player who
thinks. A bot that walks into a Skeleton's face and trades blows dies to it whether or not the
cadence is fair — and `DESIGN.md` §6.2 is explicit that the Skeleton's off-turn is a window the
player is *meant* to use. The bot never uses it. Reading these deaths as a balance verdict would
be reading them wrong.

Changing a number here would also be exactly the failure mode the curve is designed to avoid.
`DESIGN.md` §6.3: "Keeping the curve flat is what makes it tunable by feel rather than by
spreadsheet." Thirty bot runs are a spreadsheet.

### Open questions a human has to answer

These are T19's real questions and none of them is answerable from the table above:

- Do levels 1–3 teach without killing outright?
- Does the first Skeleton (L2) feel like a wall, or like a slow rat that is easy to kite?
- Does the first Goblin (L4) create a real decision, or is it a meat shield?
- Is `GIVE_UP_TURNS = 6` making enemies forget you too fast or too slowly?
- Is the 35% drop rate leaving you without potions exactly when you need one?
- Is level 10's Guardian a fight or an execution? *(T18 has not landed, so the cleave is unwritten
  and the Guardian currently just chases.)*

### Tuning order, when someone does play it

One number at a time, in this order, and record each one in the table at the top:

1. **`GIVE_UP_TURNS`** — if early levels feel quiet or empty, this is the cause, not the stats.
   6 → 4 makes alerted enemies meaningfully more persistent.
2. **`DROPPED_POTION_CHANCE`** — if potions are too scarce, raise it before touching enemy HP.
   Scarcity is a cheaper difficulty lever than enemy stats.
3. **The enemy count formula** — the `0.8` slope and the cap of 10.
4. **The DEF scaling step** — moving 4/7/10 to 3/6/9 is a one-line change.

Do not add HP or ATK growth. `DESIGN.md` §6.3 specifies none, and adding it converts a feel-tuned
curve into an unplayable one.

### Still to do by hand

- **One run through all ten levels has not been completed.** The best bot run reached level 8. T19
  asks for one, and a person has to supply it — or a substantially better agent.
- **Nothing has been felt.** No one has watched a Skeleton wind up and taken the free window.
