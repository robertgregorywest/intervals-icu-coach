# Training load

What a week delivered, the middle-band trend, and what proposed sessions would cost under the platform's own load model. Covers this module and `src/shared/middle-band.ts`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Middle-band dose**:
Seconds in the 76–106% FTP window — tempo through threshold — the coaching philosophy's primary judge of a build week. Computed from its own bounds, never by summing whichever zones approximate it, and reported alongside the per-zone breakdown rather than derived from it. On the planned side a prescribed range contributes the share of its width that lies inside the window, not all-or-nothing by midpoint.
_Avoid_: treating it as a roll-up of the zone breakdown (the two are anchored on FTP and MAP respectively, and neither derives from the other); calling a session "delivered" on duration when its middle-band dose fell short.

**Training load module**:
`src/services/training-load/` — the one service behind `get_training_week_summary`, `get_middle_band_trend` and `forecast_training_load`, exposed as `ITrainingLoad`: `summarizeWeek` (what a Monday-to-Sunday week delivered, with its **Middle-band dose**), `getMiddleBandTrend` (that dose per week across a range) and `forecast` (the **Forecast** of proposed sessions over already-planned work). Both rest on the same knowledge — Monday-based weeks, CTL/ATL read from wellness, FTP from the **Athlete anchors** — so they live together; the week summary (`week/`), the trend (`trend/`) and the forecast model (`forecast/`) are internal. The week summary and the trend measure rides through one function (`middle-band.ts`), so a trend row always equals that week's summary. The trend's range cap (`MAX_TREND_WEEKS`, one stream fetch per ride) is enforced here too. The forecast window cap (`MAX_FORECAST_DAYS`) is enforced here and nowhere else: the model compounds, so a longer projection reflects the assumed sessions more than the athlete.
_Avoid_: checking the forecast window in a Tool; building a week summary or a trajectory outside the module.

**Forecast**:
The fitness/fatigue/form trajectory a set of _proposed_ sessions would produce, carried forward from the athlete's delivered state under the platform's own load model — computed without writing anything to the calendar. Previews the numbers Intervals.icu will show once the sessions are written; it is not a second opinion on them.
_Avoid_: **Projection**, which in this repo means a Tool as exposed by one Adapter and has nothing to do with training load; calling the platform's CTL trajectory over already-written events a Forecast (that is the platform's own projection, and where it exists it is preferred).

**Session load**:
One session's training load, derived from its own prescribed steps: a synthetic power stream (a prescribed range at its midpoint, a `ramp` step swept across its range), smoothed and reduced to normalised power, taken against threshold, as `intensity² × hours × 100`. Reproduces the platform's figure rather than approximating it.
_Avoid_: reading a range as a sweep (the platform takes it at its midpoint — a linear sweep was measured nearly ten times less accurate); estimating a load for a session whose targets will not resolve to watts (it is reported underivable instead).

**Parse basis**:
Where a parsed prescription came from — the platform's own parse of a written event, or a local parse of text that may never have been written. Carried on every **Forecast** figure derived from one, so a locally derived number is never mistaken for one the platform computed. The two are interchangeable to consumers by design; the basis exists so the interchange stays visible.
_Avoid_: treating a locally parsed document as authoritative over the platform's for the same event; confusing it with an **Alignment basis** or an **Execution record**, which describe a measurement's placement and provenance rather than a prescription's.

**Seed**:
The fitness and fatigue a **Forecast** starts from, together with the date it was read for. Taken from what the athlete _delivered_ as at that date, not from the platform's projection onto planned work — on a day carrying both, the two differ.
_Avoid_: seeding from a planned figure; reporting a ramp for the first forecast day without reaching seven days behind the Seed, where the delivered history that defines it lives.

## Relationships

- A **Forecast** is seeded from delivered state and carried forward under the athlete's own time constants; proposed sessions overlay already-planned work by date, so a partly-fixed week needs only its unfixed part restated
- Where an already-written session carries a platform-computed load, the **Forecast** uses it rather than re-deriving it — the platform's own figure is better evidence than a reproduction of it
- Strength contributes zero to a **Forecast**, because it contributes zero to the platform's model; the **Forecast** states the exclusion rather than absorbing it silently, so it is never read as a complete account of fatigue
