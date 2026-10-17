# Session structure

Guidance for composing a session when no library workout fits the intent — check `list_workout_library` first (see [library-vs-compose.md](library-vs-compose.md)). Where a canonical shape already exists as a library workout, reuse it (`get_workout_library_item`) rather than recomposing it here.

All targets in `%MAP` or `%FTP` — convert to watts before emitting (see [power-conversion.md](../compose-workout/power-conversion.md)). Trim warm-up/cool-down for time-crunched sessions; never trim the main set. The `ramp` shorthand (`10m ramp 50–80% FTP`) is logical, not literal — apply **head-unit granularity** when you emit it (see [power-conversion.md](../compose-workout/power-conversion.md)).

## Z2 / endurance

Canonical shape: library workout `z2-endurance-2h` (2h), or `miet-60` (60min, higher intensity, for when Z2 volume is time-constrained). NP cap ≤ 68% MAP regardless of duration — sustained, no pulses.

## Sweet spot

Canonical shape: library workout `sweet-spot-3x12`. Progress across a block: 3×12 → 3×15 → 4×12.

## Threshold

Canonical shape: library workout `threshold-2x20` — the bread-and-butter dose. In specific prep, over-unders (2m @ 105% / 1m @ 95%) are the step up once 2×20 is solid; in build blocks sustained work stays under threshold.

## VO2 / MAP

Canonical shape: library workout `vo2-4x4` — the default, highest fraction of time at VO2max per minute of work. Alternates: `vo2-30-30` (lower peripheral cost per rep, use when 4×4 has been overdone), 5×3 / 6×3, or the denser [vo2-preloaded-shorts.md](vo2-preloaded-shorts.md) primer (seeded as `vo2-preloaded-shorts`). **VO2 should not stack with heavy strength the day before** (philosophy permitting).

## Race-prep / race-pace

Driven by event demands — not a fixed template, though the library's `Coach: Race` folder (`openers`, `20-min-warm-up`, `in-the-red-pursuit-intervals-2km`) covers the recurring cases. Common building blocks for something new:

- Pursuit / TT specific: 3×6m at race power (~MAP 95–98%) with full recovery.
- Crit / road race specific: race-pace tempo with hard efforts on top (5×30s @ 130% on a Z2 ride).

Pull race details from `docs/personal/season.md`; shape the session around demands.

## Recovery

Canonical shape: library workout `recovery-spin`. Discipline matters more than dose — NP cap strict.

## Strength (gym)

Use `create_strength_workout` — free-form description of exercises, sets, reps, load, RPE. Don't force into the watts-target format.

## Test sessions

- **MAP ramp**: library workout `map-ramp-test` — fixed protocol, ride to failure.
- **FTP**: library workout `ftp-20min-test` — prefer reusing over composing.
