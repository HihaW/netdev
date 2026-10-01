# AGENTS.md — Netdev

**Read in this order:**

1. **`handoff.md`** — where the work is right now. It names the next ticket.
2. **`CONTEXT.md`** — why the design is what it is, and the rot.js traps that cost real
   time to find. Skim the traps section; do not skip it.
3. **`DESIGN.md`** — the closed mechanical spec. Every number, key, formula, and behaviour
   lives there. `PRD.md` holds goals, non-goals, and the definition of done.

**The spec is closed.** A value that is not in `DESIGN.md` or `src/game/config.ts` is scope
invention — ask, do not choose. A ticket's `Done when` checklist is the completion
criterion; a ticket is not done until it is fully checked and `npm run verify` exits 0.

**Three invariants.** The whole project rests on them:

- Build a level through `beginLevelConstruction(seed, level, attempt)`.
- Spend randomness during play through `gameplayRandom()`.
- `src/game/config.ts` owns every tunable number.

`DESIGN.md` §0 is the determinism contract. It is the entire point of the project, and
nothing may weaken it for convenience. If a change would require randomness outside those
two functions, the change is wrong, not the contract.
