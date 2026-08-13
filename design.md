# Design

## 1. Direction

Dark-mode-first, calm and low-noise. The target user opens this while deep in focused work — it should read instantly (checkpoint, progress, staleness) without demanding attention or feeling like another dashboard shouting for it. The one place allowed to be visually loud is the staleness signal itself, since that's the entire point of the badge.

Avoid: generic "SaaS dashboard blue," anything that looks like a to-do list app (this is explicitly not a task manager), heavy card shadows/gradients.

---

## 2. Color

### Base palette (dark, default and only theme for v1)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e1013` | Side panel / options page background |
| `--surface` | `#171a1f` | Project row / card background |
| `--surface-raised` | `#1e2229` | Detail view, modals, focused states |
| `--border` | `#2a2e36` | Row dividers, input borders |
| `--border-subtle` | `#20242b` | Faint separators |
| `--text-primary` | `#eef0f4` | Project names, checkpoint text |
| `--text-secondary` | `#9aa0ab` | Timestamps, category labels, helper text |
| `--text-tertiary` | `#5f6570` | Placeholder text, disabled states |

### Accent (brand / progress fill)

| Token | Value | Use |
|---|---|---|
| `--accent` | `#3fb8af` (teal) | Progress bar fill, primary buttons, active states, links |
| `--accent-soft` | `#3fb8af` at 14% opacity | Selected row background, subtle highlights |

Teal was picked deliberately over the more default "SaaS blue" — it reads as calm/steady rather than urgent or corporate, fitting a tool meant to reduce pressure rather than add to it.

### Staleness signal (the one place color carries real meaning — use nowhere else)

| Token | Value | Meaning |
|---|---|---|
| `--stale-fresh` | `#4ade80` (green) | Updated within `freshUnderDays` |
| `--stale-aging` | `#facc15` (amber) | Between fresh and stale thresholds |
| `--stale-stale` | `#f87171` (red) | Past `agingUnderDays` — the nudge-back signal |

Important constraint: **do not reuse red/amber/green anywhere else in the UI.** If those colors show up outside the staleness dot/badge, they stop meaning "staleness" and the signal gets diluted.

### Category tags (low-saturation, purely for scannability — not meant to compete with staleness color)

| Category | Value |
|---|---|
| Community | `#8b9dff` (soft indigo) |
| Academic | `#c9a0ff` (soft violet) |
| Personal | `#3fb8af` (same as accent — personal projects are the whole reason this tool exists, worth the visual tie-in) |
| Custom | `#9aa0ab` (neutral, same as text-secondary) |

---

## 3. Typography

### Font stack

No web font loading — extensions benefit from zero network dependency and instant render, and system fonts are more than good enough here.

```css
--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
```

- `--font-ui` for all interface text (names, checkpoints, buttons, labels)
- `--font-mono` for anything representing raw file content (the markdown preview in project detail view, file paths) — reinforces "this came from your actual file," which matters for trust in what's being auto-detected

### Type scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-title` | 15px | 600 | Project name in row |
| `--text-body` | 13px | 400 | Checkpoint text, form inputs |
| `--text-label` | 11px | 500, uppercase, 0.04em tracking | Category tags, section headers ("PROJECTS", "SETTINGS") |
| `--text-meta` | 11px | 400 | Timestamps ("2 days ago") |
| `--text-mono` | 12px | 400, `--font-mono` | Raw markdown preview |

Line height: 1.4 for body/checkpoint text (checkpoints can run a full sentence and need to stay readable, not cramped), 1.2 for titles/labels.

---

## 4. Component notes

**Progress bar:** thin (4px height), fully rounded ends, `--surface-raised` track with `--accent` fill. Two behaviors depending on source data:
- If the markdown gives an explicit numeric progress (`progressPercent` set) → fill matches that percentage exactly.
- If inferred only → fill shows a fixed low-medium value (e.g. ~35%) as a *qualitative* "in progress" indicator, never implying false precision. Consider a subtle diagonal-stripe texture on inferred bars to visually distinguish "we're guessing" from "the file told us."

**Project row:** no heavy card shadow — a 1px `--border-subtle` bottom divider between rows is enough, keeping the list feeling like one continuous surface rather than a stack of cards. Hover state: `--surface-raised` background, no scale/transform animation (keep it calm, not bouncy).

**Staleness dot:** 6px circle, positioned consistently (e.g. leading edge of the row), always paired with an accessible text alternative (e.g. `title="Last updated 9 days ago"`) — never color-only, since color-blind users need the same signal.

**Buttons:** flat fill for primary actions (`--accent` background, `--bg` text for contrast), ghost/outline style (`--border` outline, `--text-secondary` text) for secondary actions like "Cancel" or "Re-sync." No gradients.

**Empty states:** centered, `--text-secondary` copy, single clear call-to-action button in `--accent` — avoid illustration/mascot-style empty states, keep it minimal and text-forward to match the overall restrained tone.
