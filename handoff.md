# handoff.md

**Last updated:** 2026-10-02 (T18 done — the Guardian, the cleave, and victory)

Transient. Overwritten at the end of each session with a fresh date and a new position. The
durable knowledge lives in `CONTEXT.md` and `DESIGN.md` — do not move it here.

---

## Position

**T01–T19 and T17 are done. The game is complete: ten levels, a boss, a win condition, and a
seed that reproduces all of it.**
430 tests green, `npm run verify` exits 0. A scripted run has now beaten the game.

**The one thing left that is not a ticket: nobody has *played* it.** Every number here was measured
by a bot that cannot retreat or kite. `TUNING.md` says which questions that leaves open.

Play it with `npm run dev`, or `npm run build && npm run preview`. `?seed=…` in the URL
pre-fills the seed field; otherwise it is pre-filled with a fresh random one. Start a run,
die or Save and Quit, and Continue is there when you come back.

**Play it before starting T14.** T13 changed the whole shape of the app and T17 changed what
a turn does, and only a human can tell you whether either feels right.

## Do this next

**Play the build first.** Walk with arrows or WASD (q/e/z/c for diagonals), `i` /`Esc` / `?`
are stubs until T13/T14. Reload the tab mid-run: nothing appears to happen yet, because
no menu offers Continue yet. That is expected — T12 is the layer under it.

Then two lanes that touch disjoint files:

```
Loop closure: T15 daily        ← the last screen that has no mechanic behind it
Content:      T16 enemies · T19 curve → T18 Guardian
```

Then `T20` determinism suite (the release gate), `T21` README, `T22` Vercel, `T23` optional
feel.

## Read first

`AGENTS.md` → `CONTEXT.md` § Library traps → `DESIGN.md` §0, §1, §8 → the ticket you are
starting.

## Repo state, verified 2026-10-02

- Own git repository on `main`, 20 commits. **No remote is configured**, so the history
  exists on this machine only. That is by design: T01 says add a GitHub remote but do not push
  until T21. There is therefore no off-machine backup yet — do not be surprised by this, and
  do not push without asking.
- Dependencies installed (exact pins): `rot-js@2.2.1`, `typescript@5.9.3`, `vite@8.3.2`,
  `vitest@5.0.3`, `eslint@10.11.0`, `typescript-eslint@8.71.0`, `prettier@3.9.9`,
  `@types/node@22.20.4`. T13 added **`jsdom@30.1.1`** as the first dev-only addition, used by
  exactly one test file; see the note on `// @vitest-environment` below.
- **TypeScript is pinned to 5.9.3, not 7.x** — `typescript-eslint@8.x` peers cap at
  `<6.1.0`. Do not upgrade TypeScript past 5.x without checking typescript-eslint first.
- **This directory is a subdirectory of `/home/hihaw`, a repo named `hermes-agent-backup`.**
  It now has its own `.git`; run git commands here, not in the parent.

## Watch for

- Phase numbers in `tickets/00-index.md` are **logical groupings, not a sequence.** Trust the
  dependency graph, not the phase column.
- `tickets/T02-doc-patches.md` is complete. Do not restore any of the old `DESIGN.md` text it
  documents — those were real errors, not a style to revert.
- `DESIGN.md` and `src/game/config.ts` are the same numbers in two forms. If they disagree,
  that is a bug, and it should be fixed in both.
- **Two grep gates are sensitive to prose, not just code.** T20 asserts `grep "Math.random" src/`
  returns nothing — a *comment* containing that string fails the gate, which is why `randomSeed()`
  in `main.ts` says "the unseeded random source" instead. Same trap for the other two greps.
- **`grep -rn "ROT.RNG" src/` matches `rng.ts` and `spawn.ts` only — not `dungeon.ts`,** which
  reaches the global stream through `beginLevelConstruction`. T20's checklist says "only
  `rng.ts`, `dungeon.ts`, and `spawn.ts`"; the intent holds, the wording does not. Fix the
  ticket when you get there, or the release gate will fail on a correct tree.
- **`beginLevelGameplay` is called on every level entry, not once per run.** `DESIGN.md` §1.3
  still carries the `// Once, per run` comment. See open question 5.

## Suggested skills

| Skill | When |
|---|---|
| `implement` | Working a ticket start to finish |
| `tdd` | Writing the test alongside the code, not after it |
| `verification-planning` | Before starting a ticket that changes turn logic or generation |
| `diagnosing-bugs` | The moment a test fails and the cause is not obvious |

## Open questions for the owner

The design session closed every design question — see `CONTEXT.md` § Rejected alternatives.
What is open is the **five items below**. Each was implemented with the most defensible
reading rather than adapting quietly, and each is one small change if the owner disagrees.

| # | Question | Currently implemented | Commit |
|---|---|---|---|
| 1 | **DESIGN.md §9** says 8-directional movement but names only 4 arrow keys and WASD, which reach 4 directions. Diagonals need keys the spec does not provide. | Diagonals on `q` / `e` / `z` / `c` (`src/ui/keymap.ts`) | `afa250b` |
| 2 | **DESIGN.md §2.5** includes `rooms[0]` in the stairs candidate set, which makes acceptance check 3 vacuous — the spawn room is always reachable from spawn. | Candidates exclude `rooms[0]`, the only reading where §2.3's "unreachable stairs room" failure mode is reachable | `4444abc` |
| 3 | **DESIGN.md §2.3** passes `dugPercentage` to `Map.Uniform`, but rot.js reads `roomDugPercentage`. The option name is wrong; the value (0.1) matches the library default, so there is no behaviour change. | Correct option name, same value | `4444abc` |
| 4 | **`tickets/T08`** says "level 3 spawns no Skeleton", but **DESIGN.md §6.1** unlocks Skeleton at L2. | Spec wins: level 3 does spawn Skeletons. The ticket line is wrong | `a211999` |
| 5 | **DESIGN.md §1.3** says the gameplay stream is seeded `// Once, per run`, but `enterLevel` calls `beginLevelGameplay(seed, level)` on **every** level, so each level restarts the play stream from `deriveSeed(seed, level, "play")`. | Per level. Behaviourally sound — a level's combat rolls do not depend on how you got there — but it is not what §1.3 says, and `save.test.ts` has to reseed level 2 to prove the level-entry checkpoint captured the right stream. Either fix the §1.3 comment or change the code; the code change would move every combat roll in the game | `fba474e` (T10, predates T12) |

Items 1 and 2 change **gameplay**, so they are worth a decision before T13–T19 build on top of
them. Items 3 and 4 are documentation-only. Item 5 changes combat rolls, so it is the most
expensive of the five to reverse — decide it before T20 locks the fixtures.

If any of these is to be changed, fix it in **both** `DESIGN.md` and the code, and say so in
the commit message.

### Decided during T12 (not open, recorded so they are not relitigated)

| Question | Decision |
|---|---|
| `InventoryEntry` is never defined in `DESIGN.md` | `{ itemId, stack }` for all three kinds, so T14's "the last potion removes the entry" and T17's stacking both work unchanged |
| §8.4 needs `kills` and `cause`, but `GameState` had neither | `GameState.kills` and `GameState.deathCause` added; `kills` persisted in the save because a resumed run must still report it |
| `savedAt` needs a clock, but no wall clock may touch `src/game/` | `setSaveClock()` installed by `main.ts`; `serialize(state)` keeps the ticket's one-argument signature |
| Is starting a run a level entry for §8.3? | Yes — `createGame` checkpoints, so start-then-reload keeps the run |

## Resolved — do not redo this work

### From T18 (Guardian, cleave, victory)

- **The cleave hit nobody at all on its first working version**, because it iterated
  `state.entities` to find its targets — and **the player is not in `state.entities`**, they live
  on `state.player`. The mechanic silently did nothing while looking correct. The player is now
  checked against the footprint separately. Worth remembering: anything that sweeps "everything on
  the board" is a list that does not contain the player.
- **`applyPlayerAction` never checked that a move was one tile.** Passing `dx: 5` teleported the
  player across the room for a single turn's price. The keymap cannot produce that, so the app was
  safe, but every distance in the game would have been a lie to any other caller. It now rejects
  anything that is not a single step. Found by a test that meant to walk two tiles and could not.
- **`decayAlert` now clears `cleaving`.** A wind-up that survives the Guardian forgetting the
  player is a hit the player was telegraphed about a turn after they had left. Defensive: the
  scenario needs a wall the test fixture does not have, so it is not covered by a test — but the
  two cases that *are* reachable are.
- **`stairsSealed` now takes the entity list rather than the whole state**, which is what T18 asks
  for and what makes it a pure function of the question it answers. `renderer.ts` and `applyPlayerAction`
  were updated.
- **The Guardian's telegraph cannot leak, structurally.** Both lines need adjacency, and
  `resolveTurn` recomputes FOV before any enemy acts, so an adjacent Guardian is always visible.
  The non-leak gate is on the line anyway and is unreachable; the test asserts the guarantee rather
  than faking a suppressed case. Same shape as the Skeleton's hold.
- **The measured result is the best evidence the design is right:** of 30 bot runs, `curve-15` won
  having seen the Guardian wind up **126 times and taken the cleave 0 times** — it disengaged every
  single time. `curve-26` reached level 10, ignored the telegraph, took **15 cleave hits** and died
  to the Guardian. The fight is decided entirely on whether the player reads the log line, which is
  what §11 asked for. Both are in `TUNING.md`.
- **One run to level 10 exists now**, so T18's and T19's outstanding Done-when items are both
  closed — mechanically. A person still has not done it, and `curve-15`'s 7 863 turns say the bot's
  routing is no guide to how long a run should take.

### From T19 (difficulty curve)

- **`TUNING.md` exists and records thirty runs — and records that no number was changed.** That is
  the substantive result, not a gap. The bot that produced the data never retreats, never kites
  and never uses terrain, so its deaths measure the *floor* of the curve and not its middle. A bot
  that walks into a Skeleton's face dies to it whether or not the cadence is fair, and §6.2 is
  explicit that the off-turn is a window the player is meant to use. Changing a tuning number on
  that evidence is the spreadsheet failure §6.3 exists to prevent. **Do not "fix" the curve from
  `TUNING.md`'s table alone** — it says so, but people skim tables.
- **Two harness bugs masqueraded as difficulty findings** before being caught, and both are worth
  remembering: a bot that attacks every adjacent enemy while walking, and a bot that walks the
  stairs path without ever picking anything up. The second one fought the entire game bare-handed
  at 4 ATK, so every death was arithmetic against a 2 DEF Skeleton. Neither said anything about
  balance. **A measurement that has not been sanity-checked against its own harness is not
  evidence.**
- **`enemyCountForLevel(10)` used to return 10.** The Guardian's "alone" was only handled by an
  early return in the placement path, so the curve function lied about the final level. It now
  returns 0, and `unlockedTypes(level)` is exported and is what the weighting derives from, so
  there is one answer to "what can spawn here" rather than two.
- **T19's Done-when grep is uninformative as written.** `grep -rnE "[0-9]"` over `spawn.ts`,
  `turns.ts` and `combat.ts` matches every `0`, every array index and every `§3.3` in a comment.
  There are no unexplained magic numbers in those three files; the check needs to be a real AST or
  lint rule, or the ticket line should be dropped rather than satisfied cosmetically.

### From T16 (enemy roster)

- **T16 was mostly verification, and one real bug.** The stat table landed in T07, the behaviour
  dispatch and both behaviours in T10, and the unlock schedule in T08 — all with tests. What was
  genuinely missing was coverage: the glyph column of §6.1, the exact strike/hold parity over six
  turns, the corpse carrying no AI state, HP/ATK never growing with depth, and the flee
  maximising *BFS* distance rather than merely getting further away.
- **The Skeleton's cadence was arming its cooldown on turns where it did not attack.**
  `DESIGN.md` §6.2 says "attackCooldown === 0 **and adjacent** -> attack, then set
  attackCooldown = 1". The code set it whenever the cooldown was 0, adjacency not considered. The
  visible effect: a skeleton closing the last step onto the player would arrive and then *hold*
  instead of striking, handing the player a free window every single time it reached them. Fixed
  in `actOnEnemy`: the cooldown is now armed by swinging. This makes the Skeleton measurably
  stronger, so **T19 should re-play the early levels before tuning anything else.**
- **The Goblin's "unalerted" test needs a tile that is genuinely unseen.** A goblin at (8,2) in the
  test hall has line of sight down the open chamber, wakes up, and flees correctly — so writing
  that test at a visible tile passes for entirely the wrong reason. It belongs behind the wall.
- **A fresh enemy is unalerted and therefore frozen**, so any "it steps instead" test has to alert
  it first, or it passes because the enemy did nothing at all.
- **T16's Done-when grep (`type === "..."` in `turns.ts`) returns nothing and is now also a test**,
  so the "behaviour is data, not branches" rule fails the build rather than a person.

### From T15 (daily challenge)

- **A daily run is an ordinary run whose seed happens to be a date.** There is no `daily: true`
  flag, no branch in generation, and no special save field — a test asserts the string "daily"
  appears nowhere in a serialized run or in a history record. Do not add one.
- **`src/game/daily.ts` is the only file allowed to read a clock**, and it has exactly two reads,
  both default parameters. T20's grep gate (`Date.now|performance.now|new Date()` in `src/game/`)
  matches that file and nothing else; `src/main.ts` also has one `new Date()`, which the gate
  excludes because it is not under `src/game/`.
- **`msUntilNextDaily` counts down to the next UTC midnight**, so it is a full day immediately
  after midnight and 1 ms a millisecond before. **T15's checklist line "is 0 exactly at UTC
  midnight" is wrong** and cannot hold alongside its own requirement that the value be positive
  and at most 24 hours; the boundary it was reaching for is asserted instead, with a comment
  saying so. If the owner disagrees, the fix is a ticket edit, not a code change.
- **The countdown is computed once, when the title screen opens.** No interval, no periodic
  re-render. A menu you look at for five seconds does not need a live timer, and a timer in the
  app layer is one more thing to reason about.

### From T14 (inventory and consumption)

- **`PlayerAction` has a third variant, `drink`,** and drinking is a turn. It goes through
  `resolveTurn` like a move or a wait, so enemies act, FOV recomputes and `turnCount` moves.
  The UI cannot heal the player directly; the screen only asks the app to drink and redraws.
  `drinkPotion()` returns a **boolean** because "did this cost a turn" is the whole question —
  drinking at full health is refused and must not spend one.
- **`1` and `Enter` are screen-local keys, deliberately absent from `KEY_BINDINGS`.** They only
  mean something while the inventory is open, so putting them in the global keymap would put
  them in the `?` help table where they do not belong. The panel states them inline instead.
- **The inventory panel takes focus, not its Close button.** Otherwise Enter — which drinks —
  would activate the button instead. Tab still reaches the button.
- **The newest log line is repeated inside the panel.** The message log renders behind the
  overlay, so "you are already at full health" would otherwise be invisible while the screen that
  caused it is still open.
- **`drink()` re-checks which screen it is on before redrawing.** Drinking can be fatal, and the
  app answers that by leaving the inventory; without the check the panel would paint itself back
  over the game over screen.
- **The DOM tests drive the real `nextScreen` + layer composition**, the same shape as
  `main.ts`. An earlier version used a port that only recorded calls, and it would have passed
  while the app left the overlay up — the same failure mode as the T13 Escape bug.

### From T17 (items)

- **T14 was not startable before T17, whatever its dependency line says.** T14's own tests need
  pickup — "walking onto a better weapon replaces the worse one", "pots stack". That is T17's
  code. The loop-closure lane is T17 → T14 → T15, not T13 → T14.
- **Equipment is recorded in `state.inventory` and folded into `player.atk` / `player.def`** by
  `applyEquipment()` in `turns.ts`. That is why combat and the HUD need no equipment branch:
  `player.atk` is already the effective value. `applyEquipment` is the only writer, and
  `test/items.test.ts` asserts the two halves agree after every ordering of pickups — that test
  is the guard against the cache drifting from the record.
- **`itemAt()` exists because a drop lands on the corpse's tile** (§5.2), so that tile holds two
  entities and `entityAt` returns the corpse first. Picking up via `entityAt` would leave every
  dropped potion unpickable for the rest of the level. `test/items.test.ts` pins it.
- **`effectiveStats()` and `potionCount()` live in `turns.ts` and are the only implementations.**
  `hud.ts` and `menus.ts` both read them, which is what keeps the HUD and the inventory screen
  from disagreeing. There were briefly two `potionCount`s; there must not be again.
- **Level 10 has no item weight band, and `itemWeightsForLevel(10)` throws.** That is correct:
  level 10 places nothing. The bands stop at 9 for that reason, not by oversight.
- **A level starts with two or three items already on the floor**, so "the floor is empty" is
  never a valid assertion about pickups. `test/items.test.ts` uses a `floorItemIds` helper and
  asserts the floor is *unchanged*, which is the claim that actually distinguishes "discarded"
  from "dropped".
- **One run is not guaranteed to contain all six item ids** — `armor_2` only rolls from level 5
  and `weapon_3` only from level 7, on 30% and 40% category weights. Measured: 3 of 6 probe runs
  saw all six. T17's Done-when is therefore asserted across three fixed descents. That is
  balance, not a defect.

### From T13 (menus and screens)

- **Two bugs shipped in T13's first cut and were caught only by booting the app**, not by any
  test: a resolved turn was never re-rendered (the game looked frozen after the first keypress),
  and Escape could not close an overlay. Both were key-routing decisions, so the routing now
  lives in `decideKey()` in `src/ui/menus.ts` — a pure function with no DOM, no game and no
  clock — and `main.ts` is a thin executor. Do not move that logic back into `main.ts`.
- **The overlay has no `keydown` listener, on purpose.** It used to have one, and the two
  handlers fought: the overlay resumed, then the app's window listener saw `screen === "playing"`
  and re-paused, so Escape did nothing. `menus.escape()` is a method the app calls instead.
- **`vitest` stays on `environment: "node"`.** Only `test/menus.dom.test.ts` opts into jsdom with
  a `// @vitest-environment jsdom` docblock, which is the layering signal T01 set up. Do not
  move jsdom into `vitest.config.ts` globally.
- **Run history and the key reference are views, not screens.** The union has exactly six
  states, and `DESIGN.md` §9.1 now says why. Adding a seventh state for either would make the
  union lie.
- **The inventory screen was built read-only in T13** and T14 added consumption to it. That is
  why `menus.ts` grew a `drink()` beside `escape()`: both are "the layer acts, the app resolves".
- **There is no Daily Challenge button yet.** T15 adds it to the main menu; the menu is built
  and has the slot. Shipping a button that does nothing was judged worse than its absence.
- **Victory is renderable but unreachable** — T18 is what routes to it (`won` on level 10).

### From T12 (save and load)

- **The map is not saved, and `deserialize` rebuilds it from the saved `generator` and
  `attempt`.** It calls `regenerateLevel(seed, level, generator, attempt)` in `dungeon.ts`,
  which runs the acceptance checks on exactly that attempt. Do **not** "simplify" it to
  `generateLevel(seed, level)`: the re-run guard cannot reproduce a `uniform` level from a
  chosen seed, so a uniform save would restore as a digger level.
- **`savedAt` and `endedAt` come from an injected clock, never `new Date()`.** `main.ts` calls
  `setSaveClock(() => new Date().toISOString())` — the only wall clock in the app. This is what
  keeps T20's `grep "new Date()" src/game/` gate passing with no second exception.
- **Storage is injected too** (`setStorage`). `localStorage` does not exist under vitest's node
  environment, and `test/setup.ts` installs a fake store and a fixed clock for every test file,
  so a test cannot fail merely for starting a run. Tests that assert on the slot call
  `installTestStorage()` themselves for a clean one.
- **`hasSave()` means "a loadable save exists", not "the key exists".** Corrupt JSON, a wrong
  version, and a short `explored` all read as no save — that is what lets T13's main menu ask
  whether to offer Continue without a try/catch of its own. A `LevelGenerationError` from a
  save that *does* parse is deliberately **not** swallowed.
- **The message log is not persisted.** §8.2 has no field for it. The round-trip test excludes
  `messages` and says why; it excludes nothing else, so a state field that stops round-tripping
  still fails the test.
- **`reserveEntityIds` on resume is required.** The id counter is still at 1 after a reload
  while the restored entities hold `e1..eN`, so without raising the floor the next drop would
  mint a duplicate id and break §4.2's ascending-id enemy order.
- **A resumed run reports the checkpoint's `turnCount`, not the last turn played.** There is no
  per-turn save, so quitting mid-level loses that level's progress. `save.test.ts` pins this
  both ways; do not "fix" it by saving every turn.
- **What T13 and T18 need from `save.ts`:** `hasSave()`, `readSave()` (for Continue's label),
  `loadGame()`, `writeSave(state)` (Save and Quit), `readHistory()`, and
  `endRun(state, { won: true })` for victory. None of them need to know the schema.

### From T01–T11

- **The non-leak rule (DESIGN.md §3.3) is implemented.** Every enemy log line goes through
  `playerCanSeeEntity` in `src/game/turns.ts`, so the log cannot disclose an invisible enemy.
  The `TODO(T10)` comment at the bottom of `src/game/combat.ts` is a **deliberately retained
  marker**: T09's Done-when required it, and `test/combat.test.ts` asserts its presence and
  that it mentions §3.3. Do not delete it, and do not re-implement the check in `combat.ts` —
  it cannot live there, because `combat.ts` has no FOV set.
- **`clearBfsCache()` on level entry is required, not redundant.** `enterLevel` in
  `turns.ts` clears the BFS memo cache because it is keyed by origin tile only. Without that
  call, level N+1 could be handed level N's distance field for any origin the two levels
  share. Same reason the test fixture helper in `test/fixtures.ts` clears the cache, and the
  reason `regenerateLevel` clears it before evaluating a candidate.
- **A non-passable BFS origin yields an all `-1` field.** This is what makes the field
  symmetric; an earlier version expanded from a wall origin and could reach tiles that could
  not reach it back. `test/bfs.test.ts` has a 200-level × 200-source symmetry assertion that
  catches a regression here.
- **`playRng` is intentionally not exported** from `src/game/rng.ts`. The single
  `gameplayRandom()` chokepoint is what makes "the global RNG is construction-only"
  auditable with one grep.

### Known risk, not a defect

- **A browser with `localStorage` disabled (some private-browsing modes throw on access) will
  fail to boot**, because `createGame` checkpoints and cannot write. The fix is either a
  fallback or a clear message, and both are spec decisions the closed spec does not cover.
  Worth deciding at T22, when there is a deployed build to break.
