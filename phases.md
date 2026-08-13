# Phases

Each phase has a single clear exit criterion — don't start the next phase until the current one's is met. Commit at the end of each phase (or each sub-step within a phase) so GitHub Desktop history maps cleanly to this plan.

---

### Phase 0 — Setup & scaffolding
**Goal:** a project that builds and loads as an unpacked extension, doing nothing yet.
- Initialize repo, `package.json`, TypeScript config, Vite + `@crxjs/vite-plugin` config
- Base `manifest.json` (MV3, name/version/icons placeholder, `storage` permission only, `sidePanel` permission, `action` pointing to side panel)
- Empty side panel that renders "Breadcrumb" and loads in Chrome via "Load unpacked"
- Empty options page that loads
- Folder structure from architecture.md created (even if most files are stubs)
- `rules.md`, `PRD.md`, `architecture.md`, `phases.md`, `design.md` committed to repo root

**Exit criteria:** `npm run build` succeeds, the unpacked extension loads in Chrome with no console errors, clicking the toolbar icon opens the (empty) side panel.

---

### Phase 1 — Data layer
**Goal:** projects can be created, stored, listed, and deleted — no markdown parsing yet.
- `lib/types.ts`: `Project`, `Category`, `Settings` interfaces
- `lib/storage.ts`: `getProjects()`, `addProject()`, `updateProject()`, `deleteProject()`, all wrapped per rules.md error handling
- Minimal side panel UI: a plain list of project names + category, an "add project" form with just name + category (no markdown field yet), delete button
- Data survives a browser restart (proves `chrome.storage.local` wiring is correct)

**Exit criteria:** can add, see, and delete a project with just name + category; data persists after closing and reopening Chrome.

---

### Phase 2 — Markdown input
**Goal:** each project can have markdown content attached via paste or file upload.
- Add-project form gains a markdown field: paste-into-textarea, and a file `<input type="file" accept=".md">` upload path
- `mdRawContent` and `mdSource: { type: "manual" }` stored per project
- Project detail view (click a project) shows the raw markdown content
- Manual "re-sync" action lets the user re-paste/re-upload to update `mdRawContent`, updating `lastContentChangeAt` only if content actually differs from what was stored

**Exit criteria:** a project's markdown content can be set, viewed, and manually refreshed; `lastContentChangeAt` updates correctly only on real changes.

---

### Phase 3 — Checkpoint engine
**Goal:** markdown content is turned into a checkpoint automatically.
- `lib/parser/heuristics.ts`: detection rules in priority order — explicit "Progress:"/"Status:" line → most recent unchecked/checked checkbox context → most recent `##`/`###` header → fallback to last non-empty paragraph
- `lib/parser/index.ts`: `parse(content: string): Checkpoint`, never throws (per rules.md), always returns a valid `Checkpoint`
- Vitest suite covering: well-structured markdown, checkbox-only markdown, header-only markdown, prose-only markdown, empty content, malformed/garbage content
- Wire parser into the add/re-sync flow so `checkpoint` is computed and stored whenever `mdRawContent` changes

**Exit criteria:** all parser test cases pass; a real `memory.md`-style file produces a sensible checkpoint string in the UI.

---

### Phase 4 — Dashboard UI
**Goal:** the side panel looks and functions like the actual product, not a debug list.
- `ProjectList`, `ProjectRow`, `ProgressBar`, `ProjectDetail`, `AddProjectForm` components built out per design.md
- Progress bar reflects checkpoint position (see design.md for exact visual logic — explicit % if present, otherwise a qualitative stage indicator)
- "Last worked" shown as relative time ("2 days ago")
- Category filter/grouping in the list
- Apply `tokens.css` styling throughout — this phase is where design.md gets implemented, not before

**Exit criteria:** the side panel is presentable enough to actually use daily; a project's checkpoint, progress, and last-worked time are all visible without opening the detail view.

---

### Phase 5 — File System Access integration
**Goal:** a connected local folder updates a project automatically, no manual re-paste.
- `lib/fsa.ts`: folder/file picker flow (triggered from side panel, per the focus-loss constraint in architecture.md), `FileSystemFileHandle` persisted to IndexedDB, `handleId` stored on the `Project`
- Permission re-request flow (`requestPermission`) on each read, with a clear UI state if permission has lapsed ("Reconnect folder")
- Background service worker: `chrome.alarms`-driven periodic check (e.g. every few minutes) that re-reads connected files, re-parses, and updates `lastContentChangeAt` if content changed
- `mdSource: { type: "fsa" }` path fully replaces the need for manual re-sync on that project (manual re-sync still works as an override)

**Exit criteria:** editing the actual `.md` file on disk is reflected in the extension within one polling interval, without the user touching the extension.

---

### Phase 6 — Staleness indicators
**Goal:** the badge and per-project indicators actually nudge the user back to neglected projects.
- `lib/staleness.ts`: maps days-since-`lastContentChangeAt` to fresh/aging/stale using `Settings.staleness` thresholds
- `StalenessDot` component per project row
- Toolbar badge (`chrome.action.setBadgeBackgroundColor` / `setBadgeText`) reflects the most-stale tracked project, recalculated on the same alarm as phase 5's polling (plus on every storage write)

**Exit criteria:** leaving a project's content unchanged past the configured threshold visibly changes both its row indicator and the toolbar badge.

---

### Phase 7 — Settings & polish
**Goal:** v1 is genuinely done, not just functional.
- Options page: staleness threshold inputs, default category, export all data (download JSON), import data, reset all data
- Empty states (no projects yet — clear call to action), first-run onboarding (one short explanation screen)
- Edge cases: very long checkpoint text truncation, many projects (scroll behavior), duplicate project names, category with no projects
- Manual pass through rules.md's error handling section to confirm every storage/FSA call path has a real UI failure state, not just a try/catch that swallows the error

**Exit criteria:** PRD.md's v1 feature list is fully implemented and the success criteria in PRD.md section 4 hold up under actual daily use for a few days.

---

### Phase 8 — Stretch (post-v1, not committed to yet)
Only start these once v1 has been used for real and actually proven useful — don't let stretch scope creep into v1's timeline.
- GitHub-sourced `memory.md` (poll via GitHub API)
- AI-assisted checkpoint summarization (opt-in, clearly disclosed)
- Cross-device sync via `chrome.storage.sync` (metadata only — see architecture.md's size-limit note)
- Light theme
- Notification-based reminders (currently deferred per PRD scope)
