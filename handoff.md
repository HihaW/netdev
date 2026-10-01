# handoff.md

**Last updated:** 2026-10-01 (T11 done — MVP core)

Transient. Overwritten at the end of each session with a fresh date and a new position. The
durable knowledge lives in `CONTEXT.md` and `DESIGN.md` — do not move it here.

---

## Position

**T01–T11 are done. This is the MVP core — stop and play it before starting T12.**
175 tests green, `npm run verify` exits 0.

Play it with `npm run dev`, or `npm run build && npm run preview`. A seed can be
passed as `?seed=...` in the URL; otherwise you are prompted for one.

## Do this next

**Play the build first.** Walk with arrows or WASD (q/e/z/c for diagonals), `i` /`Esc` / `?`
are stubs until T13/T14. Then:

```
T12  save + load          ← unblocks the rest
```

After T12, two lanes that touch disjoint files:

```
Content:      T16 enemies · T17 items · T19 curve → T18 Guardian
Loop closure: T13 menus · T14 inventory → T15 daily
```

Then `T20` determinism suite (the release gate), `T21` README, `T22` Vercel, `T23` optional
feel.

## Read first

`AGENTS.md` → `CONTEXT.md` § Library traps → `DESIGN.md` §0, §1, §2 → the ticket you are
starting.

## Repo state, verified 2026-10-01

- Own git repository on `main`, 12 commits. **No remote is configured**, so the history
  exists on this machine only. That is by design: T01 says add a GitHub remote but do not push
  until T21. There is therefore no off-machine backup yet — do not be surprised by this, and
  do not push without asking.
- Dependencies installed (exact pins): `rot-js@2.2.1`, `typescript@5.9.3`, `vite@8.3.2`,
  `vitest@5.0.3`, `eslint@10.11.0`, `typescript-eslint@8.71.0`, `prettier@3.9.9`,
  `@types/node@22.20.4`.
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

## Suggested skills

| Skill | When |
|---|---|
| `implement` | Working a ticket start to finish |
| `tdd` | Writing the test alongside the code, not after it |
| `verification-planning` | Before starting a ticket that changes turn logic or generation |
| `diagnosing-bugs` | The moment a test fails and the cause is not obvious |

## Open questions for the owner

The design session closed every design question — see `CONTEXT.md` § Rejected alternatives.
What is open is the **four spec defects below**. Each was implemented with the most defensible
reading rather than adapting quietly, and each is one small change if the owner disagrees.

| # | Question | Currently implemented | Commit |
|---|---|---|---|
| 1 | **DESIGN.md §9** says 8-directional movement but names only 4 arrow keys and WASD, which reach 4 directions. Diagonals need keys the spec does not provide. | Diagonals on `q` / `e` / `z` / `c` (`src/ui/keymap.ts`) | `afa250b` |
| 2 | **DESIGN.md §2.5** includes `rooms[0]` in the stairs candidate set, which makes acceptance check 3 vacuous — the spawn room is always reachable from spawn. | Candidates exclude `rooms[0]`, the only reading where §2.3's "unreachable stairs room" failure mode is reachable | `4444abc` |
| 3 | **DESIGN.md §2.3** passes `dugPercentage` to `Map.Uniform`, but rot.js reads `roomDugPercentage`. The option name is wrong; the value (0.1) matches the library default, so there is no behaviour change. | Correct option name, same value | `4444abc` |
| 4 | **`tickets/T08`** says "level 3 spawns no Skeleton", but **DESIGN.md §6.1** unlocks Skeleton at L2. | Spec wins: level 3 does spawn Skeletons. The ticket line is wrong | `a211999` |

Items 1 and 2 change **gameplay**, so they are worth a decision before T13–T19 build on top of
them. Items 3 and 4 are documentation-only.

If any of these is to be changed, fix it in **both** `DESIGN.md` and the code, and say so in
the commit message.

## Resolved — do not redo this work

- **The non-leak rule (DESIGN.md §3.3) is implemented.** Every enemy log line goes through
  `playerCanSeeEntity` in `src/game/turns.ts`, so the log cannot disclose an invisible enemy.
  The `TODO(T10)` comment at the bottom of `src/game/combat.ts` is a **deliberately retained
  marker**: T09's Done-when required it, and `test/combat.test.ts` asserts its presence and
  that it mentions §3.3. Do not delete it, and do not re-implement the check in `combat.ts` —
  it cannot live there, because `combat.ts` has no FOV set.
- **`clearBfsCache()` on level entry is required, not redundant.** `enterLevel` in
  `turns.ts` clears the BFS memo cache because it is keyed by origin tile only. Without that
  call, level N+1 could be handed level N's distance field for any origin the two levels
  share. Same reason the test fixture helper in `test/fixtures.ts` clears the cache.
- **A non-passable BFS origin yields an all `-1` field.** This is what makes the field
  symmetric; an earlier version expanded from a wall origin and could reach tiles that could
  not reach it back. `test/bfs.test.ts` has a 200-level × 200-source symmetry assertion that
  catches a regression here.
- **`playRng` is intentionally not exported** from `src/game/rng.ts`. The single
  `gameplayRandom()` chokepoint is what makes "the global RNG is construction-only"
  auditable with one grep.
