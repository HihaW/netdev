# T02 — PRD / DESIGN doc patches

**Depends on:** —
**Phase:** 1

**Status: COMPLETE (2026-09-27).** Both documents were rewritten during the design session.
The changes are on disk.

## What was wrong

The original drafts made eight load-bearing assumptions that do not survive contact with
rot.js — a string seed that would have produced the same broken dungeon every time, a distance
map that does not exist, an `Item` with no `x`/`y`, an undefined `MapData`, and two sections
that contradicted each other about enemy activation.

**The full table of what was wrong, what it was replaced with, and why** is in
[`../CONTEXT.md` § Rejected alternatives](../CONTEXT.md), which is where decision history
lives. It is not duplicated here.

## What exists now

- `../DESIGN.md` — closed mechanical spec, every number fixed, with a §0 determinism contract
- `../PRD.md` — goals, non-goals, rot.js gotchas, a machine-checkable definition of done, and
  every open question closed

## Do not revert

Nothing in the old `DESIGN.md` text was a style choice. Every removed line encoded a claim that
is false about rot.js. If one of them looks like it was there on purpose, read
`../CONTEXT.md` § Library traps first.
