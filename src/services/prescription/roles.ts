/**
 * Which prescribed steps carry the session's intent, read from the step's own
 * label rather than inferred from its intensity.
 *
 * The coaching layer used to derive this from prescribed intensity and
 * structural position together, because no marker existed on the planned side.
 * A marker exists now: the workouts are authored by a model that knows which
 * steps are the session, and it declares that in the first word of the step's
 * label — a word the athlete reads on the head unit anyway. See
 * `docs/adr/0010-work-steps-declared-in-the-label.md`.
 *
 * Only work steps matter. A label whose first word is not in the vocabulary is
 * **not classified** — the step is carried but never judged. That is the
 * deliberate failure mode: a warm-up, a recovery step and an unrecognised label
 * all fall out the same way, so nothing is ever guessed into a finding.
 */

import { OPEN_ENDED_WORK_WORDS, WORK_WORDS } from "../../shared/work-words.js";

export type StepRole = "work" | "unclassified";

/**
 * The label's first word, lowercased and stripped to letters and digits, so
 * `Warm-up`, `SST —`, `VO2` and `Pre-load` all normalise the way a reader would
 * expect. Returns undefined for a label that opens with no word at all.
 */
export function firstWord(label: string | undefined): string | undefined {
  const raw = label?.trim().split(/\s+/)[0];
  const word = raw?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return word ? word : undefined;
}

/** Whether a step label declares the step as work. */
export function isWorkLabel(label: string | undefined): boolean {
  const word = firstWord(label);
  return word !== undefined && WORK_WORDS.has(word);
}

/**
 * A step's role. `unclassified` is not a failure — it is every support step and
 * every label outside the vocabulary, and it is judged by nothing.
 */
export function stepRole(label: string | undefined): StepRole {
  return isWorkLabel(label) ? "work" : "unclassified";
}

/**
 * Whether a step label declares an **Open-ended work step** — a test or primer
 * whose target is a floor, so riding over it is the step working.
 */
export function isOpenEndedLabel(label: string | undefined): boolean {
  const word = firstWord(label);
  return word !== undefined && OPEN_ENDED_WORK_WORDS.has(word);
}
