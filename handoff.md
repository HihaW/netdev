# handoff.md

**Last updated:** 2026-10-02 (T12 done — save and resume work)

Transient. Overwritten at the end of each session with a fresh date and a new position. The
durable knowledge lives in `CONTEXT.md` and `DESIGN.md` — do not move it here.

---

## Position

**T01–T12 are done. Persistence is in; the loop can now survive a reload.**
206 tests green, `npm run verify` exits 0.

Play it with `npm run dev`, or `npm run build && npm run preview`. A seed can be
passed as `?seed=...` in the URL; otherwise you are prompted for one.

Save and Continue are not reachable from the UI yet — the main menu is T13. The
persistence underneath them is done and tested, so T13 wires screens to functions
that already exist.

## Do this next

**Play the build first.** Walk with arrows or WASD (q/e/z/c for diagonals), `i` /`Esc` / `?`
are stubs until T13/T14. Reload the tab mid-run: nothing appears to happen yet, because
no menu offers Continue yet. That is expected — T12 is the layer under it.

Then two lanes that touch disjoint files:

```
Content:      T16 enemies · T17 items · T19 curve → T18 Guardian
Loop closure: T13 menus · T14 inventory → T15 daily
```

Then `T20` determinism suite (the release gate), `T21` README, `T22` Vercel, `T23` optional
feel.

## Read first

`AGENTS.md` → `CONTEXT.md` § Library traps → `DESIGN.md` §0, §1, §8 → the ticket you are
starting.

## Repo state, verified 2026-10-02

- Own git repository on `main`, 13 commits. **No remote is configured**, so the history
  exists on this machine only. That is by design: T01 says add a GitHub remote but do not push
  until T21. There is therefore no off-machine backup yet — do not be surprised by this, and
  do not push without asking.
- Dependencies installed (exact pins): `rot-js@2.2.1`, `typescript@5.9.3`, `vite@8.3.2`,
  `vitest@5.0.3`, `eslint@10.11.0`, `typescript-eslint@8.71.0`, `prettier@3.9.9`,
  `@types/node@22.20.4`. No new dependency was added for T12.
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
