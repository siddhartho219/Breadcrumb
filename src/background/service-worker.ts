// Background service worker (MV3). Owns: opening the side panel from the
// toolbar, and — since Phase 5 — the chrome.alarms-driven re-read of
// file-connected projects (no setInterval, per rules.md: this worker is
// ephemeral and cannot rely on timers surviving).
//
// Phase 6 will add a second alarm-driven concern (staleness recalculation)
// reusing this same alarm infrastructure.

import { runFilePoll } from "../lib/file-poll";

/** Name of the repeating alarm that drives connected-file polling. */
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

chrome.runtime.onInstalled.addListener(() => {
  // Makes clicking the toolbar icon open the side panel directly,
  // instead of requiring an explicit action.onClicked handler.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[Breadcrumb] setPanelBehavior failed:", err));
  ensureFilePollAlarm();
});

// The worker is woken by the alarm — that's the whole point of chrome.alarms
// here. Also re-create the alarm and run one immediate poll on every startup
// so a connected file syncs right after install/reload instead of waiting for
// the first full period. runFilePoll never throws (it counts failures), but
// keep the outer catch as belt-and-suspenders so a poll can never crash the
// worker.
ensureFilePollAlarm();
void runFilePoll().catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FILE_POLL_ALARM) return;
  void runFilePoll().catch(() => {});
});
