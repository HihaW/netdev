# T21 — README and architecture writeup

**Depends on:** all
**Spec:** the whole of DESIGN.md
**Phase:** 4

## Goal

The README is the portfolio piece. Everything else in this repo is evidence for a claim the
README makes. A reader who never opens `DESIGN.md` should still come away understanding how
the deterministic generation works and why it was built that way.

## What to write

### 1. The hook, first

Not "a roguelike in TypeScript". Lead with the interesting constraint and what it forced:

> A seeded roguelike where **the same seed produces the same dungeon, forever** — including
> save/resume, where the map is never stored because it is regenerated from the seed.

Then one or two sentences on what that required: splitting randomness into a construction
stream and a gameplay stream, because the library's map generators read a global RNG.

### 2. Quick start

```bash
git clone <url>
cd netdev
npm install
npm run dev
```

State the Node version (22). Add a one-line "run the tests" and a one-line "run everything".

### 3. The determinism contract

Reproduce DESIGN.md §0 in short form: the two streams, what consumes each, and why the map is
not in the save file. This is the section a technical reviewer reads first, so it must be
concrete — name the functions, not the principles.

Link to the test that proves it and say what happens if it fails.

### 4. Architecture

The module list from DESIGN.md §10, one line each. Then the three decisions a reviewer would
question, each with the reason:

- **Why rot.js, and what it cost us.** Strings aren't hashed and map generators use a global
  RNG, so we hash seeds ourselves and dedicate the global RNG to construction.
- **Why not `ROT.Path.Dijkstra`.** It exposes no distance map, so the BFS is ours (~30 lines).
- **Why the map is not saved.** Because it is provably reproducible, and redundant state can
  only drift.

### 5. Screenshots

At minimum: the main menu, a level in progress with fog of war and a message log, the
inventory, and the Guardian fight. **A screenshot of a dark, unexplored map sells the FOV
better than a paragraph about shadowcasting.**

### 6. Tuning record

Link `TUNING.md` (T19). Thirty runs with the numbers that changed is evidence of iteration, and it
is the part of a portfolio most projects do not have. **Note that the number that changed is
none** — §7's honesty requirement and TUNING.md's actual result agree, and the README says so
rather than implying a tuning pass that did not happen.

### 7. Known limitations

Be honest and specific. Candidates, all true today:

- rot.js is unmaintained and feature-complete. It is pinned exactly on purpose.
- Three enemy types, of which two differ mainly in stats. The behaviour variety is thinner
  than the PRD asked for.
- Level 10's Guardian is a single mechanic. There is no second phase.
- Save is on level entry and explicit quit, not per turn — a mid-level quit loses that level's
  progress.
- Save schema is version 1 and has never been migrated, because there is nothing to migrate
  from.

Listing these costs nothing and reads as judgement rather than overselling.

### 8. Non-negotiables for contributors

The three rules from `tickets/00-index.md`: no `Math.random()` in `src/`, `ROT.RNG` only in
`rng.ts` / `dungeon.ts` / `spawn.ts`, and no inventing numbers that `config.ts` owns.

## Done when

- [x] A reader who only reads the README understands the determinism contract and can run the
      game
- [x] Every command in Quick start is copy-pasteable and works on a fresh clone — `npm install`,
      `npm run dev`, `npm test`, `npm run verify` all verified locally on Node 22
- [x] At least four screenshots, including one showing fog of war mid-exploration — seven, in
      `docs/screenshots/`, all captured from the real app in Chromium via
      `scripts/screenshot.mjs`. Five are embedded: title, fog of war at turn 0, explored with the
      message log, inventory, and the Guardian winding up. `04-deeper` and `06-pause` are on disk
      and unused
- [x] Known limitations lists at least four real ones — six, including one the ticket did not
      anticipate: progress is per-browser, so a run does not follow you between machines
- [x] The module list matches `src/` exactly — no stale filenames. `types.ts` was added during
      this ticket, having been missing from the README's first draft
- [x] `npm run verify` exits 0 — 442 tests, 22 files

## Notes from doing this ticket

- **The screenshots needed a browser, and playwright-core is deliberately not a dependency.**
  Nothing in `src/` or `test/` uses it, so adding it would make every fresh `npm install` pull a
  browser driver for a script that produces documentation images. `scripts/screenshot.mjs`
  documents the one-line `npm install --no-save playwright-core` it needs instead, and
  `npm run screenshots` is wired up.
- **The Guardian shot is taken through the app's own save path, not a debug hook.** A level 10
  state is built by `enterLevel`, written with `writeSave`, and restored by `loadGame` — the same
  three calls the save round-trip test uses — so `src/` needed no test-only surface. The player is
  moved next to the Guardian before writing, because §2.5 puts the stairs as far from the spawn
  room as the map allows and a fresh level 10 state shows fog and no boss.
- **The script checks PRD §9 rather than assuming it.** It counts requests and prints any that
  left the origin; the last run reported 48 requests, 0 external. The 404 in its console output is
  the missing favicon, which does not exist and is not requested by any tag.
- **`eslint.config.js` grew a block for the script.** It is plain JS driving a browser, not in
  `tsconfig.json`, so the project service cannot resolve it. Type-checked rules are disabled for
  `scripts/**/*.mjs` rather than the file being admitted to the build's type surface.
