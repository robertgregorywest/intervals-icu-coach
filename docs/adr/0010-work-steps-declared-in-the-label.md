# Work steps are declared in the step label, and the execution review is a tool

A **Planned step** declares whether it carries the session's intent in the first word of its own
label, matched against a closed vocabulary in `src/services/step-roles/` (since moved to
`src/shared/work-words.ts`, shared by the `create_workout` schema and the Prescription module). `get_execution_digest`
reads that declaration as data, runs both execution-review lenses over a **Review window**, and
returns the work steps that missed their prescription. The forked `execution-review` skill is
retired; the coaching thread runs the review itself.

Two things change together here, and neither works without the other: the review can only be
mechanical because the roles stopped being inferred.

## Why the role had to stop being inferred

The lenses used to derive work-vs-support from prescribed intensity and structural position, both
signals having to agree, because nothing on the planned side said which was which. That derivation
was the reason the review needed a model at all — and it was the weakest part of it:

- It cost a whole reasoning pass per review, forked, with none of the athlete's context stack
  loaded, and the coaching thread then re-interpreted the result anyway.
- It got the ambiguous cases wrong in the direction that matters. A warm-up ramp topping out at
  threshold reads as work on intensity. A recovery step prescribed at 160 W delivered at 140 W
  reads as a shortfall on the verdict alone, when it is the session working.
- The signal that would have settled it was already in the payload and was explicitly downgraded:
  "step labels are a weak third signal: reliable across this athlete's own templates, not a rule."

The workouts are authored by a model that knows exactly which steps are the session. It had no way
to say so. Making the label a rule rather than a hint is the whole change.

## Why the first word of the label, and not a marker

The only channel to Intervals.icu is the workout description — the platform re-parses it into
`workout_doc`, and nothing else round-trips per step. Three ways to use it were considered:

- **An HTML comment carrying a role map** (`<!-- roles: work=3,5,7 -->`). Proven to round-trip —
  the template marker already does — and invisible to the athlete. Rejected for coupling roles to
  step indices: an edit in the Intervals.icu UI silently invalidates the map, and the tool cannot
  tell a stale map from a correct one.
- **The platform's native `Warmup` / `Cooldown` section headers**, which come back as `warmup: true`
  on the steps beneath them. Real, and reproduced by the local parser, but they only name the two
  ends of a session — not the recovery steps between reps, which is where the ambiguity lives.
- **The label's first word** — chosen. It travels with the step it describes rather than with an
  index, it survives an edit, and it is a word the athlete already reads on the head unit. `Sprint`,
  `Threshold`, `Recovery` and `Easy` are what these steps were called anyway.

## Why the vocabulary is closed, and only names work

A step whose first word is not in the vocabulary is **unclassified**, and unclassified steps are
judged by nothing. There is no support vocabulary: support steps and unrecognised labels fall out
the same way, because only work steps are ever judged.

That makes the failure mode a quiet one — a genuine work step with an unrecognised label vanishes
from the step lens — so it is surfaced twice rather than hidden: `unclassifiedSteps` travels on every
session in the digest, and `create_workout` warns at the write when a step prescribed at or above the
key-session floor carries no work word. Both are warnings. A ramp test's steps and a warm-up's build
are meant to go unjudged, and the author is the one who knows which.

`endurance` and `steady` are deliberately not work words. A Z2 or steady block is the session's
volume; judging it rep-style against its band would report a ride that sat mid-band as a miss, and
the **Intensity distribution** is what reads those.

## Why the digest is one synchronous tool

With roles as data, everything the fork did up to interpretation is mechanical: select the key
sessions from the planned side, run `compare_intensity_distribution` over the window and
`compare_planned_vs_actual` per session, drop the steps that met their prescription and the band
misses inside noise. On a stale 28-day window that took ~75 KB of raw comparison JSON down to ~12 KB
of digest, small enough to read on the coaching thread with the full context stack loaded.

So the split moved. The tool computes and filters; the coaching layer interprets, where the
philosophy, `steering.md`, `season.md` and the log are in context. What stays judgement is named in
`execution-review-lenses.md`: recurrence across sessions and against open threads, whether a test's
overshoot is the test working, whether a wide range ridden low matters, and what any of it changes.

With nothing running in the background there is no barrier at session start, and no fork report to
wait a turn for.

## Consequences

- `GLOSSARY.md`'s invariant inverted: a work-step classification used to be one no Tool could return,
  precisely so an inference never travelled as data. It is now data, because it is no longer an
  inference — it is a declaration the author made.
- The templates were audited against the vocabulary and relabelled where they fell outside it
  (`Active` → `Effort` / `Activation`, `20min effort` → `Threshold test`, unlabelled opener steps
  named). The ramp test's steps stay unlabelled on purpose.
- The `execution-review` skill and the `execution-analyst` agent are deleted;
  `execution-review-lenses.md` moves under `coaching-session`, which now reads the digest itself.
- The eval graders that checked the fork's report (`watermarkLine`, `noRawDump`) now read the
  coaching thread, and the recorded `execution-review` scenarios need re-pointing at
  `coaching-session`.
