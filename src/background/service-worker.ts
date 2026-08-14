// Background service worker (MV3). Owns: opening the side panel from the
// toolbar, the chrome.alarms-driven re-read of file-connected projects
// (Phase 5), and — since Phase 6 — the toolbar staleness badge, recalculated
// on the SAME alarm as phase 5's polling (phases.md: badge recalculation
// happens on phase 5's alarm, not a second one) and immediately on every
// storage write.
//
// No setInterval anywhere: this worker is ephemeral and cannot rely on
// timers surviving (rules.md §1). The badge path NEVER writes to
// chrome.storage — it only reads and calls chrome.action — so it can't race
// the panel's state the way the Phase 4 duplicate-row bug did (a second
// writer competing with the panel's refresh was the corruption vector there).

import { runFilePoll } from "../lib/file-poll";
import { badgeFor } from "../lib/staleness";
import { getProjects, getSettings, PROJECTS_KEY, SETTINGS_KEY } from "../lib/storage";

/** Name of the repeating alarm that drives connected-file polling (Phase 5)
    and staleness recalculation (Phase 6 — same alarm, per phases.md). */
const FILE_POLL_ALARM = "breadcrumb-file-poll";
/** Poll cadence, in minutes (Chrome floors alarms at 1 minute anyway). */
const FILE_POLL_PERIOD_MINUTES = 3;

function ensureFilePollAlarm(): void {
  // create() replaces an existing alarm with the same name, so repeated
  // worker startups are idempotent.
  chrome.alarms
    .create(FILE_POLL_ALARM, { periodInMinutes: FILE_POLL_PERIOD_MINUTES })
    .catch((err) => console.error("[Breadcrumb] Couldn't create the file-poll alarm:", err));
}

/**
 * Recompute the toolbar badge to reflect the most-stale project (Phase 6).
 * Read-only: never writes back to chrome.storage — the Phase 4 bug taught us
 * that a second storage writer racing the panel's state is how duplicate or
 * corrupt rows happen. This function only reads to compute, then calls
 * chrome.action. Never throws to its caller: a failed badge update is
 * retried on the next alarm or storage change, and the worker console is the
 * only surface for background errors (rules.md §2).
 */
async function updateBadge(): Promise<void> {
  try {
    const [projects, settings] = await Promise.all([getProjects(), getSettings()]);
    const badge = badgeFor(projects, settings.staleness);
    await chrome.action.setBadgeText({ text: badge.text });
    // The background color only matters while the badge is visible; when
    // badgeFor clears it (all fresh / no projects) the text is "", which
    // hides the badge regardless of color, so skip the extra call.
    if (badge.color) {
      await chrome.action.setBadgeBackgroundColor({ color: badge.color });
    }
  } catch (err) {
    console.error("[Breadcrumb] Couldn't update the badge:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  // Makes clicking the toolbar icon open the side panel directly,
  // instead of requiring an explicit action.onClicked handler.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[Breadcrumb] setPanelBehavior failed:", err));
  ensureFilePollAlarm();
  void updateBadge();
});

// The worker is woken by the alarm — that's the whole point of chrome.alarms
// here. Also re-create the alarm and run one immediate poll + badge update on
// every startup so a connected file syncs and the badge is correct right
// after install/reload instead of waiting for the first full period.
// runFilePoll/updateBadge never throw (they count/catch failures), but keep
// the outer catches as belt-and-suspenders so nothing can crash the worker.
ensureFilePollAlarm();
void runFilePoll().catch(() => {});
void updateBadge();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FILE_POLL_ALARM) return;
  void runFilePoll().catch(() => {});
  // Staleness recalculation rides the same alarm (phases.md). The poll's own
  // writes also trigger the onChanged listener below, but running it here too
  // covers the case where nothing changed on disk.
  void updateBadge();
});

// Immediate badge update on every storage write (phases.md Phase 6): the
// panel, options page, and the worker's own poll all land here and recalc the
// badge without waiting for the next alarm. Read-only — see updateBadge().
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!(PROJECTS_KEY in changes) && !(SETTINGS_KEY in changes)) return;
  void updateBadge();
});
