# T13 — Menus and screens

**Depends on:** T11, T12
**Spec:** DESIGN.md §8.3, §8.4, §9
**Phase:** 3

## Goal

`src/ui/menus.ts`. Every screen between "page loaded" and "turn resolved", as DOM. The
original spec listed only a HUD and an inventory panel while promising a main menu, a game
over screen, and a victory screen — none of which had a design.

## What to build

### 1. Screen routing

A single explicit state in `main.ts`: `"title" | "playing" | "inventory" | "paused" | "gameover" | "victory"`.
Not a router library, not a state machine library. A union and a `switch`.

The canvas stays mounted and keeps rendering behind the overlays. Do not tear it down and
rebuild it on every navigation — losing the canvas means losing the display's dirty-cell
tracking.

### 2. Main menu

| Element | Behaviour |
|---|---|
| Title | `NETDEV` |
| Seed input | Text field, prefilled with a random seed on each visit |
| **Start Run** | Uses the typed seed |
| **Random Seed** | Refills the field with a new random seed |
| **Continue** | Only if `netdev_save_v1` exists. Label it with the seed and level it will load |
| **Daily Challenge** | Seeds from the UTC date (T15) |
| **Run History** | Opens the history list |

The seed is a **string**, not a number — words make seeds shareable, and `cyrb53` hashes
arbitrary text. Accept any non-empty string; trim whitespace.

### 3. Pause menu — `Esc`

Resume · **Save and Quit** · Restart Run · Help

**Save and Quit** writes the save (DESIGN.md §8.3) and returns to the main menu, where
Continue is now enabled. Restart Run discards the save and starts from level 1 with the same
seed — a roguelike restart, not a reload.

Add a confirm step to Restart Run. It destroys a run irreversibly and it is one keystroke away
from Save and Quit.

### 4. Help

The keymap from DESIGN.md §9, rendered from the same table the input layer uses. Do not
hand-write a second copy in HTML — it will drift. A test asserts the two match.

### 5. Game over

Cause of death (the enemy name, or `the dungeon` for a non-combat cause), level reached,
turns, kills, and **the seed displayed prominently with a copy-to-clipboard button**.

The seed is the point of the entire project. It should be the largest text on the screen and
one click from the clipboard.

### 6. Victory

Same content as game over with `won: true`, reached on level 10 (T18). Reached-level shows 10.

### 7. Run history

The last 50 entries from `netdev_history_v1` (T12): seed, level, turns, won/lost, date. Newest
first. Clicking an entry copies its seed.

## Tests — `test/menus.test.ts`

`environment: "node"` for the routing logic; assert DOM structure via a JSDOM test file rather
than adding JSDOM to the whole suite (T01 deliberately set `environment: "node"` so that a
needing-a-DOM test signals a layering violation).

- [ ] The screen union has exactly the six states, and every transition in the spec is
      reachable
- [ ] `title → playing` via Start Run
- [ ] `title → playing` via Continue, only when a save exists
- [ ] `title` with no save hides Continue entirely rather than showing a disabled button
- [ ] Continue's label reports the seed and level that will load
- [ ] An empty or whitespace-only seed is rejected without starting a run
- [ ] A very long seed string (10 000 chars) is accepted and hashes to a valid seed
- [ ] `playing → paused → playing` via Resume, with no state loss
- [ ] **Save and Quit** writes the save and returns to `title`
- [ ] Restart Run discards the save and re-enters at level 1 with the same seed
- [ ] Restart Run requires confirmation
- [ ] The help table is generated from the same source as the input keymap — assert they are
      equal, so they cannot drift
- [ ] The game over screen shows the seed, and the copy button yields exactly that string
- [ ] The victory screen reports level 10 and `won: true`
- [ ] History renders newest-first and is capped at 50 entries
- [ ] Clicking a history entry copies that entry's seed, not the current run's

## Done when

- [ ] `test/menus.test.ts` green
- [ ] Every screen is reachable and escapable by keyboard alone
- [ ] A full run can be started, paused, saved, quit, and continued from the main menu
- [ ] `npm run verify` exits 0
