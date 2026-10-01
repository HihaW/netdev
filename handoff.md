# handoff.md

**Last updated:** 2026-10-01 (T03 done)

Transient. Overwritten at the end of each session with a fresh date and a new position. The
durable knowledge lives in `CONTEXT.md` and `DESIGN.md` — do not move it here.

---

## Position

**T01 and T03 are done.** T02 was already complete (doc patches, verified on disk). Remaining
parallel lanes: **T04** (generation, needs nothing more from T03's side), **T05** (BFS),
**T06** (FOV), **T07** (entities).

`src/game/rng.ts` holds the dual-stream RNG: `cyrb53`/`toSeed`/`deriveSeed`, the four stream
functions, and the `gameplayRandom()` chokepoint. Pinned compatibility value:
`deriveSeed("hello", 1, "gen") === 989392909`.

## Do this next

Three lanes that can run in parallel, because they touch disjoint files and share no state:

```
T04         dungeon generation (T03 is done — start immediately)
T05         BFS
T06         FOV
T07         entities
```

Then `T08` → `T09` → `T10` → **`T11`, which is the MVP core. Stop and demo there.**

## Read first

`AGENTS.md` → `CONTEXT.md` § Library traps → `DESIGN.md` §0, §1, §2 → the ticket you are
starting.

## Repo state, verified 2026-10-01

- Own git repository on `main`, one commit `79d1dcf`, scoped to this directory.
- Dependencies installed (exact pins): `rot-js@2.2.1`, `typescript@5.9.3`, `vite@8.3.2`,
  `vitest@5.0.3`, `eslint@10.11.0`, `typescript-eslint@8.71.0`, `prettier@3.9.9`,
  `@types/node@22.20.4`.
- `npm run verify` exits 0 on the empty project.
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

## Not decided

Nothing is open. Every question raised during the design session was closed — see
`CONTEXT.md` § Rejected alternatives for the full list, including the options that lost and
why. If something genuinely cannot be built as specified, raise it rather than adapting
quietly.
