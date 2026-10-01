# T22 — Vercel deployment

**Depends on:** T01, T21
**Spec:** PRD.md §4, §9
**Phase:** 4

## Goal

The live URL that goes on the README and in the portfolio link. Zero backend means deployment
is a build and a push.

## What to build

### 1. Vercel configuration

Vercel detects Vite automatically. Add a minimal `vercel.json` only if the defaults misbehave:

```json
{ "buildCommand": "npm run verify && npm run build", "outputDirectory": "dist" }
```

Two things to get right:

- **`npm run verify` in the build command.** The PRD's definition of done is machine-checkable
  (PRD.md §9); running lint, typecheck, and tests on every deploy makes it true by
  construction rather than by discipline. A deploy that skips the tests is a deploy that can
  ship a broken determinism suite.
- **`base` in `vite.config.ts`** if the project is served from a sub-path. With a
  project-root deployment it is `/` and needs no change. Verify rather than assume — a wrong
  `base` produces a blank page and a confusing 404 on the JS bundle.

### 2. Node version

Vercel reads `.nvmrc` (T01). Confirm the deployed runtime is Node 22 and that
`engines.node` in `package.json` agrees. A mismatch here fails the build in a way that reads
like a code problem.

### 3. Verify the zero-network requirement on the deployed build

This is the project's one manually-verifiable claim (PRD.md §9):

- [ ] Load the deployed URL with the Network tab open
- [ ] After the initial page load, **zero** further requests — no fonts, no CDN, no analytics,
      no sourcemap fetches
- [ ] No external font is referenced. T11 pins v1 to ASCII, so the system monospace is enough
- [ ] Reload on a hard refresh and confirm again
- [ ] Confirm the deployed build behaves identically to local: same seed, same level 1

Check the *deployed* build, not the local one. A dev-only leak (HMR client, source maps, a
plugin-injected script) is invisible locally and is exactly the kind of thing that survives
into production.

### 4. The link

- [ ] Add the live URL to the README
- [ ] Create the public GitHub repository and push — the README's clone command must work for
      a stranger, so the repo must be public
- [ ] Add a social preview image if one exists (T21 screenshots can be reused)

## Failure modes worth pre-empting

| Symptom | Cause |
|---|---|
| Blank page in production | Wrong `base` in `vite.config.ts` |
| Build fails only on Vercel | Node version mismatch, or `verify` failing on a platform-dependent test |
| Works locally, 404s on assets | Absolute asset paths vs. relative |
| A request appears after load | A font or script reference that escaped the `grep` in T01 |

## Done when

- [ ] Deployed URL loads and is playable to level 10
- [ ] Zero network requests after initial page load, verified on the deployed build
- [ ] The deploy ran `npm run verify` and it passed
- [ ] README links the live URL and the public repo
- [ ] A stranger can clone, `npm install`, `npm run dev`, and play
