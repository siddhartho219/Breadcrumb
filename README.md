# Breadcrumb

See where you left off on every project — community, academic, and personal — in one glance.

## Status

**Phase 3 — Checkpoint engine.** Markdown content is turned into a checkpoint
automatically (Progress/Status line → checkbox → heading → paragraph
fallback) and shown in the list and detail view. No dashboard styling,
progress bar, or staleness indicators yet — see `phases.md` for what's next.

## Planning docs

Read in this order before touching code:

1. [`PRD.md`](./PRD.md) — what this is, who it's for, what v1 actually includes
2. [`architecture.md`](./architecture.md) — app flow, data model, folder structure, tech stack
3. [`rules.md`](./rules.md) — what to use, what to avoid, error handling standards, AI agent boundaries
4. [`phases.md`](./phases.md) — the build broken into phases with exit criteria
5. [`design.md`](./design.md) — color, type, and component conventions
6. `memory.md` — created at the start of Phase 1; updated every session with what's done and what's mid-change

## Getting started

```bash
npm install
npm run dev
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this repo's `dist/` folder (created by `npm run dev` or `npm run build`)
5. Click the Breadcrumb icon in the toolbar — it opens the side panel

For a production build: `npm run build`, then reload the unpacked extension
from `dist/` the same way.

## Tests

```bash
npm run test
```

Two suites exist:
- `src/lib/storage.test.ts` — CRUD, markdown add/re-sync semantics, checkpoint
  wiring, and the pub/sub, against a mocked `chrome.storage.local`.
- `src/lib/parser/parser.test.ts` — the checkpoint heuristics, per `rules.md`
  (the one place tests are non-negotiable).

## A note on versions

`package.json`'s dependency versions were written from general knowledge and
may not be the latest available when you actually run `npm install` — npm
will resolve to current compatible versions, which is expected. If a major
version bump causes an issue (particularly `@crxjs/vite-plugin`, which is
still in beta), check its changelog before assuming the scaffold code is wrong.
