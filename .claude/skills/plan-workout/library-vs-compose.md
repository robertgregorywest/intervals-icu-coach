# Library-first vs. compose-fresh

The athlete may have curated a library of saved workouts in Intervals.icu. **Always check `list_workout_library` before composing fresh.** A saved workout carries calibrated intent the athlete trusts; an ad-hoc workout may diverge silently.

## When to reuse

Reuse when **all** of these hold:

- A library workout matches the **intent** (session type, duration, intensity).
- The workout's calibration is current. `hasTemplate: true` means `sync_workout_library` maintains it, so its watts track the athlete's tests; treat those as calibrated. A workout without a template is unmanaged and may sit at a stale anchor.
- The athlete hasn't asked for explicit variation ("not 4×4 again, do something different").

To reuse: schedule it with `schedule_library_workout` (its id and the date). It copies the description verbatim — prose, steps and template marker — so don't re-express a library item as `create_workout` steps. `get_workout_library_item` is for reading the body first.

## When to compose

Compose when:

- No library workout fits the intent (rare for canonical sessions, more common for race-prep / specific intervals).
- The athlete asks for a one-off variation ("longer warm-up", "extra interval", "drop the 30/30s").
- You're building something genuinely new — block opener, taper session, race simulation.

After composing, ask: **should this be saved to the library?**

- Yes → **write a Workout template** at `templates/workouts/<seedId>.md` (percentages, not watts), then run `sync_workout_library`. There is no tool that adds a library item: anything without a template would silently go stale at an old anchor. Writing the file is the curation act.
- No → `create_workout` only. Calendar event, no library entry — which is the right home for most one-offs.

## Don't

- **Don't compose silently** when a library workout fits — surprises the athlete and creates calibration drift.
- **Don't reuse blindly** when `hasTemplate` is false and the watts look anchored to an old test. Flag it, and offer to bring the workout under a template.
- **Don't save every ad-hoc workout** to the library. Only save things the athlete will plausibly reuse.

## Edge cases

- **Library exists, but nothing matches**: tell the user what's in the relevant folder, ask if a near-match would do, then compose if not.
- **Library empty**: run `sync_workout_library` — it renders the tracked templates (FTP test, MAP ramp, VO2 4×4, threshold 2×20, and the athlete's own curated sessions) into Intervals.icu.
- **MAP/FTP just changed**: run `sync_workout_library` with the new anchors (dry-run first) before composing, so every reusable workout is re-rendered at the current values.
- **Athlete edited a workout in the Intervals.icu UI**: warn them it will be overwritten on the next sync, and offer to fold the change into the template file instead.
