# T14 — Inventory screen

**Depends on:** T11, T12
**Spec:** DESIGN.md §5.3, §7.1, §7.2
**Phase:** 2

## Goal

`src/ui/menus.ts` (inventory view). Toggle with `i`. Consumables and equipment.

## What to build

### 1. Equipping is automatic — do not add an equip key

Walking over a weapon or armour **replaces** the equipped piece (DESIGN.md §5.3). The old one
is discarded, not dropped. There is no `g` key and no equip action.

This is why the inventory is read-mostly. Resist adding drag-and-drop, comparison tooltips, or
a swap dialog — none of it is in the spec, and the spec is closed (DESIGN.md §0 preamble).

### 2. What the screen shows

| Section | Contents |
|---|---|
| Weapons | Equipped weapon, or `bare hands` |
| Armour | Equipped armour, or `nothing` |
| Potions | Count, from the `potion` stack |
| Stats | Effective HP / ATK / DEF, and the delta each equipped item contributes |

Effective stats must match the HUD exactly (T11). Two sources of truth for "your ATK" is a
guaranteed bug report.

### 3. Consuming a potion

The one action in the screen. Keyboard: `1`, or Enter with a single-potion list.

- HP increases by 8, capped at `maxHp`
- **Drinking at full HP is refused** with a log line and consumes no turn (DESIGN.md §7.2)
- `stack` decrements; at 0 the potion leaves the inventory
- Potions are uncapped and stackable — there is no weight system, so hoarding has no cost

### 4. It is a turn-consuming action

Drinking a potion advances the turn: enemies act, FOV recomputes, `turnCount++`. This is the
one place outside the normal input path where a turn is consumed, so route it through
`resolvePlayerAction` rather than poking the state directly.

Pausing on the inventory must not let the player drink for free.

### 5. Death by potion is impossible

Potions only heal. There is no poison, no bad seed, no cursed item. If you find yourself
wanting to add one, that is new content — file it, do not build it.

## Tests — `test/inventory.test.ts`

- [ ] The inventory screen renders the equipped weapon, or `bare hands` when none
- [ ] The inventory screen renders effective ATK/DEF including equipment bonuses
- [ ] HUD stats and inventory stats are identical for the same game state (assert both from one
      function — if they disagree, one is not using the shared function)
- [ ] Drinking at less than full HP heals exactly 8
- [ ] Drinking at 4 HP below max heals exactly 4 and does not exceed `maxHp`
- [ ] Drinking at full HP is refused, logs a message, and consumes **no** turn
- [ ] Drinking decrements `stack`; the last potion removes the entry
- [ ] Drinking consumes a turn: `turnCount` increments and adjacent enemies act
- [ ] Opening and closing the inventory without drinking consumes no turn
- [ ] Picking up a better weapon replaces the worse one and updates effective ATK
- [ ] The replaced weapon is discarded, not dropped as a floor item
- [ ] Picking up armour when armour is already equipped replaces it
- [ ] Potions stack to any count without a cap error
- [ ] Every item in the roster (`data/items.ts`) appears in the screen's item-name map

## Done when

- [ ] `test/inventory.test.ts` green
- [ ] The inventory is fully keyboard-operable
- [ ] No key other than `i` is bound to an inventory action outside the screen
- [ ] `npm run verify` exits 0
