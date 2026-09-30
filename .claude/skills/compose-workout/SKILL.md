---
name: compose-workout
description: Builds and schedules a single bike/run workout on Intervals.icu from a workout brief (session intent, library decision, zone bands, constraints, date). Invoked by plan-workout once it has decided what to build.
context: fork
agent: workout-composer
---

# compose-workout

You build what the brief has already decided should be trained.

You are running standalone, forked out of `plan-workout`. You have no conversation history and none of the athlete's context stack (philosophy, `steering.md`,
`season.md`, current fitness) — everything you need is in `$ARGUMENTS`.

## Your input (`$ARGUMENTS`) — the workout brief

This section is the one definition of the **workout brief** `plan-workout` hands over. The
caller points here rather than restating it, so a field added or changed here is the change.

- **Sport** — ride or run.
- **Session type and intent** — e.g. "sweet spot 3×12, build week, standing-start pursuiter."
- **Block context** — current block and its intent, and anything from `steering.md` that overrides
  default philosophy for this session.
- **Constraints** — weekly caps, placement rules, an injury flag.
- **Anchors** — FTP/MAP and the relevant zone bands.
- **Recent load** — today's CTL/ATL/TSB and any readiness flag (fatigue, soreness, poor sleep). It
  sets how hard the dose can be; lighten within the intent when it's flagged.
- **Library decision** — either the library item to schedule (its id), or "compose fresh", and if
  composing, whether to save it to the library.
- **Date(s)** to schedule it on.
- **Event to replace** (optional) — the id of a planned event on the calendar that this build
  replaces, which the athlete has agreed to on the coaching thread. Absent, the build is a new event.

The caller has already made every decision above with the full context stack loaded. Work from the
brief and the how-to subfiles below; the personal files (`steering.md`, `season.md`) stay with the
caller. If something you need is missing (e.g. no FTP given for a %-anchored session), say so in
your report rather than guessing or re-deriving it.

## Building it

Read only the subfiles the session needs, from the project root:

- `power-conversion.md` (this skill's folder) — emit absolute watts at the API boundary;
  reason in %MAP/%FTP, convert before calling tools.
- `.claude/skills/plan-workout/session-patterns.md` — structure norms by session type (Z2,
  threshold, VO2, sweet spot, recovery, race-prep).
- `syntax-cheatsheet.md` (this skill's folder) — workout-text syntax Intervals.icu expects, what a
  step label's first word declares (work steps are the only ones the execution review judges), and
  when a step should carry a cadence (it becomes a judged condition of the rep).
- `.claude/skills/plan-workout/vo2-preloaded-shorts.md` as the session calls for.

**Label every work step from the vocabulary** in `syntax-cheatsheet.md` — its first word is what
declares the step as the session's intent, and a work step labelled outside the vocabulary is
invisible to the execution review. `create_workout` warns when a step prescribed at or above 88% FTP
carries no work word; if that warning comes back on a step that was meant to be judged, relabel and
write again rather than leaving it.

Where those files say to check `list_workout_library` first, the caller already has: the brief's
library decision is that check's answer.

When the brief names a library item, schedule it with `schedule_library_workout`, which copies its
description verbatim. When it says compose fresh, compose, and schedule with `create_workout`. When
the brief names an event to replace, write onto that id instead: a `steps`-bearing
`update_event --yes` for a composed session, or `update_event --yes` with the library item's
`description` from `get_workout_library_item` for a library one. If asked to save to the library,
write `templates/workouts/<seedId>.md` then run `sync_workout_library`.

## Tool access

Read `docs/agents/icu-cli.md` (from the project root) before your first CLI call — working
directory, piping, `describe`. You run at its **Build** tier: you were asked to build this, so build
it. The one `--yes` you run is `update_event` on the event id the brief names to replace; every
other change to an existing event goes back to the caller in your report.

## What to return

What you built (session type, date, whether scheduled or saved to library) and anything the caller
should relay to the athlete — a substitution you made, a constraint you couldn't satisfy from the
brief, a gap you had to ask about. Not a restatement of the whole workout text unless the caller
needs it to log the session.
