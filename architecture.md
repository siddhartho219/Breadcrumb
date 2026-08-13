# Architecture

## 1. App flow

```
┌─────────────────────────────────────────────────────────┐
│  Chrome Toolbar Icon                                     │
│  - Badge: color-coded staleness dot (most-stale project) │
│  - Click → opens Side Panel                               │
└───────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  SIDE PANEL (primary UI — persistent, does not close      │
│  on blur, unlike a standard popup)                        │
│                                                             │
│  - Project list, grouped/filterable by category            │
│  - Each row: name, category tag, checkpoint text,          │
│    progress bar, "last worked" relative time, staleness    │
│    color dot                                                │
│  - "+ Add project" → inline form (name, category,          │
│    md source: paste / upload / connect folder)             │
│  - Click a project → detail view (full checkpoint text,    │
│    raw markdown preview, manual re-sync button, edit/      │
│    delete)                                                  │
└───────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  BACKGROUND SERVICE WORKER (Manifest V3)                  │
│  - Owns: badge updates, staleness recalculation on a       │
│    timer/alarm, storage change listeners                   │
│  - For connected folders (v1.5): re-reads file on a        │
│    polling interval via the retained FileSystemHandle      │
│    (background workers cannot show pickers themselves —    │
│    the picker only ever runs from the side panel/options   │
│    page in response to a user gesture; the worker just     │
│    re-reads a handle it was already granted)                │
└───────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  chrome.storage.local                                     │
│  - projects: Project[]                                    │
│  - settings: Settings                                     │
└─────────────────────────────────────────────────────────┘
```

**Options page** (separate, standard extension options UI) handles: staleness thresholds, default category, export/import JSON, reset all data. Kept out of the side panel to keep the daily-use surface uncluttered.

**No content scripts.** This extension never reads or modifies the pages the user browses — it only manages data the user explicitly provides. That's an intentional scope boundary (see rules.md) that keeps required permissions minimal.

---

## 2. Why the Side Panel instead of a standard popup

This is the single most important architectural decision, so it's worth stating explicitly:

- Standard `action` popups **close immediately when they lose window focus**.
- The File System Access API's `showDirectoryPicker()` opens a **native OS file dialog**, which takes OS-level focus away from the browser.
- Result: if the "connect a folder" flow were triggered from a standard popup, the popup closes the moment the picker opens, and the promise resolution has nowhere to update the UI.
- `chrome.sidePanel` (Chrome 114+) does not close on blur, so it survives the picker round-trip. It also better fits a "dashboard you glance at while working," since it can stay open alongside the page you're actually working in.

The toolbar icon still exists — it opens the side panel on click (`chrome.sidePanel.open()`) rather than a popup.

---

## 3. Data model

```ts
type Category = "community" | "academic" | "personal" | "custom";

type MdSource =
  | { type: "manual"; lastPastedAt: string /* ISO */ }
  | { type: "fsa"; handleId: string /* IndexedDB-stored FileSystemFileHandle key */ };

interface Checkpoint {
  text: string;          // human-readable current status
  detectedFrom: "explicit" | "inferred"; // explicit = found a marker; inferred = heuristic guess
  progressPercent?: number; // only set if source markdown explicitly states one
}

interface Project {
  id: string;             // uuid
  name: string;
  category: Category;
  customCategoryLabel?: string; // when category === "custom"
  mdRawContent: string;   // last known full content
  mdSource: MdSource;
  checkpoint: Checkpoint;
  createdAt: string;      // ISO — "first opened" in PRD terms
  lastContentChangeAt: string; // ISO — updates only when mdRawContent actually differs from previous
  lastViewedAt: string;   // ISO — updates when user opens this project's detail view
  order: number;          // manual sort position
}

interface Settings {
  staleness: {
    freshUnderDays: number;  // default 2
    agingUnderDays: number;  // default 7  (>= this is "stale")
  };
  defaultCategory: Category;
}
```

**"Last worked" (PRD term) = `lastContentChangeAt`.** This is deliberately tied to the markdown content actually changing, not merely to opening the extension — opening the side panel to *look* at a project isn't "working on it." `lastViewedAt` is tracked separately and is not what drives staleness.

**FileSystemFileHandle handling:** these handles are not JSON-serializable into `chrome.storage`. Store them in **IndexedDB** (via the `idb-keyval` pattern or raw IndexedDB) keyed by `handleId`, and store only the `handleId` string in the `Project` record in `chrome.storage.local`. On each use, call `handle.requestPermission()` before reading, since permission can lapse.

---

## 4. Storage strategy

- **v1: `chrome.storage.local` only.** No account, no backend, no network calls. This matches the "I live in Chrome, don't make me leave it" motivation directly — and it's the most private option, which matters since project notes can be sensitive (unpublished academic work, proprietary personal projects).
- **v2 stretch — `chrome.storage.sync`:** real constraint to note now so it isn't a surprise later — `sync` storage caps at ~100KB total and ~8KB per item. Full markdown content for several projects will likely blow past this. If sync is pursued, only lightweight metadata (checkpoint text, timestamps, category) would sync — full raw markdown would stay local-only per device. Flag this clearly to the user in-product if v2 is built, don't silently truncate.

---

## 5. Folder & file structure

```
breadcrumb/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
├── src/
│   ├── background/
│   │   └── service-worker.ts        # badge logic, alarms, storage listeners
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx                 # entry
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── ProjectList.tsx
│   │       ├── ProjectRow.tsx
│   │       ├── ProjectDetail.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── AddProjectForm.tsx
│   │       └── StalenessDot.tsx
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── lib/
│   │   ├── storage.ts                # chrome.storage.local CRUD wrapper
│   │   ├── fsa.ts                    # File System Access helpers + IndexedDB handle store
│   │   ├── parser/
│   │   │   ├── index.ts              # public parse(content) -> Checkpoint
│   │   │   ├── heuristics.ts         # header/checkbox/"Progress:" detection rules
│   │   │   └── parser.test.ts
│   │   ├── staleness.ts              # days-since → fresh/aging/stale mapping
│   │   └── types.ts                  # shared TS types (Project, Settings, etc.)
│   └── styles/
│       ├── tokens.css                # design.md variables as CSS custom properties
│       └── base.css
├── .github/
│   └── copilot-instructions.md       # optional, if the AI tool supports repo-level rule files
├── rules.md
├── PRD.md
├── architecture.md
├── phases.md
├── design.md
└── memory.md                          # added once development starts
```

---

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict mode) | Catches storage-schema drift and message-passing bugs early — cheap insurance for an AI-assisted build |
| Bundler | Vite + `@crxjs/vite-plugin` | Purpose-built for MV3 extension dev: handles manifest, HMR for popup/side panel/options during development |
| UI | Preact | React-like component model (agentic AI tools generally know it well) at a fraction of the bundle size — matters for an extension |
| Styling | Plain CSS with custom properties (see design.md) | No utility-framework dependency to keep bundle lean; design tokens as CSS variables are easy for an AI agent to apply consistently |
| Markdown parsing | Hand-rolled heuristics (regex/line-scanning), **not** a full markdown-to-HTML library | We only need to *detect* checkpoint markers, not render formatted markdown in v1 — a full parser is unneeded weight and surface area |
| Storage | `chrome.storage.local` + IndexedDB (for file handles only) | See section 4 |
| Testing | Vitest | Pairs naturally with Vite; used primarily for the parser heuristics, which are the highest-risk-of-silent-breakage logic in the app |

No frontend framework beyond Preact, no CSS framework, no state management library (component state + a small pub/sub in `lib/storage.ts` is sufficient at this scope) — deliberately minimal, expanded in rules.md.
