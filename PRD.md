# PRD — Netdev
### Seeded Procedural Roguelike (Browser, No Backend)

**Author:** Hihaw
**Status:** Spec settled — ready for AI agent implementation
**Last updated:** 2026-09-27

> Companion doc: `DESIGN.md` holds the full mechanical spec. Every number, key, formula, and
> behaviour lives there. This doc states *what* and *why*.

---

## 1. Overview

Turn-based ASCII/tile roguelike yang berjalan sepenuhnya di browser, tanpa server/database.
Seed generation jadi fitur utama: dua user dengan seed yang sama akan dapet dungeon yang identik —
bisa dipakai buat "daily challenge" (seed = tanggal UTC hari ini, jadi semua orang di satu hari
dapat dungeon yang sama) atau share seed antar teman.

**Kenapa proyek ini ada:** portfolio piece buat nunjukin kemampuan algoritma (procedural generation,
pathfinding, FOV) dan arsitektur client-only tanpa bergantung ke backend.

## 2. Goals

- Dungeon crawler turn-based, playable end-to-end (masuk dungeon → progress → mati/menang)
- Deterministic generation dari seed (string/angka) — replayable & shareable
- 100% client-side: no database, no backend, no auth
- Progress per-run disimpan di localStorage (bisa lanjut kalau reload, hilang kalau "restart run")
- Playable di desktop browser (keyboard-driven), mobile jadi stretch goal

## 3. Non-Goals (out of scope untuk v1)

- Multiplayer / leaderboard global (butuh backend — di luar scope proyek ini)
- Account system / cloud save
- Full 2D sprite art — v1 pakai ASCII murni (bisa upgrade visual di iterasi berikutnya)
- Sound design / music (nice-to-have, bukan prioritas)
- Mobile touch controls (masuk stretch goal, bukan MVP)
- Hand-authored level content — **every** level, including the boss arena, is seed-generated
  (§ DESIGN.md §11). No hand-built maps, or the "same seed, same dungeon" promise dies.
- Particles and post-processing. One optional hit flash is the entire feel budget (T23).

## 4. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Language | TypeScript (`strict`) | Type safety buat entity/state yang kompleks |
| Roguelike toolkit | **rot.js 2.2.1** (pinned exact) | Seeded RNG, dungeon generation, FOV (shadowcasting) — semua built-in, gak reinvent the wheel |
| Rendering | Canvas 2D (via rot.js `ROT.Display`) | Cukup buat grid-based ASCII, gak butuh WebGL |
| Bundler | Vite | Fast dev server, gampang setup TS |
| State persistence | `localStorage` | Save seed + run progress, no backend |
| Runtime | Node 22 LTS (`.nvmrc`), npm | Zero extra tooling for anyone cloning the repo |
| Tests | Vitest | The determinism claim needs a test suite to be worth anything |
| Lint / format | ESLint (flat config) + Prettier | — |
| Deployment | Vercel | Zero backend, deploy-nya tinggal build & push |

**Tidak pakai:** React/Vue — turn resolution is a synchronous state machine
(DESIGN.md §4.1), which is simpler and more testable than a component lifecycle. UI overlay
(menu, inventory, HUD) pakai vanilla DOM di atas canvas.

### 4.1 Library gotchas that must not be rediscovered the hard way

- **Do not install `@types/rot-js`.** It is a deprecated stub and conflicts with the
  declarations `rot-js` ships itself. Install `rot-js` and let its types apply.
- **`ROT.RNG.setSeed()` takes a number, not a string.** A string silently produces an
  identical zero state every call ([#184](https://github.com/ondras/rot.js/issues/184)).
  We hash seed strings ourselves — see DESIGN.md §1.
- **Map generators read the *global* `ROT.RNG` and accept no injected RNG**
  ([#201](https://github.com/ondras/rot.js/issues/201)). The global RNG is therefore
  dedicated to level construction and must never be used during gameplay.
- **`ROT.Path.Dijkstra` exposes no distance map** — `_computed` is private. We implement our
  own BFS (~30 lines) rather than reach into privates.
- **`ROT.Display` has no `setFontSize` or `setBackgroundColor`** — use `setOptions({...})`.
  It also creates its own canvas; append `getContainer()` to a host element.
- **`Digger`'s `timeLimit` is wall-clock**, so a slow machine can truncate generation and
  break determinism. Raised to 3000 ms, and the acceptance checks in DESIGN.md §2.3 make
  regeneration deterministic anyway.

## 5. Core Game Loop

1. Player input seed (atau random) di main menu, atau pilih Daily Challenge
2. Dungeon level ter-generate dari seed (`ROT.Map.Digger`, 60x25, dengan acceptance-check
   dan deterministic regeneration guard — DESIGN.md §2)
3. Turn-based loop: player bergerak/aksi → setiap enemy yang melihat atau ter-alert
   mengambil 1 aksi → FOV di-recompute → render ulang
4. Player explore, fight enemy, pickup item (auto saat melangkahi), cari tangga turun
5. Melangkahi tangga turun → generate level baru dari sub-seed `(seed, level+1)` — deterministik
6. Mati → game over screen, tampilkan seed + level tercapai + run stats, hapus save
7. Capai **level 10**: kalahkan Guardian, tangga terbuka, melangkahi tangga → victory screen

Turn resolve itu **instan dan sinkron** — satu keypress = satu turn penuh, satu render
(DESIGN.md §4.1). Tidak ada animasi di v1.

## 6. Core Systems (detail teknis di DESIGN.md)

- Seed & deterministic RNG — dua stream terpisah: global `ROT.RNG` untuk konstruksi level,
  instance privat untuk gameplay. Ini yang bikin save/resume dan "seed sama = dungeon sama"
  sama-sama bener (DESIGN.md §0)
- Dungeon generation per level, dengan acceptance checks + deterministic regeneration guard
- Field of View — shadowcasting radius 8, dua arah: FOV player menentukan apa yang player lihat,
  FOV per-enemy (radius `senses`) menentukan apa yang enemy lihat
- Turn scheduler — player action = 1 tick, lalu setiap enemy yang ter-alert ambil 1 aksi.
  Enemy yang belum pernah melihat player **diam** (frozen), dan enemy yang kehilangan
  jejak menyerah setelah 6 turn
- Pathfinding — BFS 8-directional sendiri, no corner cutting, di-memo per target per turn
- Combat (melee bump-to-attack, `max(1, atk - def + roll)`)
- Inventory & item system (potion, weapon tier 1-3, armour tier 1-2)
- Enemy AI (chase via BFS ke last-known position; Goblin kabur di <30% HP; Skeleton
  serang setiap turn gantian)
- Boss — Guardian di level 10 dengan telegraphed cleave
- Save/load progress (localStorage) — map di-regenerate saat load, bukan disimpan

## 7. Data Model (ringkas — detail di DESIGN.md)

Semua entitas — player, enemy, item, corpse — tinggal di **satu array** dengan diskriminan
`kind`. Item bukan koleksi terpisah; corpse bukan kasus khusus di renderer.

```ts
type Kind = "player" | "enemy" | "item" | "corpse";

interface Entity {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  glyph: string;

  // combat stats — present on player, enemy, and corpse (zeroed)
  hp: number; maxHp: number; atk: number; def: number;

  // enemy-only
  type?: EnemyId;            // "rat" | "skeleton" | "goblin" | "guardian"
  senses?: number;           // FOV radius untuk mendeteksi player
  isAlerted?: boolean;
  lastKnown?: { x: number; y: number } | null;
  giveUp?: number;           // turn tersisa sebelum menyerah
  attackCooldown?: number;   // Skeleton

  // item-only
  itemId?: ItemId;
  stack?: number;            // potion stack
}
```

Level shape (`LevelData`) didefinisikan lengkap di DESIGN.md §2.4 — termasuk tiles, rooms,
spawn, stairs, dan generator/attempt yang dipakai untuk save.

Player invariant: `kind === "player"` selalu tepat satu, tidak pernah masuk array `entities`.

## 8. Milestones

Urutan eksekusi dan dependency graph lengkap ada di `tickets/00-index.md`.

**Phase 1 — Core (MVP)**
- Dungeon generation dari seed deterministik, dengan acceptance checks
- Player movement 8-directional + FOV + fog of war
- 1 jenis enemy (Rat), combat dasar, stairs
- Player death tertangani: save slot dihapus

**Phase 2 — Content**
- 3 jenis enemy (Rat, Skeleton, Goblin) dengan behavior beda
- Item system (potion, weapon tier 1-3, armour tier 1-2)
- Difficulty curve per level

**Phase 3 — Loop closure**
- Save/resume run dari localStorage (regenerate map saat load) + run history
- Semua screen: main menu, pause, **inventory**, game over, victory
- Daily seed mode (seed = tanggal UTC hari ini)
- Boss Guardian di level 10 + victory screen

**Phase 4 — Proof & polish**
- Determinism test suite (1000 seed × 10 level, dua generation pass deep-equal)
- README, deploy Vercel
- Optional: hit flash, level transition

**Stretch (tidak ada prioritas)**
- Mobile touch controls
- Sound effects

## 9. Success Criteria (Definition of Done)

"Done" di proyek ini harus **machine-checkable**. Satu perintah:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Keempatnya harus exit 0. Secara spesifik:

- [ ] `npm run lint` — ESLint + Prettier bersih
- [ ] `npm run typecheck` — `tsc --noEmit` bersih dengan `strict: true`
- [ ] `npm test` — seluruh suite hijau
- [ ] `npm run build` — output `dist/` adalah HTML/JS/CSS statis murni
- [ ] Seed yang sama → layout dungeon identik, diuji di `test/determinism.test.ts`:
      1000 seed acak × 10 level, dua generation pass menghasilkan array tile yang deep-equal
- [ ] Dua generation pass menghasilkan `playRngState` yang identik
- [ ] Seed daily adalah fungsi murni dari tanggal UTC
- [ ] Save → load → save menghasilkan state yang deep-equal, termasuk `playRngState`
- [ ] Player bisa explore, fight, mati, dan restart tanpa reload halaman
- [ ] Save dihapus saat player mati
- [ ] Level 10 bisa ditumbangkan: Guardian dibunuh, tangga terbuka, victory screen
- [ ] **Zero network request setelah initial page load** — nol web font, nol CDN, nol
      telemetry. Ini bukti "no backend", dan hanya bisa diverifikasi manual di DevTools

## 10. Resolved Questions

Semua open question sudah ditutup. Jangan dibuka lagi tanpa alasan baru.

| Pertanyaan | Jawaban |
|---|---|
| Nama game | **Netdev** (folder project tetap `Gamez`) |
| Ukuran grid per level | **60 × 25** |
| Target jumlah level untuk menang | **10**, dengan Guardian di level 10 |
| Repo / deploy target | **Git repo sendiri** untuk `Gamez/`, deploy ke **Vercel** |
