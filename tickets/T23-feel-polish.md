# T23 — Optional feel: hit flash and level transition

**Depends on:** T11
**Spec:** DESIGN.md §4.1, §12
**Phase:** 4 — optional

## Goal

Two small visual effects. This is the entire feel budget for v1 (PRD.md §3). It is last,
optional, and explicitly must not become a dependency of anything.

## What to build

### 1. Hit flash

When the player is hit, flash their glyph for one render. Implementation: track a
`flashUntilRender: boolean` (or a turn counter) on the player entity, render `@` in a bright
colour while set, clear it on the next render.

Do **not** add a `setTimeout`. A timer decouples the visual from the turn, which means the
flash can land after the next keypress, and it introduces a wall-clock dependency into a
project whose central claim is that nothing external influences state.

Same for the enemy being hit — brief, one render.

### 2. Level transition

On auto-descend, one frame of the new level is drawn before the first real render. The cleanest
implementation is a boolean in the render loop, not a delay. If it needs more than that to look
right, that is a sign it has grown into an animation system, which v1 does not have.

### 3. Explicitly not in scope

- Sound effects
- Particles
- Screen shake
- Sprite or tile art
- Smooth camera movement
- Any `requestAnimationFrame` in the game logic

If one of these is tempting, it is a design change. File it; do not build it.

## Tests — `test/feel.test.ts`

- [ ] The flash flag is set on a hit and cleared on the very next render
- [ ] The flash renders for exactly one frame, not a duration
- [ ] `grep -rn "setTimeout\|setInterval\|requestAnimationFrame" src/game/` returns nothing
- [ ] The flash does not consume a turn or alter any game state
- [ ] With effects disabled (a config flag), the game is byte-identical to the T11 behaviour
- [ ] A seeded 200-turn sequence produces identical final state with effects on and off
- [ ] The level transition renders the new level exactly once, with no duplicate frame

That third check is the important one: the game logic must remain free of timers, or T20's
determinism claim acquires a wall-clock dependency it cannot defend.

## Done when

- [ ] `test/feel.test.ts` green
- [ ] `grep -rn "setTimeout\|setInterval\|requestAnimationFrame" src/game/` returns nothing
- [ ] T20's suite still passes unchanged
- [ ] `npm run verify` exits 0
