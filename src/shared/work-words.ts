/**
 * The **Work-word vocabulary**: the closed list of first words that declare a
 * step label as a **Work step**.
 *
 * Shared rather than held inside the Prescription module because it is a
 * contract between two sides: the `create_workout` schema tells the author
 * which words declare work (ADR 0013), and the Prescription module reads the
 * same words back out of every label. The schema is built when its module is
 * imported, before any service exists, so it cannot reach this through `deps`.
 * See `docs/adr/0010-work-steps-declared-in-the-label.md`.
 */

/**
 * The first word of a step label that declares the step as work.
 *
 * A closed list. Every entry earns its place from a label this athlete's
 * templates or calendar already uses — adding a word is a deliberate edit, and
 * an unrecognised word costs a step's verdict rather than inventing one.
 *
 * Deliberately absent: `endurance` and `steady`. A Z2 or steady block is the
 * session's volume, and judging it rep-style against its band would report a
 * ride that sat mid-band as a miss. The band lens is what reads those.
 */
export const WORK_WORDS: ReadonlySet<string> = new Set([
  // Generic
  "work",
  "effort",
  "interval",
  "rep",
  "set",
  "block",
  // Zone / physiology
  "tempo",
  "sweet",
  "sweetspot",
  "sst",
  "threshold",
  "miet",
  "map",
  "vo2",
  "anaerobic",
  "neuromuscular",
  // Race-specific
  "sprint",
  "start",
  "standing",
  "pursuit",
  "race",
  "kilo",
  "run",
  "lap",
  // Rep-internal shape — the under and the float of an over-under are the
  // prescription, not recovery between reps, and `on` is the on of an on/off.
  "on",
  "over",
  "under",
  "float",
  "settle",
  "hold",
  "surge",
  "preload",
  // Priming
  "opener",
  "openers",
  "activation",
  "primer",
  // Test
  "test",
  "max",
  "peak",
]);

/**
 * The work words whose target is a floor, not a band: a test, a maximal effort
 * and a primer ridden hard on purpose. Riding over one is the step working, so
 * the execution review never reports it as exceeded — only falling short of it
 * counts. A subset of `WORK_WORDS`.
 */
export const OPEN_ENDED_WORK_WORDS: ReadonlySet<string> = new Set([
  "opener",
  "openers",
  "activation",
  "primer",
  "test",
  "max",
  "peak",
]);
