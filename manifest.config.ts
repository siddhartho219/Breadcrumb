import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Manifest V3. Every permission here should map to a specific feature in
// PRD.md — see rules.md ("what to avoid") before adding anything new.
export default defineManifest({
  manifest_version: 3,
  name: "Breadcrumb",
  version: pkg.version,
  description: pkg.description,
  icons: {
    16: "public/icons/icon-16.png",
    48: "public/icons/icon-48.png",
    128: "public/icons/icon-128.png",
  },
  action: {
    default_icon: {
      16: "public/icons/icon-16.png",
      48: "public/icons/icon-48.png",
      128: "public/icons/icon-128.png",
    },
  },
  // Side panel is the primary UI — see architecture.md section 2 for why
  // this replaces a standard popup (file picker + popup focus-loss issue).
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  // "alarms" was added in Phase 5: the background worker polls file-connected
  // projects on a repeating alarm (rules.md §1 — no setInterval in MV3). It
  // maps 1:1 to the connected-folder feature in PRD.md. showOpenFilePicker
  // itself needs NO manifest permission (Chrome 86+), so nothing else was
  // added for the File System Access flow.
  permissions: ["storage", "sidePanel", "alarms"],
});
