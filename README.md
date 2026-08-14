# Breadcrumb

See where you left off on every project — community, academic, and personal — in one glance.

## Status

**v1 (Phases 0–7) is complete.** Breadcrumb covers PRD.md's full MVP list:
projects with category tags (community / academic / personal / custom),
markdown via paste/upload/connected local file, automatic checkpoint
heuristics (hand-rolled, per rules.md), explicit-or-inferred progress bars,
first-added / last-worked timestamps, category filtering, staleness dots +
most-stale toolbar badge (fresh/aging/stale, driven by real stored
thresholds), and the full options page — threshold editing, default category,
export/import (validated JSON), and the reset escape hatch. First-run
onboarding and proper empty states are in, and the rules.md §3 error-handling
standard holds across every storage and FSA path. Stretch items (GitHub
sync, AI summarization, cross-device sync, light theme, notifications) are
Phase 8 / explicitly deferred — see `phases.md`.

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

Five suites exist (107 tests total):
- `src/lib/storage.test.ts` — CRUD, markdown add/re-sync semantics, checkpoint
  wiring, the pub/sub, settings reads, and Phase 5 file-connection semantics,
  against a mocked `chrome.storage.local`.
- `src/lib/parser/parser.test.ts` — the checkpoint heuristics, per `rules.md`
  (the one place tests are non-negotiable).
- `src/lib/time.test.ts` — relative-time/date-format boundary bucketing.
- `src/lib/file-poll.test.ts` — the background worker's connected-file poll
  loop (changed/identical/lapsed-permission/missing-handle/throwing project),
  with a mocked chrome.storage and a mocked file-read layer.
- `src/lib/staleness.test.ts` — fresh/aging/stale boundary semantics, malformed
  timestamps, threshold collisions, and the most-stale badge state (incl. the
  rules.md §3 guarantee that one bad record can't blank the badge).
- `src/lib/storage.test.ts` also covers Phase 7: settings save validation,
  onboarding flag, export/import (round-trip + every rejection path),
  reset, and duplicate project names.

## A note on versions

`package.json`'s dependency versions were written from general knowledge and
may not be the latest available when you actually run `npm install` — npm
will resolve to current compatible versions, which is expected. If a major
version bump causes an issue (particularly `@crxjs/vite-plugin`, which is
still in beta), check its changelog before assuming the scaffold code is wrong.
