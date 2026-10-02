# DESIGN.md — Netdev
### Mechanics & Technical Specification

Companion doc to `PRD.md`. This is the mechanical spec: *how* the game works, with every
number fixed. An implementer must not improvise any value, key, formula, or behaviour
described here. If something is unspecified, it is a bug in this document.

**Status:** Settled — all open questions closed
**Last updated:** 2026-10-02

---

## 0. The Determinism Contract

This is the spine of the whole project. Everything else follows from it.

> Given a seed string `S` and a level number `L`, the dungeon layout, the room list, the
> door positions, the player spawn, the stairs position, every enemy spawn, and every item
> spawn are **byte-identical** on every machine, every browser, forever. No wall-clock
> value, no `Math.random`, no unseeded source may influence level construction.

The contract is enforced by splitting randomness into two streams that never touch:

| Stream | Seeded from | Consumed by | Persisted in save? |
|---|---|---|---|
| **Generation** (`ROT.RNG`, the global singleton) | `deriveSeed(S, L, "gen")` | Level construction **only**: map generation, enemy placement, item placement, item type/tier rolls | No — reproducible by construction |
| **Gameplay** (a private `RNG` instance) | `deriveSeed(S, L, "play")` | **Only** two things: combat damage rolls, and the enemy-death item drop roll | Yes — `playRngState` |

The split exists because rot.js map generators read the *global* `ROT.RNG` and accept no
injected RNG instance ([rot.js#201](https://github.com/ondras/rot.js/issues/201)). So the
global RNG is dedicated to construction, and gameplay never touches it.

**Rule:** if you are about to call `ROT.RNG.random()` outside `dungeon.ts` and `spawn.ts`,
you are writing a bug.

Level-entry saves are written *after* construction completes, so a saved `playRngState` is
always the exact state the resumed run needs. See §8.

---

## 1. Seed & RNG

### 1.1 rot.js does not hash strings

`ROT.RNG.setSeed(value)` takes a **number**. Passing a string silently produces an
identical (zero) internal state every time ([rot.js#184](https://github.com/ondras/rot.js/issues/184)).
We therefore hash the seed string ourselves.

```ts
// cyrb53 — 53-bit string hash. Returns a float in [0, 2^53).
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
```

`toSeed` coerces the 53-bit result into a 32-bit integer that rot.js will accept.
`0` is excluded: rot.js computes `seed < 1 ? 1/seed : seed`, and `1/0` yields `Infinity`,
which truncates back to `0`.

```ts
function toSeed(v: number): number {
  const s = Math.floor(v) >>> 0;
  return s === 0 ? 1 : s;
}
```

### 1.2 Seed derivation

```ts
type Purpose = "gen" | "play";

function deriveSeed(seed: string, level: number, purpose: Purpose, attempt = 0): number {
  const suffix = attempt > 0 ? `|r${attempt}` : "";
  return toSeed(cyrb53(`${seed}|${purpose}|${level}${suffix}`));
}
```

`attempt` is the regeneration attempt index from §2.3. Attempt 0 omits the suffix so the
common case produces the short, readable key `` `${seed}|gen|${level}` ``.

### 1.3 Stream setup

```ts
// Before constructing a level:
ROT.RNG.setSeed(deriveSeed(seed, level, "gen", attempt));   // global, construction only

// Once, per run:
playRng = new RNG().setSeed(deriveSeed(seed, level, "play"));

// On load, restoring the exact gameplay stream:
playRng = new RNG().setState(save.playRngState);
```

`ROT.RNG.getState()` / `ROT.RNG.setState()` are the only supported way to serialise an RNG.

### 1.4 Constraints inherited from rot.js

- The seed value must be a positive integer ≤ `0xFFFFFFFF`. Never pass a string.
- There is no way to inject an RNG into `Map.Digger` / `Map.Uniform`. Work around it, don't try.
- Do **not** install `@types/rot-js` — it is a deprecated stub and conflicts with the types
  rot.js ships itself. `rot-js@2.2.1` bundles correct declarations.

---

## 2. Dungeon Generation

### 2.1 Grid

60 × 25 tiles. Tile codes match what rot.js emits from `Map.create()`:

```ts
export const enum Tile {
  Floor = 0,
  Wall  = 1,
  Door  = 2,
}
```

Stored as a flat `Uint8Array` of `width * height`, indexed `y * width + x`.

### 2.2 Generator

`ROT.Map.Digger` — organic corridors and rooms read better than `Uniform`, and `Uniform`
is reserved as the fallback.

```ts
new ROT.Map.Digger(60, 25, {
  dugPercentage:  0.2,          // the ONLY density knob; no room-count option exists
  roomWidth:      [3, 9],
  roomHeight:     [3, 5],
  corridorLength: [3, 10],
  timeLimit:      3000,         // wall-clock safety valve — see §2.3
});
```

`dugPercentage: 0.2` on a 60×25 grid yields roughly 8–9 rooms. `timeLimit` is raised from
rot.js's default 1000 ms because the limit is **wall-clock**: a slow machine could truncate
generation and produce a different dungeon from the same seed. 3000 ms is roughly three
orders of magnitude above the real cost of a 60×25 Digger run, so it should never fire. It
is a guard against a pathological hang, not a tuning parameter.

### 2.3 Acceptance checks and the regeneration guard

`Digger` has no room-count control, so a bad seed can in principle yield a level with too
few rooms, an unreachable stairs room, or a spawn buried in a wall. Three checks gate every
generated level:

1. `rooms.length >= 4`
2. the spawn tile is `Tile.Floor`
3. the stairs room is reachable from the spawn (BFS distance ≥ 0, §3)

On failure, discard the level and retry with the next attempt index, up to
`maxAttempts = 3` (indices 0, 1, 2). Each attempt seeds the global RNG with
`deriveSeed(seed, level, "gen", attempt)`, so **the retry sequence is itself deterministic**
— the same seed always exhausts its attempts in the same order and lands on the same level.

After the third Digger attempt fails, fall back to `ROT.Map.Uniform(60, 25, { dugPercentage: 0.1, roomWidth: [3,9], roomHeight: [3,5], timeLimit: 3000 })`
seeded from `deriveSeed(seed, level, "gen", 3)`.

`Map.Uniform.create()` returns **`null`** if its time limit expires before two rooms are
connected. The fallback must null-check and, if the resulting level fails the same three
checks, throw:

```ts
export class LevelGenerationError extends Error {
  constructor(readonly seed: string, readonly level: number) {
    super(`Could not generate a valid level for seed "${seed}" at level ${level}`);
  }
}
```

The main menu catches `LevelGenerationError` and shows the message with a re-roll action
rather than crashing. In practice this path is near-unreachable: the Digger guard exists so
that no reachable seed can produce an unplayable level.

### 2.4 Level data

```ts
export interface Room {
  x: number; y: number; w: number; h: number;   // bounds, from Digger.getRooms()
  cx: number; cy: number;                       // centre tile
}

export interface LevelData {
  level: number;
  width: number;
  height: number;
  tiles: Uint8Array;                             // Tile values, length = width * height
  rooms: Room[];
  spawn:  { x: number; y: number };
  stairs: { x: number; y: number };
  generator: "digger" | "digger-retry" | "uniform";
  attempt: number;                               // which attempt index actually succeeded
}
```

`generator` and `attempt` are persisted in the save file so a resumed run reports how its
level was built, and so the determinism tests can assert it.

### 2.5 Spawn and stairs placement

- **Player spawn** — centre tile (`cx`, `cy`) of `rooms[0]`. Digger's first room is the one
  it starts from, so this is the most central room on the map.
- **Stairs** — the reachable room whose centre has the greatest BFS distance from the spawn.
  Rooms are filtered to those BFS can reach *before* the maximum is taken, so a disconnected
  room can never be chosen. If no room is reachable, check 3 fails and the level regenerates.
  Ties break toward the lowest room index, keeping placement deterministic.
- **Enemies and items** — never in `rooms[0]`. See §6.3 and §7.3.

---

## 3. Field of View

### 3.1 Player vision

`ROT.FOV.PreciseShadowcasting`, `topology: 8`, radius **8**, origin at the player's tile.
FOV is recomputed at the end of every turn, and the callback's `visibility` value is
discarded (v1 has no partial transparency).

A tile is **visible** if it was in the callback this turn. A tile is **explored** if it has
ever been visible. A tile is **unknown** otherwise.

Rendering: visible tiles are drawn at full brightness; explored-but-not-visible tiles are
drawn dim; unknown tiles are not drawn. **Entities are drawn only when they are currently
visible** — a remembered enemy is never shown, at its old position or its live one.

### 3.2 Enemy senses

Each enemy runs its own FOV from its own tile, at its own `senses` radius. An enemy becomes
alerted when the player is inside that FOV.

```
alerted  ⟺  chebyshev(player, enemy) <= enemy.senses
         AND player ∈ FOV(enemy, radius = enemy.senses)
```

The distance test runs first as a cheap rejection before the FOV computation.

This is a two-way mechanic: your FOV decides what you see, each enemy's FOV decides what it
sees. It is *not* "the player's FOV alerts every enemy" — that would let a goblin notice
you from behind a wall it has no line of sight to.

### 3.3 Visibility is never leaked in the message log

Any log line that reveals an enemy action (noticing, fleeing, attacking) is emitted **only
if that enemy is in the player's FOV this turn**. Since unseen enemies are frozen (§4.3), a
log line can never disclose a position the player cannot see.

---

## 4. Turn System

### 4.1 Pacing

A turn resolves **synchronously and instantly**. One keypress → resolve the entire turn →
render once → read the next key. No animation, no tweening, no input buffering, no
`requestAnimationFrame` in the game logic. `requestAnimationFrame` is not used at all;
rot.js's canvas backend only schedules a repaint of dirty cells, which is sufficient.

An optional hit flash is permitted later as a pure visual effect that does not gate input
(§12, T23). It may not be introduced before the core loop is complete.

### 4.2 Resolution order

1. Apply the player's action. If it was an attack that killed the player, go to step 8.
2. If the player is dead: **abort the turn immediately.** No enemy acts. No further effects.
3. Walk the enemy list in a stable order (ascending entity id).
4. For each enemy, take exactly one action (§4.3).
5. Recompute the player's FOV.
6. `turnCount++`.
7. Render.
8. If the player is dead, show the game over screen and delete the save.

Auto-descend (§4.5) and the game-over transition short-circuit this order as specified.

### 4.3 The one enemy action rule

For each enemy, in order:

1. **Sense.** If the player is inside the enemy's FOV (§3.2), set `isAlerted = true`,
   record `lastKnown = player position`, reset `giveUp = GIVE_UP_TURNS` (6).
2. **If not alerted, do nothing.** Unseen, unheard enemies are frozen. This is the rule
   that makes the FOV a tactical resource. There is no patrol behaviour and no wandering.
3. **Melee.** If the enemy is adjacent (Chebyshev ≤ 1), attack the player.
   - The Skeleton additionally requires `attackCooldown === 0` (§6.2).
4. **Otherwise, step.** Take one step along a BFS path toward `lastKnown` (§3 of the
   pathfinding rules below). If `lastKnown` is unreachable, the enemy holds position.
5. **Decay.** `giveUp--`. When it reaches 0, clear `isAlerted` and `lastKnown`; the enemy
   stays where it stands and becomes frozen again.

The give-up timer is the primary difficulty knob. If early levels play too quietly, lower it
to 4 before changing anything else.

### 4.4 Pathfinding

`ROT.Path.Dijkstra` has no public distance map — `_computed` is private and `compute()`
requires the target up front (§2.5 of the rot.js docs). We implement our own breadth-first
search in `src/game/bfs.ts`. It is used for three things: stairs placement, enemy step
toward `lastKnown`, and the Goblin's flee step.

```ts
// 8-directional, uniform cost, no corner cutting.
function distanceField(tiles, width, height, ox, oy): Int32Array  // -1 = unreachable
function nextStep(field, ox, oy, x, y): { x, y } | null           // first tile toward the origin
```

**No corner cutting:** a diagonal step from `(x, y)` to `(x+dx, y+dy)` is legal only if
`(x+dx, y)` **and** `(x, y+dy)` are both passable. Without this rule entities visibly slip
between two wall corners.

Memoisation: `distanceField` results are cached for the duration of a single turn, keyed by
origin tile, and the cache is cleared at the start of each turn. Enemies that share a target
therefore share one traversal. At 10 entities on 1500 tiles the worst case is ~15 000 cell
visits per turn, which is free — the cache is there for clarity, not necessity.

The Goblin's flee step is the one consumer that needs a field from the *player* rather than
from the enemy, so it uses `distanceField(player)` and picks the adjacent passable tile with
the greatest field value. If it is already at the maximum, it attacks instead.

### 4.5 Level transition

Stepping onto the stairs tile descends immediately. There is no `>` key and no
"standing on the stairs" state. If the stairs are sealed (§11), the step is refused with a
log line and no turn is consumed.

---

## 5. Combat

### 5.1 Damage

```
damage = max(1, attacker.atk - defender.def + roll)      roll ∈ {-1, 0, +1}
```

`roll` is drawn uniformly from the **gameplay** RNG and is the only consumer of that stream
outside item drops. The `max(1, …)` floor means armour alone can never make you invulnerable.

Attacks are **bump-to-attack**: moving into a tile occupied by a hostile entity attacks it
instead of moving. Moving into a wall is a no-op that consumes no turn and logs nothing.

### 5.2 Death

- HP ≤ 0 → the entity's kind becomes `corpse` in place, its stats are zeroed, and it is no
  longer hostile or passable-by-AI. Corpses are **cosmetic, walkable, and permanent** — they
  render dim and never expire.
- On an enemy death, roll `DROP_CHANCE` (0.35) against the gameplay RNG. On success, drop one
  potion. Weapons and armour are never dropped.
- Player HP ≤ 0 → delete the save (§8), append a run-history record (§8.4), show game over.

### 5.3 Items are picked up by walking over them

Stepping onto an item tile picks it up automatically. Weapons and armour **replace** the
currently equipped piece (the old one is discarded, not dropped). Potions go to the
inventory. There is no `g` key.

---

## 6. Enemies

### 6.1 Stat table

| id | Name | Glyph | HP | ATK | DEF | senses | Behaviour | Unlocks |
|---|---|---|---|---|---|---|---|---|
| `rat` | Rat | `r` | 5 | 2 | 0 | 8 | Direct chase | L1 |
| `skeleton` | Skeleton | `k` | 15 | 5 | 2 | 4 | Chase, **attacks every other turn** | L2 |
| `goblin` | Goblin | `g` | 10 | 4 | 1 | 8 | Chase, **flees below 30% HP** | L4 |
| `guardian` | Guardian | `G` | 60 | 7 | 3 | 10 | Telegraphed cleave (§11) | L10 only |

### 6.2 The Skeleton's cadence

The Skeleton commits to a swing. `attackCooldown` starts at 0 and behaves as follows on each
of its turns:

- `attackCooldown === 0` and adjacent → attack, then set `attackCooldown = 1`.
- `attackCooldown > 0` → decrement to 0, do not attack, and take one step along its path if a
  step exists (which, when adjacent, there is not — it holds).

So it alternates strike / hold, and its off-turn is a free window for the player. This is the
mechanic that makes its 15 HP / 5 ATK / 2 DEF block a genuine threat rather than a slow rat:
standing next to it costs you a hit every other turn, and the correct answer is to hit back
during its hold.

### 6.3 Spawning

- Count for levels 1–9: `min(10, 3 + floor(level * 0.8))` — L1→3, L2→4, L5→7, L9→10.
- **Level 10 is special-cased: the Guardian spawns alone, and no other enemy or item spawns.**
- Type selection is a uniform draw from the set unlocked at that level (§6.1).
- Placement: a random floor tile in a non-starting room, with a Chebyshev distance of at
  least `MIN_SPAWN_DISTANCE` (5) from the player spawn, no two entities sharing a tile.
  Up to 20 placement retries per enemy; if all fail, skip that enemy.
- **Stat scaling:** `+1 DEF` at levels 4, 7, and 10. HP and ATK never scale. Keeping the curve
  flat is what makes it tunable by feel rather than by spreadsheet.

---

## 7. Items

### 7.1 Roster

Items are entities with `kind: "item"`, not a separate collection.

| id | Name | Glyph | Effect | Source |
|---|---|---|---|---|
| `potion` | Potion | `!` | `hp: 8` on consume | 35% drop, stackable, uncapped |
| `weapon_1` | Rusty Blade | `/` | `atk: +1` | Found |
| `weapon_2` | Steel Sword | `/` | `atk: +2` | Found |
| `weapon_3` | Mithril Edge | `/` | `atk: +3` | Found |
| `armor_1` | Leather Vest | `[` | `def: +1` | Found |
| `armor_2` | Chain Mail | `[` | `def: +2` | Found |

Weapons and armour are **found, never dropped**, and replace whatever is equipped.
The player starts with no equipment: `hp 20, atk 4, def 1`, bare-handed.

### 7.2 Equip and consume

Equipping is automatic on pickup (§5.3). Consuming is an action from the inventory screen.
Drinking at full HP is refused with a log line and consumes no turn.

### 7.3 Placement

Item candidates per level: `floor(nonStartingRoomCount / 3)` — roughly 2–3 per level.
Type is drawn from a per-level weighted table:

| Level | Potion | Weapon | Armour |
|---|---|---|---|
| 1–2 | 40% | 40% | 20% |
| 3–5 | 35% | 40% | 25% |
| 6–9 | 30% | 40% | 30% |

Tier is derived from depth, not rolled: `weaponTier = clamp(1 + floor((level - 1) / 3), 1, 3)`
and `armorTier = clamp(1 + floor((level - 1) / 4), 1, 2)`. Level 10 places nothing.

---

## 8. Save / Load

### 8.1 Storage keys

| Key | Contents |
|---|---|
| `netdev_save_v1` | At most one in-progress run, or absent |
| `netdev_history_v1` | Run history, most recent 50 entries |

### 8.2 What is saved

The map is **not** saved. §0 guarantees it can be regenerated byte-identically, so
persisting it would be redundant state that can only drift.

```ts
interface SaveFile {
  version: 1;                     // bump on any breaking schema change
  seed: string;
  level: number;
  turnCount: number;
  kills: number;                  // run-wide, not per level
  player: SerializedEntity;       // every field of a PlayerEntity
  inventory: InventoryEntry[];
  entities: SerializedEntity[];   // enemies, floor items, corpses
  explored: string;               // base64 of a Uint8Array(width*height)
  playRngState: [number, number, number, number];
  generator: "digger" | "digger-retry" | "uniform";
  attempt: number;
  savedAt: string;                // ISO 8601, display only
}

interface InventoryEntry {
  itemId: ItemId;
  stack: number;                  // a potion stacks; equipment is always 1
}

// Every field of an entity is a JSON primitive, so SerializedEntity is the
// entity. `player` and `entities` hold different things: `player` is the one
// player, `entities` is everything else that moves or can be walked over.
type SerializedEntity = Entity;
```

`explored` is stored as base64 of a raw `Uint8Array` (1 byte per tile, 0 or 1), encoded in
chunks so the encoder never exceeds its argument limit.

`kills` is run-wide, so it is persisted: a resumed run must still be able to report how
many enemies it killed. Corpses cannot stand in for it — they are per-level.

`version` is checked before anything else is read, and a mismatch is refused rather than
guessed at.

**Timestamps come from the caller.** `savedAt` needs a wall clock, and no wall-clock value
may influence `src/game/`. The save module therefore exposes an injectable clock that the
app entry point installs, and tests replace with a fixed one. The alternative — one
`new Date()` inside `src/game/save.ts` — would break the rule that makes a seeded run
reproducible, for the sake of a field the game only ever displays.

On load: regenerate the level with the saved `generator` and `attempt`, then restore every
mutable field, then `playRng = new RNG().setState(save.playRngState)`.

A save that cannot be parsed — corrupt JSON, a wrong version, an `explored` that is not
`width * height` bytes — reads as **no save**, not as a crash. The main menu must be able to
ask whether a run can be resumed without that question throwing.

### 8.3 Triggers

| Event | Action |
|---|---|
| Starting a run | Write the save — starting at level 1 is entering a level |
| Descending into a new level | Write the save (after construction, before any gameplay RNG use) |
| Explicit quit from the pause menu | Write the save |
| Player death | **Delete the save** — permadeath, per roguelike convention |
| App start | If `netdev_save_v1` exists, offer **Continue** on the main menu |

There is no save on every turn. Writes happen on level entry and explicit quit only, so
quitting mid-level resumes from the last checkpoint, not from the last keystroke. A resumed
run therefore reports the checkpoint's `turnCount`, not the last turn the player actually
played, and that is the honest number.

The level-entry write is the subtle one: it must capture `playRngState` at the moment the new
level begins, which is before the player has spent a single roll on it.

### 8.4 Run history

On death or victory, append a record to `netdev_history_v1`, newest first, capped at 50
entries:

```ts
interface RunRecord {
  seed: string;
  level: number;
  turns: number;
  kills: number;
  cause: EnemyId | null;         // the enemy that landed the blow, or null
  won: boolean;
  endedAt: string;               // ISO 8601, display only
}
```

`cause` is stored as an enemy id, not as a sentence. "Killed by a rat" is a rendering
decision that belongs to the game over screen, not to the record.

The game over and victory screens display the seed prominently — sharing it is the point of
the whole project.

---

## 9. Controls

| Key | Action |
|---|---|
| Arrow keys / WASD | Move (8-directional). Bumping a hostile entity attacks it |
| `.` / `5` / Space | Wait one turn |
| `i` | Toggle inventory |
| `Esc` | Pause menu (Resume / Save and Quit / Restart Run / Help) |
| `?` | Key reference |

There is deliberately **no `>` key** (stairs auto-descend, §4.5) and **no `g` key** (items
auto-pickup, §5.3). Bumping a wall consumes no turn and logs nothing.

### 9.1 Screens

Six screens, one union, one switch. Not a router and not a state machine library:

| Screen | Reached by | Left by |
|---|---|---|
| `title` | App start, Save and Quit, Main Menu | Start Run, Continue |
| `playing` | Start Run, Continue, Resume, Play again | `i`, `Esc`, `?`, dying |
| `inventory` | `i` | `i`, `Esc`, Close |
| `paused` | `Esc`, `?` | Resume, `Esc`, Save and Quit |
| `gameover` | The player's HP reaching 0 | Play again, Main Menu, `Esc` |
| `victory` | The Guardian dying and the stairs being taken (T18) | Play again, Main Menu, `Esc` |

Two things that look like screens are not, deliberately: the key reference is a view of
`paused` (reached by `?`), and run history is a view of `title`. Adding either as a seventh
state would make the union lie about how many places the player can be.

The canvas is mounted once and never rebuilt. The overlays sit on top of it and it keeps
rendering behind them, because tearing it down would lose the display's dirty-cell tracking.

| Screen | Shows |
|---|---|
| `title` | Seed field (prefilled), Start Run, Random Seed, Continue when a save exists, Run History when there is any |
| `paused` | Resume · Save and Quit · Restart Run · Help, and a confirm step before Restart |
| `inventory` | What is carried. Read-only; consumption is §7.2 and belongs to the inventory work |
| `gameover` / `victory` | Cause, level reached, turns, kills, and **the seed as the largest text on the screen with a copy button** |

Two rules the screens have to keep:

- **A keypress resolves to exactly one destination.** With overlays up, the overlay owns the
  keyboard: `Esc` backs out one level, `i` closes the inventory, and nothing else is swallowed,
  so a focused button and the seed field keep working.
- **The seed is the point of the project.** It is offered pre-filled, shown large at the end of
  a run, one click from the clipboard, and listed in history. `?seed=…` in the URL pre-fills the
  field.

---

## 10. File Structure

```
src/
  main.ts                 # entry point, input binding, screen routing
  game/
    types.ts              # Tile, Room, LevelData, Entity union, SaveFile
    config.ts             # every tunable number in this document
    rng.ts                # cyrb53, deriveSeed, gen/stream setup, state serialisation
    dungeon.ts            # Digger + Uniform + acceptance checks
    bfs.ts                # distanceField, nextStep, per-turn memo
    fov.ts                # player FOV, per-enemy senses FOV, explored bitmap
    entities.ts           # entity factories and id allocation
    spawn.ts              # player, stairs, enemies, items
    combat.ts             # calculateDamage, attack resolution, death, drops
    turns.ts              # turn resolution order, aggro, flee, level transition
    save.ts               # serialise, deserialise, triggers, run history
    daily.ts              # dailySeed, countdown to next UTC rollover
  data/
    enemies.ts            # stat table from §6.1
    items.ts              # roster from §7.1, weighted tables from §7.3
  ui/
    renderer.ts           # canvas draw loop
    hud.ts                # DOM overlay: status, message log
    menus.ts              # DOM: main, pause, inventory, game over, victory
test/
  rng.test.ts
  dungeon.test.ts
  bfs.test.ts
  fov.test.ts
  combat.test.ts
  save.test.ts
  daily.test.ts
  determinism.test.ts
```

Data tables are **`.ts` modules, not `.json`**. A typed module gets compile-time checking
against the stat table's shape, and avoids `resolveJsonModule` / import-assertion friction in
both Vite and Vitest.

### 10.1 rot.js rendering API

`ROT.Display` creates its own canvas element — it cannot be attached to an existing node.
Append `display.getContainer()` to a host div. The relevant surface:

```ts
const display = new ROT.Display({ width: 60, height: 25, fontSize: 14, fontFamily: "monospace", bg: "#000" });
host.appendChild(display.getContainer());
display.draw(x, y, "r", "#c0c0c0", "#000");
display.clear();
display.setOptions({ /* … */ });   // there is no setFontSize or setBackgroundColor
```

**ASCII only.** rot.js does no CP437 remapping — it renders whatever string you pass — and
v1 ships no web font, because "zero network requests" is a hard requirement. Restricting the
glyph set to ASCII guarantees identical output under any monospace font and removes font
coverage as a failure mode. No box-drawing, no Unicode.

| Thing | Glyph | Colour |
|---|---|---|
| Wall | `#` | `#5a5a5a` |
| Floor | `.` | `#2a2a2a` |
| Door | `+` | `#8a6d3b` |
| Stairs | `>` | `#e0e0e0`, sealed: `#555` |
| Player | `@` | `#ffffff` |
| Enemy | `r` `k` `g` `G` | `#e05a5a`, Guardian `#ffdd44` |
| Item | `!` `/` `[` | `#e0c060` |
| Corpse | `%` | `#3a3a3a` |
| Explored terrain | — | same glyph, fg `#4a4a4a` |

---

## 11. The Guardian

Level 10's stairs are **sealed** while a Guardian is alive. The seal is not a stored flag —
it is the existence of an entity with `kind: "enemy"` and `type: "guardian"`, so it cannot
drift out of sync with the actual board.

The Guardian chases like any other enemy, using the same per-enemy BFS, plus one ability:

**Telegraphed cleave.** At the start of its turn, if the player is adjacent, the Guardian
spends that turn winding up (logged: *"The guardian winds up a massive swing."*) and lands
the cleave on its **next** turn, dealing `atk` damage to the player and to every entity on
a tile orthogonally adjacent to the Guardian. Any other adjacency behaviour is the normal
single-target attack.

Because turns are instantaneous (§4.1), the telegraph is the message line, and the player
gets one free turn to disengage. That is the intended read: the Guardian is a positioning
and timing test, not a damage race.

Sequence: Guardian dies → seal lifts → the stairs become walkable → step on them →
**victory**.

---

## 12. Phasing

| Phase | Content | Phase-out criterion |
|---|---|---|
| **1 — Core** | Generation, FOV, movement, one enemy, melee, stairs, death handling | T11 green |
| **2 — Content** | Full enemy roster, items, difficulty curve | T19 green |
| **3 — Loop closure** | Save/resume, run history, menus, inventory, daily seed, Guardian | T18 green |
| **4 — Proof & polish** | Determinism suite, README, deploy, optional feel | T20 + T22 green |

The determinism suite (T20) is deliberately last: it is only meaningful once the level
construction it audits is complete. It is the ticket that makes this project's headline claim
falsifiable, so it is a release gate, not a nicety.

Optional feel work, explicitly out of scope until then: hit flash, level-transition wipe
(T23). No sound, no mobile touch controls, no particles.
