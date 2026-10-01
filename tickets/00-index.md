# Netdev — Ticket Index

Every ticket is one markdown file in this directory. Each declares what it builds, what it
depends on, the spec it implements, and how you know it is finished.

**The spec is `../DESIGN.md`.** Read the referenced section before implementing. Do not
improvise a number, a key, or a behaviour that is specified there. If you believe the spec
is wrong, stop and say so — do not silently "fix" it.

---

## Ground rules

The full set of project invariants lives in [`../AGENTS.md`](../AGENTS.md) and is not
repeated here. The three that bite most often while working a ticket:

1. **A ticket is done when its `Done when` checklist is fully met and
   `npm run verify` exits 0.** Not when it compiles.
2. **Tests ship with the ticket that introduces the code**, not in a later cleanup ticket.
3. **A value that is not in `DESIGN.md` or `src/game/config.ts` is scope invention** — stop
   and ask. Do not pick a plausible number and move on.

---

## Dependency graph

```
                    ┌──── T01 scaffold ────┐
                    │                      │
        ┌───────────┴───────────┐          │
        │                       │          │
     T02 docs                 T04 dungeon  │
        │                     ▲            │
        │                  T03 rng        │
        │                       │          │
        │        ┌──────────────┼──────────┼──────────┐
        │        │              │          │          │
        │     T05 bfs        T06 fov    T07 entities   │
        │        │              │          │          │
        │        └──────┬───────┴─────┬────┘          │
        │               │             │               │
        │             T08 spawn      │               │
        │               │             │               │
        │             T09 combat ◄────┘               │
        │               │                             │
        │             T10 turns ◄─────────────────────┘
        │               │
        │             T11 renderer  ← MVP CORE
        │               │
        │             T12 save
        │               │
        │      ┌────────┴────────┐
        │   T13 menus        T14 inventory
        │      │
        │   T15 daily
        │
     T16 enemies ─┐
     T17 items ───┼── T18 guardian ──┐
     T19 curve ───┘                  │
        └────────────── T20 determinism suite ─────────┘
                                     │
                        T21 README ──┴── T22 vercel
                                             
        T23 optional feel (after T11, any time)
```

## Execution order

**Step 1 — foundation (parallel)**
`T01` scaffold · `T02` doc patches *(already done — see ../PRD.md and ../DESIGN.md)*

**Step 2 — four independent lanes after T01**
`T03` → `T04` (seeding, then generation)
`T05` (BFS) · `T06` (FOV) · `T07` (entities)

These four can be worked simultaneously by different people or agents. They touch disjoint
files and share no state.

**Step 3 — convergence**
`T08` spawn (needs T04, T05, T07) → `T09` combat (T03, T07) → `T10` turns (T05, T06, T09)

**Step 4 — MVP core**
`T11` renderer. **Stop and demo here.** At this point the game is playable end-to-end:
walk, fight, descend, die.

**Step 5 — two parallel lanes**
Content is unblocked as soon as `T10` lands, so it does not have to wait for persistence:

- **Content:** `T16` enemies · `T17` items · `T19` curve → `T18` Guardian
- **Loop closure:** `T12` save → `T13` menus · `T14` inventory → `T15` daily

`T18` is the only content ticket with a hard predecessor of its own (`T16`, `T17`).

**Step 6 — proof**
`T20` determinism suite. **This is the release gate.** It is deliberately last because it
audits code that does not exist until T08 and T12 land. If it fails, the project's headline
claim is false and everything else is decoration.

`T21` README → `T22` Vercel deploy. `T23` feel polish is optional and may land any time
after T11.

> Phase numbers in the index below are **logical groupings**, not a strict sequence. Trust the
> dependency graph above, not the phase column, when deciding what to start next.

---

## Index

| ID | Title | Depends on | Phase |
|---|---|---|---|
| T01 | Repo and toolchain scaffold | — | 1 |
| T02 | PRD / DESIGN doc patches | — | 1 |
| T03 | Seed derivation and dual RNG streams | T01 | 1 |
| T04 | Dungeon generation with acceptance guard | T03 | 1 |
| T05 | BFS distance field and stepping | T01 | 1 |
| T06 | FOV wrapper and explored bitmap | T01 | 1 |
| T07 | Entity model and factories | T01 | 1 |
| T08 | Spawn placement | T04, T05, T07 | 1 |
| T09 | Combat resolution | T03, T07 | 1 |
| T10 | Turn resolution and enemy AI | T05, T06, T09 | 1 |
| T11 | Canvas renderer, HUD, message log | T06, T07, T10 | 1 |
| T12 | Save and load | T04, T10, T11 | 3 |
| T13 | Menus and screens | T11, T12 | 3 |
| T14 | Inventory screen | T11, T12 | 3 |
| T15 | Daily challenge mode | T13 | 3 |
| T16 | Enemy roster and behaviours | T09, T10 | 2 |
| T17 | Item roster, placement, drops | T09, T10 | 2 |
| T18 | Guardian boss and victory | T16, T17 | 3 |
| T19 | Difficulty curve configuration | T16, T17 | 2 |
| T20 | Determinism test suite | T04, T08, T12 | 4 |
| T21 | README and architecture writeup | all | 4 |
| T22 | Vercel deployment | T01, T21 | 4 |
| T23 | Optional feel: hit flash, transition | T11 | 4 |
