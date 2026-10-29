# Session structure

Guidance for composing a session when no library workout fits the intent — check `list_workout_library` first (see [library-vs-compose.md](library-vs-compose.md)). Where a canonical shape already exists as a library workout, reuse it (`get_workout_library_item`) rather than recomposing it here.

All targets in `%MAP` or `%FTP` — convert to watts before emitting (see [power-conversion.md](../compose-workout/power-conversion.md)). Trim warm-up/cool-down for time-crunched sessions; never trim the main set. The `ramp` shorthand (`10m ramp 50–80% FTP`) is logical, not literal — apply **head-unit granularity** when you emit it (see [power-conversion.md](../compose-workout/power-conversion.md)).

## Z2 / endurance

Canonical shape: library workout `z2-endurance-2h` (2h), or `miet-60` (60min, higher intensity, for when Z2 volume is time-constrained). NP cap ≤ 65% MAP (top of CycleCoach L2) regardless of duration — sustained, no pulses.

## Sweet spot

Canonical shape: library workout `sweet-spot-3x12`. Progress across a block: 3×12 → 3×15 → 4×12.

## Threshold

Canonical shape: library workout `threshold-2x20` — the bread-and-butter dose. In specific prep, over-unders (2m @ 105% / 1m @ 95%) are the step up once 2×20 is solid; in build blocks sustained work stays under threshold.

## VO2 / MAP

**Format is chosen by phase, not by default.** One VO₂ session per load week, none in recovery weeks; two per week only as a declared block experiment (`steering.md`). The current block's row in `season.md` names the phase:

- **Ceiling touch** (general prep): 3–4 × 2–3 min hill efforts at 80–85% MAP inside the long ride, full recovery. Maintenance, not a build.
- **Primer** (late general prep): 6–8 × 1 min at 100–105% MAP, 2–3 min easy; one 2 × 8 × 30/15 at 100% MAP in the last load week as a first exposure to the format (composed, not a library item).
- **Long reps** (first half of the main VO₂ block): library `vo2-4x4`, then `vo2-4x4-surges` — the same session at the same mean power with three 30 s surges per rep. Progress by reps (4 → 5 → 6), not by rep length or intensity. Recovery stays 1:1. No separate fast-start step: the evidence for an opening fast start in cyclists is mixed (Miller et al., 2023, no effect).
- **Short intermittents** (second half): library `vo2-preloaded-shorts`; progress per its scheme ([vo2-preloaded-shorts.md](vo2-preloaded-shorts.md)).
- **Race-specific** (specific prep for the event onwards): race-pace reps carry the VO₂ load. Add a VO₂ session — alternating long reps and preloaded shorts — only when 10 days pass without race-pace reps of ≥2 min.
- **Re-build / maintenance**: one VO₂ session a week, alternating long reps and preloaded shorts.

**Anchor in %MAP, never %FTP.** Long reps 78–85% MAP, self-paced so the last rep ≥ the first; short reps 88–95% MAP with the band as the floor. Both bands assume a low FTP:MAP, where ramp MAP overstates sustainable aerobic power — recalibrate long reps to 90–95% of a 5-min test once one exists ([intensity-anchoring.md](../coaching-philosophy/intensity-anchoring.md)).

**Stepping a VO₂ progression.** Step only after a session whose digest outcome is `landed` or `exceeded` **and** whose final rep (long reps) or final series (short intermittents) peaked at ≥90% HRmax (`max_hr` in athlete settings; the lap's `maxHr` in `get_activity_laps`). Power landed but HR short: rule out cold (<10 °C), a strap fault or a stale `max_hr` first — if one applies, step on power alone; otherwise repeat the step, riding higher in the self-paced band. Power missed: repeat the step. HR is a check on the stimulus, never the outcome; a power fade is the in-session readiness signal.

**VO2 should not stack with heavy strength the day before** (philosophy permitting).

## Race-prep / race-pace

Driven by event demands — not a fixed template, though the library's `Coach: Race` folder (`openers`, `20-min-warm-up`, `in-the-red-pursuit-intervals-2km`) covers the recurring cases. Common building blocks for something new:

- Pursuit / TT specific: 3×6m at race power (~MAP 95–98%) with full recovery.
- Crit / road race specific: race-pace tempo with hard efforts on top (5×30s @ 130% on a Z2 ride).

Shape the session around the target event's demands, which the brief carries.

## Recovery

Canonical shape: library workout `recovery-spin`. Discipline matters more than dose — NP cap strict.

## Strength (gym)

Use `create_strength_workout` — free-form description of exercises, sets, reps, load, RPE. Don't force into the watts-target format.

## Test sessions

- **MAP ramp**: library workout `map-ramp-test` — fixed protocol, ride to failure.
- **FTP**: library workout `ftp-20min-test` — prefer reusing over composing.
