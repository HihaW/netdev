# CONTEXT.md — Netdev

**Why the design is what it is, and what will bite you if you change it.**

This file complements `DESIGN.md`; it does not replace it. `DESIGN.md` is the closed
mechanical spec and holds every number. **Where the two overlap, `DESIGN.md` wins.** Nothing
here is a licence to adjust a value.

---

## The one idea

A seed string must produce the same dungeon **forever** — same rooms, same walls, same stairs,
same enemies, same items — and the game must be able to resume a run without storing the
map.

The first half is a familiar roguelike promise. The second half is what makes it expensive,
and it is why this project has the structure it does. If the map is never stored, then
everything that *shaped* the map must be reproducible from the seed alone. That rules out
anything that touches randomness outside level construction, which in turn rules out sharing
one random stream between construction and play.

rot.js forced the shape of the answer: its map generators read the **global** `ROT.RNG` and
accept no injected RNG instance ([rot.js#201](https://github.com/ondras/rot.js/issues/201)).
So the global RNG is dedicated to level construction, and gameplay randomness lives in a
private `RNG` instance whose 4-number state is saved. The map is regenerated on load; the
dice are not.

That is the whole architecture. `DESIGN.md` §0 states it as a contract; this is the reason it
exists.

---

## Mechanics at a glance

> **Non-authoritative.** This section exists to orient a reader in thirty seconds. If it
> contradicts `DESIGN.md`, `DESIGN.md` is right and this is stale. Do not edit a number here
> — change it in `DESIGN.md` and `src/game/config.ts`.

- **Grid** 60 × 25, flat `Uint8Array`, indexed `y * width + x`. Tiles are floor / wall / door.
- **Vision** shadowcasting, radius 8, topology 8. Three tiers: visible → explored (dim) →
  unknown (undrawn). Entities draw only when currently visible.
- **Senses** two-way. Your FOV decides what you see; each enemy's own FOV, at its own
  `senses` radius, decides what it sees. Unseen enemies are frozen.
- **Player** 20 HP, 4 ATK, 1 DEF, bare-handed. Damage is `max(1, atk - def + roll)` with
  `roll ∈ {-1, 0, +1}`. Armour can never make you invulnerable.
- **Enemies** Rat (5/2/0, senses 8) · Skeleton (15/5/2, senses 4, attacks every other turn) ·
  Goblin (10/4/1, senses 8, flees below 30% HP) · Guardian (60/7/3, senses 10, level 10 only).
- **Curve** `min(10, 3 + floor(level * 0.8))` enemies, `+1 DEF` at levels 4/7/10, no HP or
  ATK growth. Skeleton unlocks at L2, Goblin at L4.
- **Items** one potion (heal 8, 35% drop), three weapon tiers (+1/+2/+3 ATK), two armour tiers
  (+1/+2 DEF). Found, never dropped. Auto-pickup; equipment replaces on contact.
- **Save** on level entry and explicit quit, never per turn. Death deletes it. Run history
  capped at 50.
- **Win** 10 levels. Level 10's stairs are sealed while the Guardian lives; kill it, then
  step on the stairs.
- **Daily** seed is the UTC calendar date, so everyone on Earth gets the same dungeon today.

---

## Library traps

Every one of these was found by reading the source, not the docs. Each one silently produces a
wrong result rather than an error.

| Trap | Consequence |
|---|---|
| `ROT.RNG.setSeed()` takes a **number**. A string silently produces an identical zero state every call ([#184](https://github.com/ondras/rot.js/issues/184)) | We hash the seed string ourselves with `cyrb53` |
| `seed` of `0` is invalid: rot.js computes `1/seed` → `Infinity` → truncates to `0` | `toSeed()` coerces to `[1, 0xFFFFFFFF]`, never `0` |
| Map generators read the **global** `ROT.RNG` and accept no injected RNG ([#201](https://github.com/ondras/rot.js/issues/201)) | The global RNG is construction-only. `RNG.clone()` does not help |
| `ROT.Path.Dijkstra` exposes **no distance map** — `_computed` is private and `compute()` needs the target up front | We implement our own BFS (~30 lines) rather than reach into privates |
| `ROT.Display` has **no** `setFontSize` or `setBackgroundColor` — only `setOptions({...})`. It creates its own canvas; `drawText`'s 4th arg is `maxWidth`, not a colour | Renderer appends `getContainer()` to a host div |
| rot.js does **no CP437 remapping** — it `fillText`s whatever string you pass | v1 is ASCII-only, so any monospace font renders identically. No web font, because zero network requests is a requirement |
| `Digger`'s `timeLimit` is **wall-clock** — a slow machine can truncate generation and break determinism | Raised to 3000 ms, and the acceptance checks make regeneration deterministic anyway |
| `Map.Uniform.create()` can return **`null`** if its time limit expires first | The fallback path must null-check |
| `@types/rot-js` is a **deprecated stub** that conflicts with rot-js's own bundled types | Never install it |
| Shadowcasting is **not symmetric** ([#218](https://github.com/ondras/rot.js/issues/218)) — "you see B from A" does not imply "you see A from B" | Do **not** write an FOV symmetry test. It will fail and it is not your bug. The BFS *is* symmetric, and that one is tested |

---

## Rejected alternatives

The full decision log. Each row is a choice that was made on purpose; the losing option is
recorded so nobody re-litigates it without new information.

### Determinism and generation

| Chose | Rejected | Why |
|---|---|---|
| Own `cyrb53` hash of the seed string | Passing the string to `setSeed` | Silently identical state every time |
| Two streams: global for construction, private for play | One shared global stream | A combat roll would shift enemy spawns, so a regenerated level would not match the one the player left. Silently breaks save/resume |
| Two streams | No randomness in combat at all | Zero divergence risk, but every fight resolves identically forever, forever, for everyone |
| Persist `playRngState` in the save | Omit it, regenerate the dice | 4 numbers buys an exactly-resumable combat stream. Nearly free |
| `Digger` + deterministic regen guard | `Uniform` as the primary generator | Organics read as a dungeon; `Uniform` reads as a diagram. Kept as the fallback |
| Guard: 3 attempts, each seeded `deriveSeed(…, attempt)`, then `Uniform` | 3 attempts then give up / hand-rolled fallback | The attempt index feeds the seed, so the retry sequence is itself deterministic. A seed that needs 2 attempts always needs 2 |
| Acceptance checks (≥4 rooms, spawn on floor, stairs reachable) | Trusting the generator | `Digger` has no room-count knob, so a bad seed can yield an unplayable level. A daily game must never hand someone one by date |
| Own BFS, 8-dir, no corner cutting, memoized per turn | `ROT.Path.Dijkstra` | No public distance map. A private-API dependency on an unmaintained library is worse than 30 lines |
| Per-enemy BFS memoized by target | One shared field from the player | Enemies have different targets under last-known-position. Two code paths for a saving that is not measurable at 1500 tiles |

### Movement, vision, and AI

| Chose | Rejected | Why |
|---|---|---|
| 8-directional, no corner cutting | 4-directional | Plays better and matches rot.js defaults |
| 8-directional, no corner cutting | 8-directional allowing corner cutting | Entities visibly slip between two wall corners. Immediate player-visible bug |
| Enemies act only if in FOV or alerted; unseen are frozen | Everything acts, unaware wander / idle | FOV becomes a tactical resource instead of decoration. Also what makes the message log non-leaking |
| Last-known-position + 6-turn give-up | Omniscient chase once alerted | An alerted enemy across the level is then a guaranteed death sentence |
| Per-enemy FOV at a per-type `senses` radius | The player's FOV is the sole alert trigger | The cheap version lets a goblin notice you from behind a wall it has no line of sight to. A reviewer notices |
| Deleted the Skeleton's patrol | Keeping patrol | Patrol requires unseen enemies to move, which contradicts "frozen if unseen". The original spec contradicted itself here |
| Skeleton attacks every other turn | Stats only | A 15 HP / 5 ATK enemy with no behaviour is a slow rat. The cadence gives it a readable rhythm and the player a free window |
| Goblin flees below 30% HP | No flee behaviour | The only other genuine behaviour difference, and the cheapest |
| Instant turn resolve, one render per keypress | Per-step animations, or animations for visible actors only | Turn logic stays a synchronous, testable state machine with no input buffering. Feel is Phase 4 and optional |
| The message log never leaks | Log all enemy activity | Unseen enemies are frozen, so a log line cannot disclose an invisible position — but only if the log is gated on player FOV |

### Persistence

| Chose | Rejected | Why |
|---|---|---|
| Regenerate the map on load; save only mutable state | Serialize the map too | Redundant state that can only drift. The map is provably reproducible |
| Save on level entry and explicit quit | Save every turn | Hundreds of localStorage writes per run, and a corruption risk. Quitting mid-level resumes from the last checkpoint, and `turnCount` says so honestly |
| Death deletes the save | Keep it for inspection | Roguelike permadeath |
| Stairs seal = *a Guardian entity exists* | A stored `stairsUnlocked` flag | The only place a derived value beats a cached one. Kill the Guardian, forget to clear the flag, and the stairs stay sealed forever |
| `version: 1` in the save, mismatches rejected | Best-effort load | There is nothing to migrate from yet, so there is no excuse for not versioning |

### Content and balance

| Chose | Rejected | Why |
|---|---|---|
| 10 levels **plus** a Guardian on 10 | 10 levels, no boss *(recommended, declined)* | Your call. Kept affordable by pinning it to one new mechanic and the last phase |
| Guardian alone on level 10 | Guardian + 4 adds, or a full floor | A duel, not a war. A clear read on the telegraphed cleave |
| Guardian in the stair room, stairs sealed | Stairs stay usable · summoned adds · hand-built arena | Reuses the BFS, senses, entity struct, and adjacency already built. Adds exactly one mechanic |
| One-turn windup on the cleave | Instant cleave | Turns are instantaneous, so the log line *is* the telegraph. Makes the fight about positioning rather than a damage race |
| Linear count, flat `+1 DEF` at 4/7/10, no HP or ATK growth | ATK scaling · soft-early-steep-late | HP and ATK growth turns difficulty into a spreadsheet. One DEF step every three levels is tunable by feel, and feel is the only instrument at this scale |
| Minimal tiered roster: 1 potion, 3 weapons, 2 armours | Rare potion + charm · single tier | Potion scarcity is the biggest difficulty lever, so the item table is small enough to balance in one sitting |
| Weapon/armour tiers **derived** from depth, not rolled | Rolling the tier | Also deterministic, but a derived tier is legible: reaching level 7 *means* the best blade is out there |
| Descend and pick up by walking over them | `>` and `g` keys | One key fewer each, and no "am I standing on the stairs" state |
| Corpses are cosmetic, walkable, permanent | Blocking, or removed instantly | Free feedback for a cleared room, costs nothing, and cannot wall off a corridor |
| ASCII only | Box-drawing, Unicode | No web font is allowed, so the glyph set must survive any monospace font |
| Level 10 places no items | Keep the normal placement curve | The duel stays a duel |

### Project

| Chose | Rejected | Why |
|---|---|---|
| Patch the docs where wrong, then ticket | Tickets only, no doc edits | The docs told the implementer to build the wrong thing. `Item` had no `x`/`y`, `MapData` was never defined, two sections contradicted each other |
| Local `tickets/*.md` + index | GitHub Issues · one `PLAN.md` | No tracker configured, no auth needed, readable by a stranger. A public repo gives deploy history later, if wanted |
| Its own git repository | Staying inside `hermes-agent-backup` | A portfolio piece needs a link that points somewhere real |
| English docs and code | Indonesian · bilingual | The portfolio argument only works if a stranger can read it |
| Vitest + strict TS + ESLint + Prettier; `npm run verify` is the gate | Vitest only · no runner | The determinism claim is worthless without a test suite, and "done" must be a command, not a judgement |
| Daily seed is the **UTC** date | Local date *(Wordle's choice)* | Local midnight means two players in different timezones get different dungeons on the same calendar date, which contradicts shareability |
| npm + Node 22, pinned via `.nvmrc` | pnpm · Bun | A stranger can clone and run with zero extra tooling |
| Vercel | GitHub Pages · Netlify · undecided | Chosen; not a load-bearing decision |
| Folder `Gamez`, in-game title `Netdev` | Rename the folder *(recommended, declined)* · new name | Your call. The mismatch is mild and recorded here so it reads as a decision, not an oversight |
| Both algorithmic rigor **and** feel, rigor first | Rigor only · feel first | Rigor first, because the determinism suite is the defensible artefact. Feel is one optional hit flash |
| `CONTEXT.md` includes a mechanics summary | Why and traps only | Requested. It carries a staleness rule, which is how that risk is managed |

---

## Known weak points

All four are deliberate. They are recorded so they read as judgement rather than overselling —
`T21` puts them in the README's limitations section.

1. **Three enemy types, and two of them differ mainly in stats.** Only the Skeleton's cadence
   and the Goblin's flee are genuine behavioural differences. The PRD asked for 3–5 with
   differing behaviour. The cheapest real addition is a ranged attacker, which needs an
   attack-range concept and a line-of-sight check — not worth it before the determinism suite
   lands.
2. **The Guardian is one mechanic.** No second phase, no adds, no arena.
3. **Save is per level-entry, not per turn.** Quitting mid-level loses that level's progress.
   This is the price of not writing to localStorage 500 times a run.
4. **Save schema is version 1 and has never been migrated**, because there is nothing to
   migrate from.

There is also a real tuning risk, not a known defect: `GIVE_UP_TURNS = 6` combined with
"unseen enemies are frozen" may make early levels feel quiet. If it does, **lower the
give-up timer to 4 before changing anything else** — that is the knob, not the stat blocks.
`T19` is the ticket for this and it is mostly playtesting.

---

## Repo facts

- `Gamez/` is a **subdirectory of `/home/hihaw`**, a repo named `hermes-agent-backup`, with a
  large untracked tree. It has no `.git` of its own. `T01` initialises one.
- rot.js is **not installed anywhere** on this machine.
- Last release of rot.js was 2.2.1 in Nov 2024; the author considers it feature-complete and
  accepts bugfixes only. There is no widely-adopted successor — `lostfictions/rot.ts` is the
  notable fork, and it is not merged upstream. Pinning exactly is the right call and is
  deliberate, not caution.
- No web fonts, no CDN, no analytics, ever. The zero-network-requests requirement is verified
  manually on the **deployed** build, because dev-only leaks (HMR client, source maps,
  plugin-injected scripts) are invisible locally.

---

## Invariants

Stated positively, because a bare prohibition tends to summon the thing it forbids. The
enforcement is in each ticket's `Done when` checklist.

- **Build a level** through `beginLevelConstruction(seed, level, attempt)`, then
  `generateLevel()`. The global RNG is construction-only.
  *Enforced by:* `grep -rn "ROT.RNG" src/` must match only `rng.ts`, `dungeon.ts`, `spawn.ts`.
- **Spend randomness during play** through `gameplayRandom()`. Its only two consumers are
  combat damage rolls and the enemy-death drop roll.
  *Enforced by:* the contamination test in `T20` — regenerate a level after 10 000 gameplay
  draws and require byte-identical output.
- **Numbers live in `src/game/config.ts`.** `DESIGN.md` is its written form; they must agree.
- **A value that is in neither is scope invention.** Ask.

And one rule for the game logic specifically: **no wall-clock value may influence state.**
No `Date.now`, no `performance.now`, no `setTimeout` in `src/game/`. The daily seed is the sole
exception and lives in `daily.ts`, isolated. This is what keeps the determinism claim
defensible — a single timer is enough to make a seeded run irreproducible.
