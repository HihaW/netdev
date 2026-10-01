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

- Own git repository on `main`. Dependencies installed (exact pins): `rot-js@2.2.1`,
  `typescript@5.9.3`, `vite@8.3.2`, `vitest@5.0.3`, `eslint@10.11.0`,
  `typescript-eslint@8.71.0`, `prettier@3.9.9`, `@types/node@22.20.4`.
- **TypeScript is pinned to 5.9.3, not 7.x** — `typescript-eslint@8.x` peers cap at
  `<6.1.0`. Do not upgrade TypeScript past 5.x without checking typescript-eslint first.
- **This directory is a subdirectory of `/home/hihaw`, a repo named `hermes-agent-backup`.**
  It now has its own `.git`; run git commands here, not in the parent.

## Spec gaps found while building — decisions made, worth your review

1. **DESIGN.md §2.5 stairs placement.** As written it includes `rooms[0]` in the
   candidate set, which makes acceptance check 3 vacuous (the spawn room is always
   reachable from spawn). Implemented as *excluding* `rooms[0]`, which is the only
   reading under which §2.3's stated "unreachable stairs room" failure mode is
   reachable at all.
2. **DESIGN.md §2.3 Uniform options.** Says `dugPercentage`, but rot.js reads
   `roomDugPercentage`. Same value (0.1 is already the library default), so no
   behaviour change. Correct name used.
3. **T08 checklist vs DESIGN.md §6.1.** The ticket says "level 3 spawns no
   Skeleton", but Skeleton unlocks at L2. Spec wins.
4. **DESIGN.md §9 keymap.** Says 8-directional movement but names only 4 arrow keys
   and WASD — 4 directions. Diagonals bound to `q`/`e`/`z`/`c`.
5. **BFS asymmetry (found by test).** A non-passable origin used to expand into its
   passable neighbours, so a wall tile could reach a floor tile that could not reach
   it back. Non-passable origins now yield an all `-1` field.
6. **rot.js FOV behaviours** (recorded in `CONTEXT.md` § Library traps): shadowcasting
   reports wall tiles as visible, and sees through a diagonal gap between two wall
   corners. Neither is specified, so neither was "fixed".

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

## Not decided

Nothing is open. Every question raised during the design session was closed — see
`CONTEXT.md` § Rejected alternatives for the full list, including the options that lost and
why. If something genuinely cannot be built as specified, raise it rather than adapting
quietly.
