# Execution review

What was actually ridden, judged against the prescription: the step lens (**Verdicts**), the band lens (**Intensity distribution**) and the **Execution digest**. Covers this module and the device-lap decoding in `src/services/fit/`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Delivered interval**:
One segment of a completed activity, reduced to duration and average power/cadence/HR. What was actually ridden, as against what a **Planned step** asked for. Where the segment boundaries come from is the **Execution record**.
_Avoid_: "actual step" (there are no steps on the recorded side)

**Execution record**:
Which reading of the ride a comparison drew its **Delivered intervals** from. `device-laps` is the laps the head unit wrote, decoded from the original upload — the faithful record of what the athlete marked. `detected-intervals` is Intervals.icu's `icu_intervals` analysis: derived, editable, and free to re-cut boundaries, used only when laps are unavailable (no FIT file, or a ride that was never lapped) or cannot explain the session. Always reported; a derived reading known to have drifted from the laps carries a note saying so (see ADR 0006).
_Avoid_: treating `icu_intervals` as the recording — it is an interpretation of one; preferring whichever record aligns _better_ (detection re-cuts boundaries to fit, so it scores best exactly where it has invented the structure)

**Alignment basis**:
How a comparison paired **Planned steps** to **Delivered intervals**, always reported so the caller can see how much to trust the pairing: `sequential` (all matched in order, no gaps), `duration` (partial — some steps or intervals unmatched), `none` (declined to pair). Pairing reads duration and position only, never power.
_Avoid_: treating `none` as an error — it is a deliberate refusal, and the roll-up is still returned

**Verdict**:
The per-step judgement of delivery against prescription: `on-target`, `over`, `under`, `not-attempted` (delivered far less time than prescribed), `unmatched` (no interval could be paired). A range target is judged on its own band; a ramp is judged against its midpoint; `tolerance` governs point targets only.
_Avoid_: "compliance" — that is Intervals.icu's own scalar figure, reported alongside but distinct from these Verdicts

**Cadence verdict**:
A step's delivered average cadence judged against its planned cadence — `on-target`, `over`, `under` — reported beside the power **Verdict** and never folded into it. A point target allows ±5 rpm; a cadence range is judged on its own band. Absent when the step prescribes no cadence, recorded none, or was not attempted.
_Avoid_: reading an `on-target` **Verdict** as "the rep met its prescription" when the step also carries a cadence — a rep ridden in band on watts but well under its cadence did not do what was asked

**Verdict basis**:
Which power figure a **Verdict** was judged against: `average-watts` for point targets, ramps, and any step of 300s or less; `normalized-power` for a range target prescribed longer than 300s, since average power over a long outdoor step is depressed by coasting in a way normalized power is not; `normalized-power-fallback` when a step qualified for `normalized-power` but the activity's raw power stream didn't resolve its window, so the verdict fell back to average power. Reported on every step, including `unmatched`/`not-attempted` ones, naming what the rule would have chosen even where no comparison was reached.
_Avoid_: quoting a step's average-watts delta as the finding when its **Verdict basis** is `normalized-power` — that figure is reported alongside but is deliberately not what the verdict used.

**Intensity distribution**:
Time spent at each intensity across a session or window, computed on both sides — the planned side from the prescription's own **Planned steps**, the delivered side from the recorded power stream — and bucketed against one shared frame. The frame is a partition _derived_ from the athlete's **MAP zones**, whose bands deliberately overlap and so cannot be bucketed into directly: each wattage is assigned to the highest zone whose floor it reaches. Every result reports the boundaries it used.
_Avoid_: reading either side off Intervals.icu's `workout_doc.zoneTimes` or `icu_zone_times` (authoring-time and upload-time snapshots, independently anchored, not the prescription); quoting a partition band as though it were the coaching band of the same name (the partition's L3 is narrower).

**Execution review module**:
`src/services/execution-review/` — the one service behind `compare_planned_vs_actual`, `compare_intensity_distribution` and `get_execution_digest`, exposed as `IExecutionReview`. Owns the **Paired session loader** (`paired/`), the step lens (`steps/`), the band lens (`bands/`) and the **Execution digest** (`digest/`); the lenses are internal and are reached only through it. Each call takes one `snapshot()` of the **Athlete anchors**, so every lens in the call reads a plan at the same FTP and buckets into the same MAP-zone frame — an invariant held here, not wired in the composition root.
_Avoid_: constructing a loader or a lens outside the module; importing a lens's functions from another service.

**Paired session loader**:
`src/services/execution-review/paired/` — the one place a planned event is paired to the ride that executed it, for one session or a whole **Review window**. Each paired session carries its event, its ride, and the ride's **Execution record** candidates and null-safe power stream, each fetched on first ask and never again, so the step lens, the band lens and the **Execution digest** share one set of fetches. The window's day count and cap are checked here and nowhere else. Internal to the **Execution review module**.
_Avoid_: pairing an event to its ride, or counting a window's days, inside a lens.

**Execution digest**:
The deterministic half of an execution review over one **Review window**, computed by `get_execution_digest` in the **Execution review module** (`digest/`): the key sessions (selected on the planned side, a **Work step** prescribed at or above the sweet-spot floor — read from the **Prescription module**, which holds that rule), the window's **Middle-band dose**, and the work steps whose **Verdict** or cadence missed by more than noise. Both lenses read the one loaded window, so each event and ride is fetched at most once; the band lens runs only when a key session exists. Returns no step labels and no raw comparison. Interpretation — recurrence, whether a test's overshoot is the test working, what to change — stays with the coaching layer, which holds the athlete's context.
_Avoid_: reading its `flagged` list as findings; reading an empty one as a clean session without checking `workSteps` and `unclassifiedSteps`.

## Relationships

- A **Planned step** is paired to at most one **Delivered interval**; the pairing's **Alignment basis** says how it was reached, and each pair yields one **Verdict**
- **Delivered intervals** come from exactly one **Execution record**, tried best-first and never mixed: the laps are preferred, and lose only when they align to nothing at all
- A **Planned step** with no pair, and a **Delivered interval** with no pair, are both reported rather than dropped — the latter as unplanned work
- The two lenses answer different questions and **neither subsumes the other**: **Verdicts** say what happened _within_ the reps and need an **Alignment basis** better than `none`; the **Intensity distribution** says how much of the prescribed dose landed and needs no pairing at all, so it still reports where the step lens refuses
- Per-zone seconds of an **Intensity distribution** sum to its total, because the frame is a partition; the **Middle-band dose** does not participate in that sum, being a separate window over the same seconds
- Delivered seconds sum to the activity's **recording** time, not its elapsed time — paused time belongs to no zone
