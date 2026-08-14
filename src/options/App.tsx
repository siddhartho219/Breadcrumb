import { useEffect, useState } from "preact/hooks";
import type { Category, Settings } from "../lib/types";
import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  exportAllData,
  getSettings,
  importAllData,
  resetAllData,
  saveSettings,
} from "../lib/storage";
import { readFileAsText } from "../lib/file";

// Phase 7: the options page is the settings surface per PRD.md v1.5 — staleness
// thresholds, default category, export/import all data, and the reset escape
// hatch (rules.md §3). Every action has a real inline error state (rules.md §3
// — no silent failures). design.md constraint: red/amber/green are reserved
// for staleness, so even the destructive Reset button is a quiet ghost, with
// a confirm() and plain-language copy doing the warning instead of color.

const CATEGORY_LABELS: Record<Category, string> = {
  community: "Community",
  academic: "Academic",
  personal: "Personal",
  custom: "Custom",
};

export function App() {
  const [freshUnderDays, setFreshUnderDays] = useState("");
  const [agingUnderDays, setAgingUnderDays] = useState("");
  const [defaultCategory, setDefaultCategory] = useState<Category>(DEFAULT_SETTINGS.defaultCategory);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dataError, setDataError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);

  function applySettings(settings: Settings) {
    setFreshUnderDays(String(settings.staleness.freshUnderDays));
    setAgingUnderDays(String(settings.staleness.agingUnderDays));
    setDefaultCategory(settings.defaultCategory);
  }

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((settings) => {
        if (cancelled) return;
        applySettings(settings);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load settings — try again.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: Event) {
    e.preventDefault();
    setSaving(true);
    setSettingsError(null);
    setSettingsStatus(null);
    try {
      const settings: Settings = {
        staleness: {
          freshUnderDays: Number(freshUnderDays),
          agingUnderDays: Number(agingUnderDays),
        },
        defaultCategory,
      };
      await saveSettings(settings);
      applySettings(settings);
      setSettingsStatus("Saved — the side panel and badge now use these thresholds.");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Couldn't save settings — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setDataError(null);
    setDataStatus(null);
    try {
      const json = await exportAllData();
      // Blob + anchor download — no library (rules.md §4: solve with the
      // existing stack; a download helper would be needless weight).
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `breadcrumb-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataStatus("Exported — check your Downloads folder.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Couldn't export your data — try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    setDataError(null);
    setDataStatus(null);
    try {
      const json = await readFileAsText(file);
      const result = await importAllData(json);
      // Reload the form from what's now stored (an import may carry settings).
      applySettings(await getSettings());
      setDataStatus(
        `Imported ${result.projects} project${result.projects === 1 ? "" : "s"} — this replaced your previous data.`,
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Couldn't import that file — try again.");
    } finally {
      setImporting(false);
      // Allow re-selecting the same file: change won't re-fire otherwise.
      input.value = "";
    }
  }

  async function handleReset() {
    const ok = window.confirm(
      "Reset all data? This permanently deletes every project and all settings — it can't be undone. Your files on disk are untouched.",
    );
    if (!ok) return;
    setResetting(true);
    setDataError(null);
    setDataStatus(null);
    try {
      await resetAllData();
      applySettings(DEFAULT_SETTINGS);
      setDataStatus("All data reset — Breadcrumb is back to a fresh start.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Couldn't reset your data — try again.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div class="panel">
        <header class="panel-header">
          <span class="brand">Breadcrumb — Settings</span>
        </header>
        <main class="panel-body">
          <p class="empty-hint">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div class="panel">
      <header class="panel-header">
        <span class="brand">Breadcrumb — Settings</span>
      </header>
      <main class="panel-body settings">
        {loadError && (
          <p class="form-error" role="alert">
            {loadError}
          </p>
        )}

        <section aria-label="Staleness thresholds">
          <h2 class="section-title">Staleness thresholds</h2>
          <p class="empty-hint">
            A project's dot turns amber once it hasn't been worked on past the fresh window, and
            red once it passes the stale window. The toolbar badge follows the most-neglected
            project.
          </p>
          <form class="project-form" onSubmit={handleSave}>
            <div class="form-row">
              <label for="fresh-under-days">Fresh under (days)</label>
              <input
                id="fresh-under-days"
                type="number"
                min="0"
                step="1"
                value={freshUnderDays}
                onInput={(e) => {
                  setFreshUnderDays((e.target as HTMLInputElement).value);
                  setSettingsStatus(null);
                }}
              />
            </div>
            <div class="form-row">
              <label for="aging-under-days">Stale after (days)</label>
              <input
                id="aging-under-days"
                type="number"
                min="0"
                step="1"
                value={agingUnderDays}
                onInput={(e) => {
                  setAgingUnderDays((e.target as HTMLInputElement).value);
                  setSettingsStatus(null);
                }}
              />
            </div>
            <div class="form-row">
              <label for="default-category">Default category for new projects</label>
              <select
                id="default-category"
                value={defaultCategory}
                onChange={(e) => setDefaultCategory((e.target as HTMLSelectElement).value as Category)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            {settingsError && (
              <p class="form-error" role="alert">
                {settingsError}
              </p>
            )}
            {settingsStatus && (
              <p class="empty-hint" role="status">
                {settingsStatus}
              </p>
            )}
            <div class="form-actions">
              <button type="submit" class="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        </section>

        <section aria-label="Data">
          <h2 class="section-title">Data</h2>
          <p class="empty-hint">
            Export everything as a JSON file, or import a previous export (importing replaces your
            current projects). Connected-folder handles can't be exported — reconnect those
            projects after importing.
          </p>
          <div class="form-actions">
            <button type="button" class="btn-ghost" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export all data"}
            </button>
            <label class="btn-ghost file-btn">
              {importing ? "Importing…" : "Import data"}
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleImportFile}
                disabled={importing}
              />
            </label>
            <button
              type="button"
              class="btn-ghost"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? "Resetting…" : "Reset all data"}
            </button>
          </div>
          {dataError && (
            <p class="form-error" role="alert">
              {dataError}
            </p>
          )}
          {dataStatus && (
            <p class="empty-hint" role="status">
              {dataStatus}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
