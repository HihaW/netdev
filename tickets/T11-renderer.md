# T11 — Canvas renderer, HUD, message log

**Depends on:** T06, T07, T10
**Spec:** DESIGN.md §1.4, §4.1, §9, §10, §10.1
**Phase:** 1 — **MVP CORE**

## Goal

The first ticket you can demo. At the end of this one the game is playable end-to-end: walk,
fight, pick up, descend, die. **Stop and play it before starting T12.**

## What to build

### 1. `index.html` and the canvas host

```html
<div id="game"></div>
<script type="module" src="/src/main.ts"></script>
```

`ROT.Display` **creates its own canvas** — it cannot be attached to an existing element. Append
`display.getContainer()` to `#game`. Everything else (HUD, message log, menus) is DOM layered
over or under that canvas.

```ts
const display = new ROT.Display({
  width: 60, height: 25,
  fontSize: 14, fontFamily: "monospace",
  bg: "#000", fg: "#c0c0c0",
});
host.appendChild(display.getContainer());
```

Note the API surface: there is **no `setFontSize`** and **no `setBackgroundColor`**. Use
`display.setOptions({...})`. `drawText`'s fourth parameter is `maxWidth`, not a colour.

### 2. ASCII only — this is a requirement, not a style choice

rot.js does no CP437 remapping; it renders whatever string you pass to `fillText`. v1 ships no
web font, because "zero network requests after initial page load" (PRD.md §9) is a hard
requirement. Restricting the glyph set to ASCII guarantees identical output under any
monospace font and removes font coverage as a failure mode.

The exact glyph and colour table is DESIGN.md §10.1. Use it verbatim.

### 3. The three-tier draw

Per tile, in one pass:

| State | Draw |
|---|---|
| Currently visible | Glyph at full colour |
| Explored, not visible | Same glyph, foreground `#4a4a4a` |
| Never explored | `display.clear()` that cell — draw nothing |

**Entities are drawn only when currently visible.** A remembered enemy is never shown, at its
old position or its live one. The original spec only covered terrain dimming; showing live
entities in explored tiles removes the entire tension from exploration.

Corpses are entities with `kind: "corpse"`, so they follow the entity rule — visible only when
visible. Draw them at `#3a3a3a`.

Do not clear and redraw the whole grid every frame unless you have measured a reason to. rot.js's
canvas backend already tracks dirty cells for the repaint schedule; drive
`display.draw()` for the cells that changed.

### 4. HUD — `src/ui/hud.ts`

DOM overlay. Contents: seed, current level, HP, ATK, DEF, potion count, turn count.

`ATK`/`DEF` shown are the **effective** values including equipment, so the player can see the
effect of a pickup without opening the inventory.

### 5. Message log — `src/ui/hud.ts`

The last **3** lines, oldest first, below the map. Fed by `pushMessage` from T10.

### 6. Input — `src/main.ts`

The keymap from DESIGN.md §9:

| Key | Action |
|---|---|
| Arrows / WASD | Move 8-directional; bumping a hostile entity attacks |
| `.` / `5` / Space | Wait one turn |
| `i` | Toggle inventory (stub for now — T14) |
| `Esc` | Pause menu (stub for now — T13) |
| `?` | Key reference (stub for now — T13) |

There is deliberately **no `>` key** and **no `g` key**. Stairs auto-descend, items
auto-pickup.

One keypress resolves one full turn synchronously, then renders once, then reads the next key
(DESIGN.md §4.1). No animation, no input buffering, no `requestAnimationFrame` in the game
logic.

Map the key event to a direction, not to a tile offset: the direction is passed to
`resolvePlayerAction`, and T10 owns the no-corner-cutting rule. Do not re-derive movement
geometry in the input layer.

### 7. Death

On player death, clear the save slot inline:

```ts
localStorage.removeItem("netdev_save_v1");
```

Do **not** import anything from `save.ts` here — T12 depends on T11, so a call from T11 into T12
is a circular dependency. The one-liner is the whole requirement at this stage.

The run-history record is T12's job, and the full game over *screen* is T13's. For now, log the
death and return to a blank state so the loop is demonstrable.

## Tests — `test/renderer.test.ts`

`environment: "node"`, so test the pure layer and assert the DOM layer by structure:

- [ ] A render pass over a 60×25 level writes exactly 1500 tile draws plus entity draws
- [ ] Every tile in the map is in exactly one of the three states
- [ ] A wall tile at an unexplored position emits no draw call
- [ ] An entity outside the current FOV emits no draw call, even if its tile is explored
- [ ] A corpse inside the FOV emits exactly one draw call
- [ ] The glyph returned for every tile matches DESIGN.md §10.1 for its tile kind
- [ ] `pushMessage` keeps exactly the newest 3 lines and drops the oldest
- [ ] The 3 message lines are returned in oldest-to-newest order
- [ ] The keymap covers every key in DESIGN.md §9 and no others
- [ ] `buildKeymap()` returns distinct actions for `.`, `5`, and Space (all wait)
- [ ] Every key in the map resolves to one of the 8 directions or a named action — no `undefined`
- [ ] No glyph anywhere in the renderer is outside printable ASCII (assert with a regex over
      the colour/glyph table)

## Done when

- [ ] Playable end-to-end: walk, fight, pick up, descend through several levels, die
- [ ] `test/renderer.test.ts` green
- [ ] DevTools Network tab shows **zero** requests after the initial page load
- [ ] A seed typed on two different machines produces the same first screen
- [ ] `npm run verify` exits 0
