# Rules

These rules exist specifically because development will be AI-assisted (agentic tool + GitHub Desktop commits). They're written as constraints an AI agent should be held to, not just style preferences.

---

## 1. What to use

- **Manifest V3** only. Do not write any Manifest V2 patterns (no `background.page`, no `browser_action` — use `action`; no blocking `webRequest`).
- **TypeScript in strict mode** for all new files. No `any` without a comment explaining why it's unavoidable.
- **`chrome.storage.local`** as the single source of truth for project/settings data. Never use `localStorage`/`sessionStorage` inside extension pages — they behave inconsistently across extension contexts and don't persist the way `chrome.storage` does.
- **File System Access API** (`showDirectoryPicker`, `FileSystemFileHandle`) for the connected-folder feature, always triggered from a direct user gesture inside the side panel or options page — never from the background service worker.
- **`chrome.alarms`** for any periodic re-check (e.g. polling a connected file, recalculating staleness) — not `setInterval` in the service worker, which is unreliable since MV3 service workers are ephemeral and can be killed/restarted by Chrome at any time.
- **Vite + `@crxjs/vite-plugin`** as the only build pipeline.
- **Vitest** for the parser heuristics tests specifically — this logic is the most likely to silently regress, so it's the one place tests are non-negotiable for v1.

---

## 2. What to avoid

- **No remote code execution or dynamically fetched/`eval`'d code.** MV3 disallows this anyway (CSP forbids remote scripts and `eval`), but it's worth stating so no agent attempts a workaround.
- **No permissions beyond what a feature actively needs.** Do not add `tabs`, `<all_urls>`, `history`, `bookmarks`, or any broad host permission "in case it's useful later." Every permission in `manifest.json` should map to a specific feature in PRD.md. If a phase seems to need a new permission, flag it before adding it rather than adding it silently.
- **No heavy frameworks.** No full React, no Angular, no Vue, no jQuery. Preact only, per architecture.md.
- **No CSS frameworks** (Tailwind, Bootstrap, Material). Use the design tokens in `design.md` / `tokens.css` directly.
- **No full markdown rendering libraries** (`marked`, `markdown-it`, `remark`, etc.) for v1. The parser only needs to *detect* checkpoint markers via heuristics — pulling in a full markdown AST parser is unnecessary weight for that job. Revisit only if a later phase needs true rendering (e.g. a raw-preview view with formatting).
- **No hardcoded secrets or API keys** anywhere in the repo, including in comments or test fixtures. v1 has no external API calls at all, so this should never come up — if a change introduces one, that's a signal the change is out of v1 scope.
- **No synchronous/blocking APIs** in the service worker (this includes synchronous `XMLHttpRequest`, which is deprecated anyway).
- **No `console.log` left in committed code** for anything beyond genuine development-time debugging that gets stripped before commit — errors should surface in the UI (see error handling below), not just the console, since a user will never open devtools on an extension they're using to stay motivated.

---

## 3. Error handling standards

- Every `chrome.storage` read/write is wrapped in try/catch. On failure, the UI shows a small inline error state ("Couldn't save — try again"), never a silent no-op.
- File System Access calls (`requestPermission`, `getFile`, etc.) can throw or return `denied` — always handle both the thrown-error path and the denied-permission path explicitly, with a UI state that tells the user *what to do* (e.g. "Reconnect this project's folder") rather than just "error."
- Parser heuristics must **never throw** on malformed/unexpected markdown. If nothing recognizable is found, fall back to a defined default (`{ text: "No checkpoint detected yet", detectedFrom: "inferred" }`) rather than crashing the row render.
- The background service worker's badge-update logic must not crash the worker on a single project's bad data — wrap the per-project staleness calculation in its own try/catch inside the loop so one malformed record doesn't blank the badge for everything else.
- No feature should be able to put `chrome.storage` into a state that can't be recovered from the options page's "Reset all data" action — that's the escape hatch of last resort and it must always work.

---

## 4. Boundaries for the AI agent

- **Follow `phases.md` in order.** Don't implement phase 4 UI before phase 1–3 data/parsing logic exists to back it — a phase is done when its own exit criteria (defined per-phase) are met, not before.
- **Don't introduce a new dependency** (any new `package.json` entry) without calling it out explicitly in the commit message/PR description and stating which rule above it might brush up against. Default answer to "should I add a library for this" is no — solve it with the existing stack first.
- **Don't change the `Project` or `Settings` TypeScript interfaces** in `lib/types.ts` without also handling migration for existing `chrome.storage.local` data (a versioned migration function, even a simple one) — never assume the extension is always installed fresh.
- **Don't touch `manifest.json` permissions** without flagging it against the "what to avoid" list above first.
- **Update `memory.md`** (once it exists, from phase 1 onward) at the end of every work session: what was completed, what file is currently mid-change, and any known-broken state — this file is the recovery point if a session is interrupted.
- **Don't invent features not in `PRD.md`.** If something seems like it'd obviously be nice (e.g. "what if I add notifications while I'm in here"), note it as a suggestion rather than building it silently — v2/stretch items are listed for a reason, they're not implicitly approved.
- **Keep functions small and typed**; prefer several small, named functions in `lib/` over logic embedded directly in components, since that's what makes the parser and staleness logic independently testable.
- **Comment non-obvious logic**, especially in `parser/heuristics.ts` and `fsa.ts` — both involve genuinely fiddly platform behavior (regex heuristics, permission-lapsing file handles) that's easy to "fix" incorrectly without context.
