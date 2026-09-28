import type { WorkoutSummary } from "./types.js";
import { matchRepeatHeader } from "../workout-parser/index.js";
import type { IPrescription } from "../prescription/index.js";

/** Provenance marker written by sync. */
const TEMPLATE_MARKER_RE = /<!--\s*template:\s*[a-z0-9][a-z0-9-]*\s*-->/i;
/** Legacy marker from the retired seed/refresh path — stripped, never written. */
const LEGACY_RATIONALE_RE = /<!--\s*rationale\s*[\s\S]+?\s*-->/i;

/**
 * A step line. Intervals.icu accepts a dash with no following space
 * (`-Warm-up 5m 160w`), which workouts authored in its UI commonly use, so the
 * space is optional here. The negative class keeps a `---` rule from matching.
 */
const STEP_LINE_RE = /^\s*-\s*[^\s-]/;

export function stripMarkers(description: string): string {
  return description
    .replace(TEMPLATE_MARKER_RE, "")
    .replace(LEGACY_RATIONALE_RE, "")
    .trimEnd();
}

/** The step body of a line, or null when the line is not a step. */
function stepBody(line: string): string | null {
  if (!STEP_LINE_RE.test(line)) return null;
  return line.trim().replace(/^-\s*/, "");
}

/**
 * The human text preceding the first step or repeat header, markers removed.
 */
export function extractProse(description: string): string {
  const lines = stripMarkers(description).split(/\r?\n/);
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (
      stepBody(lines[i]) !== null ||
      matchRepeatHeader(lines[i]) !== undefined
    ) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).join("\n").trim();
}

/**
 * The template's `purpose`: sync renders it as the first paragraph of the
 * description, so it is the first blank-line-delimited block of the prose.
 */
export function extractPurpose(description: string): string | undefined {
  const prose = extractProse(description);
  if (!prose) return undefined;
  const first = prose.split(/\n\s*\n/)[0]?.trim();
  return first || undefined;
}

export function hasTemplateMarker(description: string): boolean {
  return TEMPLATE_MARKER_RE.test(description ?? "");
}

/**
 * The library's one-line summary of a workout. The counting is the
 * Prescription module's — the same parse every planned-side lens reads — so a
 * step the platform would drop is not listed here either.
 */
export function parseDescriptionSummary(
  description: string,
  prescription: IPrescription
): Omit<WorkoutSummary, "id" | "name" | "folder_id"> {
  const { stepCount, totalSeconds, hasDistance } = prescription.shape(
    stripMarkers(description)
  );

  return {
    totalSeconds,
    stepCount,
    hasTemplate: hasTemplateMarker(description),
    oneLine: formatOneLine(stepCount, totalSeconds, hasDistance),
  };
}

function formatOneLine(
  steps: number,
  seconds: number,
  hasDistance: boolean
): string {
  if (steps === 0) return "Empty workout";
  const parts: string[] = [`${steps} step${steps === 1 ? "" : "s"}`];
  if (seconds > 0) parts.push(formatDuration(seconds));
  if (hasDistance) parts.push("includes distance steps");
  return parts.join(", ");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m${s}s` : `${m}m`;
  return `${s}s`;
}
