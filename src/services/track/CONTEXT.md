# Track

A timing app's lap splits from a track session, placed against the recorded stream by a fit and written back to the activity. Covers this module and the recording rewrite in `src/services/fit/`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Lap-split record**:
An external timing app's export of a track session: one row per timed lap, giving the run it belongs to, cumulative distance, cumulative time and lap time. Self-verifiable — lap times sum to the cumulative column and distance advances by the lap length — and so checked against itself before anything is fitted to it. It is the measurement of _what happened_; the activity's streams are the measurement of _what it cost_. Neither file references the other, which is the whole problem the alignment solves. Its durable form is a **Track session record**.
_Avoid_: trusting the export's own "Average Speed" and "Average Cadence" columns — they are unweighted means of the lap values, not distance ÷ time; letting the export exist only as pasted text in one tool call, which is what the record fixes.

**Track session record**:
A tracked file holding one **Session**: the measurement basis in frontmatter (date, gear, rollout, crank length, lap distance, start type, provenance) and the **Lap-split record** verbatim in a fenced `splits` block, with prose between them. Stores **nothing derived** — every speed, cadence, segment, **Decline** and comparison is recomputed on read, so nothing goes stale when MAP, air density or the aero model moves. Parsed by the same reconciliation the export gets, so a transcription slip surfaces on every read rather than once. See `docs/adr/0008-timed-splits-are-tracked-records.md`.
_Avoid_: storing a speed, a cadence or a decline in the file; writing a table of splits into a prose document instead of a record; putting modelled watts in one — the aero model over-reads (`track-context.md` §6) and stays in prose, labelled.

**Track module**:
`src/services/track/` — the one service behind the six track Tools, exposed as `ITrack`: the **Track session record** operations (`listSessions`, `getSession`, `compareSessions`; `records/`), the alignment of a **Lap-split record** to the ride's streams (`align`; `alignment/`), its write-back as intervals (`write`; `writeback/`), and the rewrite of a sensorless recording with **Drivetrain speed** (`drivetrainSpeed`; `drivetrain-speed/`), whose splits check reuses `align`. Both `align` and `write` take a **Track input** and resolve it inside the module, so an alignment previewed with `compute_track_lap_power` is the one `write_track_runs` puts on the activity. The fit, the window search and the snap are internal. The records read tracked files only; just `align`, `write` and `drivetrainSpeed` reach Intervals.icu, and `drivetrainSpeed` only reads.
_Avoid_: resolving a session id to splits in a Tool; calling the alignment's or the writeback's functions from outside the module.

**Track input**:
What an alignment is fitted from: `{ sessionId }` — a **Track session record**, whose splits come back re-serialised from the reconciled parse and whose `activityId` and lap length come from its basis — or `{ splits, activityId }`, the export pasted with the ride it was timed on. Exactly one of `sessionId` or `splits`; `activityId` and `lapDistanceMeters` override the record's, and `activityId` is required when there is no record to take it from, or the record has none.
_Avoid_: pasting an export that is already filed as a record — a second transcription is a second chance to mistype it.

**Session vs Run**:
A **Session** is one visit to the track, one record file, addressed by its `id`. A **Run** is one timed effort within it — a race has exactly one; a training session has several. A run is addressed as `<sessionId>#<run>`, and the run label is verbatim from the **Lap-split record**, so it is the same identity a **Run label** carries onto the activity.
_Avoid_: comparing sessions when you mean runs; a bare session id is refused for a multi-run session rather than resolved to its first run.

**Flying portion**:
The laps of a **Run** ridden from speed — every lap for a flying start, laps 2…n where the run began from a gate or standing. Every aggregate (mean, SD, segments, **Decline**, Σv²) is taken over it. The standing lap is reported in full and excluded from all of them, because it measures an acceleration rather than a held speed.
_Avoid_: averaging a standing lap into a run's mean, which makes two runs incomparable whenever their start types differ.

**Decline**:
`(v_close / v_open)³ − 1` over a **Run**'s **Flying portion** — the proportional power change from its opening segment to its close. Speed cubed is a power ratio over a fixed distance, so it carries no aero constant, only the exponent, and is therefore model-free. Segments are the first and last `min(3, floor((flyingLaps − 1) / 2))` laps, which always leaves a lap between them. The minimums: three flying laps give single-lap segments (lap 1 against lap 3) and a decline; two or fewer withhold the decline and segments, with the other aggregates still reported; an empty flying portion (a lone standing or gate lap) withholds every aggregate with a reason, and such a run is refused by comparison.
_Avoid_: writing it as `(v_open/v_close)³`, which inverts the sign; reading it as watts — it is a ratio, and the modelled-watt decline beside it in `track-context.md` §4 is a different, model-bearing quantity that happens to agree.

**Candidate window**:
A stretch of the activity where cadence stays near the session's own peak, long enough to hold a scored run. Every alignment search is confined to one, and each run claims exactly one, in order. Not an optimisation: an unconstrained search over the whole ride returns a low residual and an absurd development from easy riding, because near-constant cadence fits any near-constant speed profile once the scale is free.

**Offset interval**:
The span of start offsets whose cadence fit is as good as the best, reported for every run. The objective is flat near its minimum — ±1 s moves it by 1–3% — so a single offset would overstate how precisely the run is placed. Every reading is re-taken at the interval's edges, and the spread travels with it as the reading's **band**.
_Avoid_: reading a band as a statistical error bar — it says how much the number moves if the run sits where it plausibly could, nothing about instrument noise.

**Alignment verdict**:
How well a run's cadence fit placed it: `strong`, `marginal`, `weak`, or `ambiguous` (a distinct offset fits nearly as well). Judged against thresholds the result publishes alongside it. A `weak` or `ambiguous` run keeps its run-level readings — which the band shows to be robust — and has its per-lap readings **withheld**, because lap boundaries that are not placed are exactly the plausible fiction the tool exists to avoid.
_Avoid_: confusing it with a **Verdict**, which judges delivery against prescription; this one judges a measurement's own alignment and says nothing about the athlete.

**Fitted development**:
Metres of assumed lap distance per crank revolution, recovered by the alignment rather than supplied to it. Equals the drivetrain's true development only if the rider covered exactly the assumed lap distance, so a figure below the known gear is evidence about the line ridden. Agreement across a session's runs is independent evidence the alignment is right.
_Avoid_: expressing it in gear inches — that conversion assumes a 27" wheel and lands ~2.9% low (see `docs/personal/track-context.md` §1).

**Drivetrain speed**:
Wheel speed recovered from the recorded cadence and the true development of a fixed gear (ratio × rollout) — what a speed sensor would have measured, without one. It uses the true development, never the **Fitted development**, so distance is what the wheel travelled rather than what the assumed line measures. It carries the recording's cadence resolution: whole-rpm cadence puts up to ~1% of noise on each sample and may bias the whole stream, which only a **Lap-split record** can measure. Cadence 0 is no reading, not a stop: the power meter reports it whenever the rider is not driving the pedals, though a fixed gear is still rolling, so no speed is claimed there. A pause in the recording adds no distance.
_Avoid_: calling it "estimated" or "virtual" speed (it's a measurement through a known gear, not a model); treating **sensor speed** as the reference it is checked against — the sensor reads high (`track-context.md` §1), and the splits are the reference.

**Run label**:
The text a written run carries on the Intervals.icu activity — the run's identifier verbatim from the **Lap-split record**, plus its **Alignment verdict** whenever that verdict is not `strong` (`Run 3 (ambiguous fit)`). The label is the _only_ field the platform preserves on a write; every metric it recomputes from the boundaries, and `type` it overrides. So it is also the only place a shaky placement can be seen by someone looking at the activity rather than at a tool response. Overwritten by the next write, which is how an improved fit clears the qualifier.
_Avoid_: hand-editing it in the Intervals.icu UI (the next Sync-equivalent write discards it); reading a written run as a device lap — see the **Execution record**, which a written run never becomes.

**Boundary snap**:
Rounding a fitted run boundary from its fractional second onto a whole stream sample, because Intervals.icu anchors an interval to a sample index and the alignment does not. Applied to the run's start and end only; the run is the written unit, so no lap boundary is ever snapped.
_Avoid_: doing it silently — the whole point is that it is reported.

**Snap drift**:
How far a **Boundary snap** moved a boundary, in signed seconds, reported per run alongside both readings it separates: the fitted one (what `compute_track_lap_power` says) and the snapped one (what the activity will show). Bounded by half a sampling interval, so against a 100 s+ run the two readings usually agree to the digit.
_Avoid_: quoting a snapped figure as though it were the fitted one, or the reverse — they are two measurements over two windows and the drift is the account of why they differ; confusing it with a **band**, which is alignment uncertainty rather than the cost of rounding.

## Relationships

- A **Lap-split record** is joined to an activity by fitting cadence inside a **Candidate window**; each run claims one window, one-to-one and in order, so two runs of the same distance can never resolve to the same stretch
- An **Alignment verdict** governs what is returned, not just what is labelled: `weak` and `ambiguous` withhold per-lap readings while keeping run-level ones
- Every aligned reading carries a band derived from the **Offset interval**, so alignment uncertainty is stated in the unit the reader reasons in rather than in rpm
- The scored run, not the lap, is what gets written back to the activity — and the property that makes it worth writing is the one the alignment fought for: it **excludes the rolling entry**, which Intervals.icu's own detection cannot see and so swallows into the effort
- A written run is never an **Execution record**: it is the **Lap-split record** placed against the stream by a fit, and its **Alignment verdict** travels with it in the **Run label** precisely so the placement is never read as fact
- Every placed run is written whatever its **Alignment verdict**, because run-level readings stay robust across the **Offset interval** even where per-lap ones are withheld — the verdict governs _disclosure_ here, not omission
- **Drivetrain speed** is judged against a **Lap-split record**, and **sensor speed** is only a cross-check; a rewritten recording changes only its speed and distance, and its summary totals are recomputed from the same stream so the file agrees with itself
