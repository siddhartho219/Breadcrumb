import type { Checkpoint } from "../../lib/types";

interface Props {
  /** Set only when the source markdown explicitly stated a percentage. */
  progressPercent?: number;
  detectedFrom: Checkpoint["detectedFrom"];
  /** Optional ARIA label (defaults to a descriptive one). */
  label?: string;
}

// design.md §4: thin (4px) bar, fully rounded ends, --surface-raised track,
// --accent fill. Two behaviors:
//   - explicit progressPercent set → fill matches it exactly
//   - inferred only → fixed ~35% as a *qualitative* "in progress" indicator,
//     with a subtle diagonal-stripe texture so a guessed fill never reads as
//     the false precision of a number the file didn't state.
export function ProgressBar({ progressPercent, detectedFrom, label }: Props) {
  const isExplicit = detectedFrom === "explicit" && progressPercent !== undefined;
  const width = isExplicit ? progressPercent! : 35;
  const ariaLabel = label ?? (isExplicit ? `Progress ${progressPercent}%` : "In progress");

  return (
    <div
      class="progress"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isExplicit ? progressPercent! : undefined}
    >
      <div
        class={`progress-fill${isExplicit ? "" : " progress-fill--inferred"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
