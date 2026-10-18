# Context files — what lives where

Read before any write to `docs/personal/season.md` or `docs/personal/steering.md`: an edit, a
block-boundary tidy, a new season. A coaching-log write reaches it when a fact is promoted out of
the log ([coaching-log-format.md](coaching-log-format.md), step 4).

## Every fact has one home

The home is decided by **how long the fact stays true**:

| Home                                   | Holds a fact that is…                                                                         | Typical contents                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `coaching-philosophy` skill (a commit) | a belief about training, true in any season, proven                                           | pillars, execution rules, biases, test cadence                                                                                               |
| `docs/personal/steering.md`            | true for this athlete beyond this season, and names the philosophy rule it changes or adds to | overrides, additional emphasis, experiments — each with hypothesis, dose, readouts and a judging date                                        |
| `docs/personal/season.md`              | dated, or true only this season                                                               | race calendar, macro blocks, targets, test dates, this season's additions to the rules, benchmarks on file, lessons carried from last season |
| `docs/personal/coaching-log.md`        | a decision or signal from a session                                                           | [coaching-log-format.md](coaching-log-format.md)                                                                                             |

Four homes sit outside the stack, and a fact of their kind goes there whatever its lifespan:

- **A measurement method** — how a number is computed or read → the `ride-analysis` skill (a commit).
- **Track measurement basis and derivations** → `docs/personal/track-context.md`; timed splits →
  records in `docs/personal/track/`.
- **A long analysis** → its own `docs/personal/analysis-*.md`, cited by file name.
- **A live number** — FTP, MAP, zones, CTL, any figure a tool returns → Intervals.icu, read through
  the tools.

A training belief starts in `steering.md` and graduates to the philosophy once proven; an experiment
leaves `steering.md` when it is judged, as a belief or as a closed log line.

## The four rules

1. **One fact, one home.** Other files point to it by file and section, in a few words. A number —
   a target, a date, a benchmark — is a fact: it is written once, so changing it is a one-file edit.
2. **Lower layers state only the difference.** All four stack files are loaded at session start, so
   a season constraint or a steering line exists only where it changes or adds to the layer above;
   a line that matches the philosophy is already in force.
3. **Evidence is a sentence and a pointer.** Why a rule exists earns one line — the measured fact
   with its activity ID or file — and the narrative stays in the log or an analysis file.
4. **Moving a fact moves it.** Promoting up (log → season → steering → philosophy) or out (to a home
   outside the stack) deletes it at the source and leaves a pointer where a reader would look.

**Size is the early signal.** `steering.md` past ~60 lines or `season.md` past ~250 almost always
holds facts with another home; run the tidy below before adding more.

## Block-boundary tidy

When the current block computed from the macro table has changed since the last write: read
`season.md` and `steering.md` against the homes table and the four rules; move or delete each line
that fails; close any experiment past its judging date. **Done when every line passes its home's
test and no fact has two homes.**

## New season

1. Move `season.md` to `docs/personal/archive/season-YYYY-YY.md` with `git mv`, and mark its header
   as a record that is not read at session start.
2. Write the new `season.md` from `templates/personal/season.md`. Carry forward only what passes the
   season test; a lesson from last season is one line with a pointer to the archive.
3. Review `steering.md`: judge or re-date each experiment, and keep each emphasis only if it still
   holds.
4. Done when the block-boundary tidy's criterion holds across both files, and the log carries one
   entry pointing at them.
