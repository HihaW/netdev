# T01 — Repo and toolchain scaffold

**Depends on:** —
**Spec:** PRD.md §4, §4.1 · DESIGN.md §10
**Phase:** 1

## Goal

An empty but fully-gated project: `npm run lint && npm run typecheck && npm test && npm run build`
exits 0 with no game code at all. Everything after this ticket is additive.

## What to build

### 1. Make this its own git repository

`Gamez/` is currently a subdirectory of the unrelated `hermes-agent-backup` repo. Initialise a
fresh git repo here so the project has its own history and a public URL.

```bash
git init -b main
```

Add a remote under the owner's GitHub account. Do not push until T21 — a repo of empty
scaffolding is not worth a link.

### 2. `package.json`

- `name: "netdev"`, `private: true`, `type: "module"`
- `engines: { "node": ">=22" }`
- Scripts, exactly:

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint . && prettier --check .` |
| `format` | `prettier --write .` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `verify` | `npm run lint && npm run typecheck && npm test && npm run build` |

`npm run verify` is the single gate. Add it; everything else refers to it.

### 3. Dependencies — exact versions

```
dependencies:    rot-js 2.2.1        (exact, no caret)
devDependencies: typescript, vite, vitest, eslint, @eslint/js, typescript-eslint,
                eslint-config-prettier, prettier, @types/node
```

Pin `rot-js` with **no** range operator. It is feature-complete and unmaintained; a floating
range cannot break it in a way anyone notices, and an exact pin documents the deliberate
choice. Do not add `@types/rot-js` — it is a deprecated stub that conflicts with rot-js's own
bundled declarations (PRD.md §4.1).

### 4. `tsconfig.json`

`strict: true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. Include `src/` and `test/`.

`noUncheckedIndexedAccess` is not optional here. The hot paths in this project are
`tiles[y * width + x]` and `field[y * width + x]`, and an off-by-one on a flat typed array
returns `undefined` at compile time instead of a neighbouring tile at runtime.

### 5. Lint and format

ESLint flat config (`eslint.config.js`) with `typescript-eslint` recommended-type-checked,
`eslint-config-prettier` applied last so formatting and linting never disagree. Prettier with
defaults plus `printWidth: 100`.

### 6. `vitest.config.ts`

`environment: "node"` for the game-logic tests. Do not use `jsdom` — the simulation layer
(§DESIGN.md §4.1) is deliberately DOM-free, and a test that needs a DOM is a test that found
a layering violation.

### 7. `.gitignore`

`node_modules/`, `dist/`, `coverage/`, `.DS_Store`, `*.local`, `.env*`, `.vercel/`.

### 8. `index.html` and `src/main.ts`

A host `<div id="game">` and a `main.ts` that does nothing yet. No web fonts, no CDN links,
no analytics — "zero network requests after initial page load" (PRD.md §9) is a hard
requirement and any external reference silently breaks it.

### 9. `.nvmrc`

```
22
```

## Done when

- [ ] `git log` shows an initial commit scoped to this directory only
- [ ] `npm run verify` exits 0 on a fresh clone
- [ ] `package.json` has no `^` before `rot-js`
- [ ] `node_modules/@types/rot-js` does not exist
- [ ] `npm run build` produces a `dist/` with exactly one HTML, one JS, one CSS — and
      `grep -ri "fonts.googleapis\|cdn\|analytics" src/ index.html` returns nothing
- [ ] A trivial `test/smoke.test.ts` asserting `1 + 1 === 2` passes (proves Vitest is wired)
- [ ] `tsc` rejects an out-of-bounds typed-array read (proves `noUncheckedIndexedAccess` is on)
