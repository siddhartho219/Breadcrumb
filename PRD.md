# Product Requirements Document

**Working title:** Breadcrumb *(placeholder — rename freely before build; used throughout these docs for consistency)*

---

## 1. What to build

A Chrome extension that acts as a **personal project state tracker** — not a time tracker, not an activity logger. It answers one question at a glance: *"Where did I leave off on each of my projects, and how long ago was that?"*

The user maintains a `memory.md` (or similarly named markdown file) per project — a habit many developers, students, and makers already have or are willing to adopt. Breadcrumb reads that file (via paste/upload or a connected local folder), extracts or infers a **checkpoint** (a human-readable "current status" for that project), and displays it as a progress indicator alongside "first opened" and "last worked on" timestamps — across *all* the user's projects in one place, so no single project silently falls off the radar because of pressure from the others.

### Problem this solves
People juggling multiple concurrent projects — community, academic, personal — lose track of quieter, lower-pressure projects (typically personal ones) when louder deadlines dominate attention. A day's skip becomes a week's skip becomes total loss of context ("what was I even doing here?"). Existing tools either track *time spent* (not helpful — the problem isn't measuring effort, it's remembering *state*) or require leaving the browser entirely (friction that defeats the purpose for a browser-centric worker).

### Why an extension, not a standalone app
The target user already lives in Chrome for the entire work session (research, docs, code hosting, communication). A separate app is one more thing to remember to open — which is the exact failure mode this tool exists to prevent.

---

## 2. Targeted users

| Persona | Situation | What they need from this tool |
|---|---|---|
| **Solo indie hacker / side-project developer** | Multiple personal projects competing with a day job | A reason to pick the neglected project back up — see it, don't forget it |
| **Student with academic + personal projects** | Coursework deadlines dominate attention | Academic and personal projects visible in the same view, not siloed |
| **Open-source contributor** | Several community repos, sporadic contribution windows | Quick "where was I" recall without re-reading old issues/PRs from scratch |
| **Anyone who already keeps a `memory.md`-style notes habit** | Wants that habit to *pay off* passively | Zero-effort visualization of notes they're already writing |

**Not the target user (explicitly out of scope for v1):** teams needing shared/collaborative tracking, anyone wanting time-tracking or productivity analytics, anyone without any existing notes file who wants the tool to generate structure *for* them from nothing.

---

## 3. Features

### MVP (v1) — must have
- Add a project (name, category tag: Community / Academic / Personal / Custom)
- Provide that project's markdown content via **manual paste or file upload**
- Automatic **checkpoint detection**: if the markdown has explicit progress markers (checkbox lists, a "Progress:" / "Status:" line, headers), extract the most recent one; otherwise infer a reasonable checkpoint from the last substantive content
- Visual **progress bar** per project (see design.md for exact semantics — this is a checkpoint-position indicator, not a numeric % unless the source markdown explicitly provides one)
- **Timestamps** per project: first added, last updated (see architecture.md for exact definition of "last worked")
- **Dashboard view** (side panel) listing all tracked projects, sorted/filterable by category and by staleness
- **Staleness indicator**: color-coded signal (fresh / aging / stale) per project based on days since last update, plus a toolbar badge reflecting the most-stale project
- Manual **re-sync** button (re-read the pasted/uploaded content) for when a file changes and auto-detection isn't connected

### v1.5 — should have (immediately after MVP proves out)
- **Connected local folder** via File System Access API — auto-detects when the `.md` file changes on disk, no manual re-paste needed
- Edit/delete/reorder projects
- Settings page: staleness thresholds (what counts as "aging" vs "stale"), default category, export/import all data (JSON), reset

### v2 — nice to have / explicitly deferred
- GitHub-sourced `memory.md` (poll a repo file via GitHub API)
- AI-assisted checkpoint summarization for messy/unstructured notes (opt-in, clearly disclosed that content leaves the device)
- Cross-device sync (`chrome.storage.sync`, subject to its size limits — see architecture.md)
- Light theme
- Notifications/reminders beyond the passive badge

### Explicitly out of scope (not planned)
- Team/multi-user features, accounts, or a backend server
- Actual activity/time tracking (keystrokes, tab time, etc.)
- Editing the markdown file's content from within the extension

---

## 4. Success criteria (how we'll know v1 is good)

- User can go from "install" to "first project showing a checkpoint" in under a minute
- Opening the side panel answers "where did I leave off" without needing to open the actual project
- The staleness badge is noticeable enough to prompt a return to a neglected project, without being naggy (no push notifications in v1 — see PRD scope above)
