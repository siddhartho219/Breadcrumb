import type { Settings } from "../../lib/types";
import { daysSince, stalenessLevel, type StalenessLevel } from "../../lib/staleness";
import { relativeTime } from "../../lib/time";

interface Props {
  /** Which timestamp drives staleness: always `lastContentChangeAt` ("last
      worked"), never `lastViewedAt` — they're deliberately separate
      (architecture.md §3). */
  lastContentChangeAt: string;
  /** Stored staleness thresholds from Settings — never hardcoded. */
  staleness: Settings["staleness"];
}

const LEVEL_LABEL: Record<StalenessLevel, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
};

// design.md §4: a 6px circle at the row's leading edge, colored by the
// staleness tokens (--stale-fresh/--stale-aging/--stale-stale — the ONE place
// those tokens may be used). Never color-only: the level name + relative age
// are exposed via title AND aria-label so color-blind users get the same
// signal, e.g. "Stale — last updated 9 days ago".
export function StalenessDot({ lastContentChangeAt, staleness }: Props) {
  const level = stalenessLevel(daysSince(lastContentChangeAt), staleness);
  const label = `${LEVEL_LABEL[level]} — last updated ${relativeTime(lastContentChangeAt)}`;

  return (
    <span
      class={`staleness-dot staleness-dot--${level}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
