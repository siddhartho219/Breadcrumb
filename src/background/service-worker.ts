// Phase 0: wires the toolbar icon to open the side panel. Badge/staleness
// logic (Phase 6) and chrome.alarms-driven file polling (Phase 5) get added
// here later — see phases.md. Per rules.md, no setInterval in this file;
// anything periodic must use chrome.alarms since this worker is ephemeral.

chrome.runtime.onInstalled.addListener(() => {
  // Makes clicking the toolbar icon open the side panel directly,
  // instead of requiring an explicit action.onClicked handler.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[Breadcrumb] setPanelBehavior failed:", err));
});
