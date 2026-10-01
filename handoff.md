# handoff.md

**Last updated:** 2026-09-27

Transient. Overwritten at the end of each session with a fresh date and a new position. The
durable knowledge lives in `CONTEXT.md` and `DESIGN.md` — do not move it here.

---

## Position

Spec and tickets are complete. **No code exists yet.** The next ticket is **T01**.

Nothing is built: no `src/`, no `package.json`, no `node_modules`, no git repository in this
directory. `T01` creates all of it.

## Do this next

```
T01  repo + toolchain scaffold
```

Then four lanes that can run in parallel, because they touch disjoint files and share no
state:

```
T03 → T04   seeding and generation
T05         BFS
T06         FOV
T07         entities
```

Then `T08` → `T09` → `T10` → **`T11`, which is the MVP core. Stop and demo there.**

## Read first

`AGENTS.md` → `CONTEXT.md` § Library traps → `DESIGN.md` §0, §1, §2 → `tickets/T01-repo-and-toolchain.md`

## Repo state, verified 2026-09-27

- 30 markdown files. No source, no dependencies installed.
- All 44 `DESIGN.md §…` cross-references resolve to real headings.
- All 23 ticket files (`T01`–`T23`) present, plus `tickets/00-index.md`.
- Numbers cross-checked across `DESIGN.md` and the tickets: player stats, give-up timer,
  FOV radius, drop chance, heal amount, `timeLimit`, attempt count — no contradictions.
- **This directory is a subdirectory of `/home/hihaw`, a repo named `hermes-agent-backup`.**
  It has no `.git` of its own. `T01` fixes that.

## Traps for T01 specifically

- **Do not install `@types/rot-js`.** It is a deprecated stub that conflicts with the types
  `rot-js` ships itself.
- **Pin `rot-js` exactly** — no `^`, no `~`.
- `noUncheckedIndexedAccess` is on, deliberately: `tiles[y * width + x]` is the hot path, and
  an off-by-one should fail to compile rather than return a neighbouring tile.
- Vitest `environment` is `"node"`, not `"jsdom"`. A test that needs a DOM has found a
  layering violation.
- No web fonts, no CDN links, no analytics. "Zero network requests after initial page load"
  is a hard requirement.

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
