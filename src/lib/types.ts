// Shared types — see architecture.md section 3 for the full data model
// rationale. Defined ahead of Phase 1 so later phases share one contract;
// not wired to storage yet (that's Phase 1's job, per phases.md).

export type Category = "community" | "academic" | "personal" | "custom";

export type MdSource =
  | { type: "manual"; lastPastedAt: string /* ISO */ }
  | { type: "fsa"; handleId: string /* IndexedDB-stored FileSystemFileHandle key */ };

export interface Checkpoint {
  text: string;
  detectedFrom: "explicit" | "inferred";
  progressPercent?: number;
}

export interface Project {
  id: string;
  name: string;
  category: Category;
  customCategoryLabel?: string;
  mdRawContent: string;
  mdSource: MdSource;
  checkpoint: Checkpoint;
  createdAt: string;
  lastContentChangeAt: string;
  lastViewedAt: string;
  order: number;
}

export interface Settings {
  staleness: {
    freshUnderDays: number;
    agingUnderDays: number;
  };
  defaultCategory: Category;
}
