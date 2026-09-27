# intervals-icu-mcp

A server exposing Intervals.icu operations and agentic-coaching tools. The same operations are surfaced through more than one transport, so the vocabulary below separates an operation from the surfaces that project it.

## Language

**Tool**:
A named operation defined once as `{ name, description, input schema, handler, annotations, output schema? }`. Lives in `src/tools/`, registered in `src/registry.ts`.
_Avoid_: command, endpoint, function (for the registered unit)

**Tool registry**:
The single list (`src/registry.ts`) of all Tools, iterated by every Adapter. The source of truth for what operations exist.
_Avoid_: tool list, catalogue

**Adapter**:
A transport that projects the Tool registry onto a surface. Owns transport concerns (wire format, discovery, error rendering); never holds business logic.
_Avoid_: transport, layer (as synonyms for the module)

**MCP adapter**:
The Adapter at `src/mcp/` that projects Tools as Model Context Protocol tools. The production / distribution artifact (mcpb, manifest, desktop).

**CLI adapter**:
The Adapter at `src/cli/` that projects Tools as Bash subcommands. The agent's zero-reconnect dev surface, run via `tsx`.

**Projection**:
A single Tool as exposed by one Adapter. An **MCP tool** and a **CLI command** are two Projections of the same Tool.

**Services**:
The composition root (`src/index.ts`): `createServices(options)` builds every service once, over one `HttpClient`, and returns them as `IServices` — the one object every Tool handler receives, as `services`. It wires; it forwards nothing and holds no logic. Most of what hangs off it is domain logic computed here over Intervals.icu data (**Athlete anchors**, the **Prescription module**, the **Execution review module**, the **Forecast**), beside five thin API wrappers (events, activities, athlete, wellness, power curves).
_Avoid_: "client" or `IntervalsClient` — the only clients are `HttpClient` and the API wrappers over it; calling the whole set a client reads computed results as though Intervals.icu returned them.

**MAP zones**:
The canonical coaching training zones, anchored to MAP (Ric Stern / cyclecoach model). Derived live by the **Athlete anchors** module and surfaced by `get_coaching_context` as `mapZones`. The coaching skills reason in these.
_Avoid_: "power zones" (ambiguous with the FTP set)

**Athlete anchors**:
`src/services/athlete-anchors/` — the one place FTP, weight, the cycling power zones, MAP and the **MAP zones** are read, behind `IAthleteAnchors`. Every service that needs one takes the anchors, never the athlete, activities and power-curve APIs. Holds the single athlete-record reader (FTP from the cycling sport settings, then the record's own `icu_ftp`/`ftp`; a zero is unset), the MAP-zone computation, and `planFtp` — the single FTP fallback a planned event is read at: the event's own, then its paired ride's, then the athlete's. Each anchor is fetched only as far as it needs — FTP is one athlete request. A `snapshot()` reads each anchor at most once, and a caller takes one per call. The coaching context and the power profile are its callers, not the way to get FTP or MAP.
_Avoid_: building the coaching context to read FTP; reading the athlete record or deriving MAP outside this module; resolving a plan's FTP with any other fallback order, which lets the digest select a session at one target while the review judges it at another.

**FTP zones**:
Intervals.icu's native Coggan / %FTP power zones. Available on the raw `get_athlete` view; intentionally absent from the coaching context (see ADR 0003).

**Workout template**:
The tracked Markdown file in `templates/` that is the source of truth for one curated workout — frontmatter (identity, folder, purpose, basis) plus a body in Intervals.icu step syntax. Authored by hand; editing one is a commit.
_Avoid_: "seed" or "canonical template" (both imply a one-time initial write, which is exactly what this is not)

**Library workout**:
The materialised copy of a Workout template on Intervals.icu. A **rendered view**, never a source — hand edits to it are overwritten on the next Sync. Every Library workout has a Workout template behind it.
_Avoid_: calling it the workout "in the library" as though it were authoritative

**Sync**:
The single reconcile operation (`sync_workout_library`): render every Workout template at the current anchors and upsert it, matched by its Template marker. Creates what is missing, updates what differs, never deletes.
_Avoid_: "seed" / "refresh" — both named halves of this one operation and are retired

**Workout brief**:
The distilled decision a coaching skill hands to its forked build skill: what to build, the context that shapes it (block, constraints, recent load) and when. One per discipline, each with a single caller — `plan-workout` → `compose-workout` (adds the library item or compose fresh, and the anchors) and `plan-strength-training` → `compose-strength-session` (the **strength brief**; adds the template tier). Each is defined once, in its build skill's "Your input"; the caller points there rather than restating it. The decision is made on the coaching thread; the brief carries it to the build.
_Avoid_: "prompt" or "spec" — the brief is a fixed contract, not free-form instructions

**Workout scheduling module**:
`src/services/workout-scheduling/` — the one way a workout is written to the calendar, behind `IWorkoutScheduling`: a built plan (`create_workout`), a **Library workout** copied verbatim (`schedule_library_workout`) or a strength session (`create_strength_workout`), each returning the written events plus any `unreviewableSteps`; and `update_event`, with the guard that refuses a description change which would collapse a WORKOUT event's structure. Owns the workout-text builder, the single WORKOUT event shape (`mcp-<date>-<slug>` external id) and the unreviewable-step warning, judged at the key-session floor against the **Athlete anchors** — all internal. The warning is best-effort: no FTP, or a failed lookup, writes the workout without it.
_Avoid_: building workout-text or a WORKOUT event in a Tool; calling `createEvents` for a workout outside this module.

**Basis**:
The anchor a template's percentages are read against — MAP or FTP — declared once per template. One basis per template; mixing is a parse error.

**Anchored target**:
A bare percentage in a step line, resolved against the template's Basis at render time. Everything else — literal watts, zones, HR, pace, cadence — is a **literal target**, emitted verbatim and unaffected by anchor changes. A template with no Anchored target needs no Basis and always syncs.

**Template marker**:
The HTML comment carrying a Workout template's identity on its Library workout, so Sync can find the copy it owns. Invisible in the Intervals.icu UI.

**Orphan**:
A marker-bearing Library workout whose Workout template no longer exists. Reported by Sync as a warning; never deleted automatically.

**Planned step**:
One prescribed step of a workout after repeat blocks have been expanded — the unit of verification. A 3×(12min/4min) block is six Planned steps, each carrying its rep number, so decay across reps is visible. For a written event, read from its `workout_doc` (Intervals.icu's own parse), never re-parsed from the description text; only text that has not been written is parsed locally. Every Planned step comes out of the **Prescription module**.
_Avoid_: "interval" for the planned side — that is the recorded half (see **Delivered interval**)

**Prescription module**:
`src/services/prescription/` — the one pipeline from workout text or a `workout_doc`, plus anchors, to resolved **Planned steps**: parse, zone resolution, flattening, **Work step** role and the single midpoint a band is taken at, each carrying its **Parse basis**. Every planned-side lens, the `create_workout` warning, the library summary and the `update_event` guard read prescriptions through it.
_Avoid_: re-running any stage of that pipeline outside it, or writing another midpoint.

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

**Middle-band dose**:
Seconds in the 76–106% FTP window — tempo through threshold — the coaching philosophy's primary judge of a build week. Computed from its own bounds, never by summing whichever zones approximate it, and reported alongside the per-zone breakdown rather than derived from it. On the planned side a prescribed range contributes the share of its width that lies inside the window, not all-or-nothing by midpoint.
_Avoid_: treating it as a roll-up of the zone breakdown (the two are anchored on FTP and MAP respectively, and neither derives from the other); calling a session "delivered" on duration when its middle-band dose fell short.

**Review window / watermark**:
The span an execution review sweeps, running from the `reviewed-through` date in the coaching log's live-state header to today. Advanced to today only as part of a confirmed log write, so an unconfirmed session leaves the window intact. Capped at 28 days counting both ends (the block cadence), checked once by the **Paired session loader**; skipped when the window holds no key session.
_Avoid_: "since last time" or any window derived from conversation history rather than the watermark — the watermark is what makes the review neither re-review nor silently skip.

**Execution review module**:
`src/services/execution-review/` — the one service behind `compare_planned_vs_actual`, `compare_intensity_distribution` and `get_execution_digest`, exposed as `IExecutionReview`. Owns the **Paired session loader** (`paired/`), the step lens (`steps/`), the band lens (`bands/`) and the **Execution digest** (`digest/`); the lenses are internal and are reached only through it. Each call takes one `snapshot()` of the **Athlete anchors**, so every lens in the call reads a plan at the same FTP and buckets into the same MAP-zone frame — an invariant held here, not wired in the composition root.
_Avoid_: constructing a loader or a lens outside the module; importing a lens's functions from another service.

**Paired session loader**:
`src/services/execution-review/paired/` — the one place a planned event is paired to the ride that executed it, for one session or a whole **Review window**. Each paired session carries its event, its ride, and the ride's **Execution record** candidates and null-safe power stream, each fetched on first ask and never again, so the step lens, the band lens and the **Execution digest** share one set of fetches. The window's day count and cap are checked here and nowhere else. Internal to the **Execution review module**.
_Avoid_: pairing an event to its ride, or counting a window's days, inside a lens.

**Work step**:
A **Planned step** that carries the session's prescribed intent, as against one that serves it (warm-up, recovery, cool-down). **Declared by the step's author in the first word of its own label**, against the **Work-word vocabulary** — not inferred from intensity, and not read from the delivered `type` field, which is auto-detected and unreliable. Every other step is _unclassified_ and is judged by nothing: a support step and a label outside the vocabulary fall out the same way. See ADR 0010.
_Avoid_: re-deriving the role from prescribed intensity and structural position, which is what the vocabulary replaced; reading an unclassified step as a support step — it may be work whose label fell outside the vocabulary, which is what `unclassifiedSteps` exists to surface.

**Work-word vocabulary**:
The closed list of first words that declare a **Work step**, held in the **Prescription module** (`src/services/prescription/roles.ts`). Every entry earns its place from a label the athlete's templates or calendar already use, so a step stays human-readable on the head unit while being deterministic to classify. Adding a word is a deliberate edit; an unrecognised word costs a step's **Verdict** rather than inventing one. `endurance` and `steady` are deliberately absent — a volume block is read by the **Intensity distribution**, not rep by rep.
_Avoid_: matching anywhere but the label's first word; treating an unlisted word as a failure, rather than as a step nothing will judge.

**Execution digest**:
The deterministic half of an execution review over one **Review window**, computed by `get_execution_digest` in the **Execution review module** (`digest/`): the key sessions (selected on the planned side, a **Work step** prescribed at or above the sweet-spot floor), the window's **Middle-band dose**, and the work steps whose **Verdict** or cadence missed by more than noise. Both lenses read the one loaded window, so each event and ride is fetched at most once; the band lens runs only when a key session exists. Returns no step labels and no raw comparison. Interpretation — recurrence, whether a test's overshoot is the test working, what to change — stays with the coaching layer, which holds the athlete's context.
_Avoid_: reading its `flagged` list as findings; reading an empty one as a clean session without checking `workSteps` and `unclassifiedSteps`.

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
`(v_close / v_open)³ − 1` over a **Run**'s **Flying portion** — the proportional power change from its opening segment to its close. Speed cubed is a power ratio over a fixed distance, so it carries no aero constant, only the exponent, and is therefore model-free. Segments are the first and last `min(3, floor((flyingLaps − 1) / 2))` laps, which always leaves a lap between them.
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
Wheel speed recovered from the recorded cadence and the true development of a fixed gear (ratio × rollout) — what a speed sensor would have measured, without one. It uses the true development, never the **Fitted development**, so distance is what the wheel travelled rather than what the assumed line measures. It carries the recording's cadence resolution: whole-rpm cadence puts up to ~1% of noise on each sample and may bias the whole stream, which only a **Lap-split record** can measure. A stopped wheel is a stop; a pause in the recording adds no distance.
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

**Coaching philosophy**:
The athlete's durable, timeless training principles — foundational pillars, intensity anchor (MAP), execution rules, biases, test cadence. **Tracked in git** as the `coaching-philosophy` skill and shared by every install; the base layer of the Coaching-context stack. Editing it is a commit (see ADR 0004).
_Avoid_: putting season-scoped or current-state facts here (those are **Season** / athlete state); calling one athlete's deviations "philosophy" (that's **Steering**).

**Steering**:
A single athlete's thin, personal override layer (`docs/personal/steering.md`, gitignored) on top of the shared **Coaching philosophy**. **Wins on conflict.** Durable steering is promoted _up_ into the philosophy skill.
_Avoid_: durable training beliefs that would hold next season (promote them into philosophy); block-scoped plans (that's **Season**).

**Season**:
Personal, gitignored current-block context (`docs/personal/season.md`) — race calendar, macro structure, block constraints. Revised between blocks.
_Avoid_: momentary CTL/TSB and in-flight niggles (that's the coaching log); timeless principles (that's **Coaching philosophy**).

**Coaching-context stack**:
The four ordered tiers the coaching skills read at session-start, most-durable first: **Coaching philosophy** → **Steering** → **Season** → coaching log. Later tiers override earlier ones on conflict; facts promote _up_ the stack as they prove durable (log→season, steering→philosophy).
_Avoid_: confusing this with `get_coaching_context`'s output — that is live **athlete state** (FTP/MAP/zones/CTL), a separate input, not a tier in the stack.

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

**Scenario**:
A real moment in the athlete's history, frozen for a skill eval: a prompt, a scenario date that stands in for "today", the personal files as they stood then, a **Cassette**, and the graders a good run must pass. Stored privately as a case directory (`docs/personal/evals/scenarios/<skill>/<id>/case.yaml`); "case" is the same thing in flags and file names.
_Avoid_: "test" or "fixture" (a Scenario is judged, not asserted); inventing a Scenario that never happened.

**Cassette**:
A Scenario's recorded Intervals.icu GET responses, one file per request, replayed by `bin/icu` so a run never reaches the network. Writes are never recorded or sent — they are captured to the run's `writes.jsonl` and answered with a synthetic success.
_Avoid_: "snapshot" or "mock" — the cassette is real platform responses, not hand-made ones.

**Trial**:
One agent run of one Scenario at one model × effort. Trials repeat because the agent is not deterministic.

**Cell**:
Every **Trial** of one Scenario at one model × effort (and **Arm**). The unit results are reported and compared in: mean score, pass rate, and **pass^k** — whether every Trial passed.

**Arm**:
Whether a Trial runs with the skills (`skills`) or without them (`no-skills`, the baseline: `.claude/skills` and `.claude/agents` removed). A Scenario that scores as well without the skills points at a skill the model no longer needs.

## Relationships

- A **Tool** is registered once in the **Tool registry**
- Each **Adapter** iterates the **Tool registry** and produces one **Projection** per Tool
- An **MCP tool** and a **CLI command** are **Projections** of the same **Tool**
- An **Adapter** holds no business logic — that lives in the Tool's handler and the service modules it reaches through **Services**
- A new service is built once in `createServices` and reached by handlers only through **Services**; no handler or service constructs another service
- A **Workout template** is rendered by **Sync** into exactly one **Library workout**, found by its **Template marker**
- A **Library workout** with no **Workout template** is an **Orphan**; a **Workout template** with no **Library workout** is created on the next **Sync**
- An **Anchored target** moves when MAP/FTP moves; a **literal target** does not — that is the whole difference between them
- A **Planned step** is paired to at most one **Delivered interval**; the pairing's **Alignment basis** says how it was reached, and each pair yields one **Verdict**
- **Delivered intervals** come from exactly one **Execution record**, tried best-first and never mixed: the laps are preferred, and lose only when they align to nothing at all
- A **Planned step** with no pair, and a **Delivered interval** with no pair, are both reported rather than dropped — the latter as unplanned work
- **The prescription is the contract both lenses judge against.** Because workouts are authored in absolute watts, neither the **Verdict** nor the **Intensity distribution** moves when FTP or MAP moves between prescribing and riding
- The two lenses answer different questions and **neither subsumes the other**: **Verdicts** say what happened _within_ the reps and need an **Alignment basis** better than `none`; the **Intensity distribution** says how much of the prescribed dose landed and needs no pairing at all, so it still reports where the step lens refuses
- Per-zone seconds of an **Intensity distribution** sum to its total, because the frame is a partition; the **Middle-band dose** does not participate in that sum, being a separate window over the same seconds
- Delivered seconds sum to the activity's **recording** time, not its elapsed time — paused time belongs to no zone
- A **Lap-split record** is joined to an activity by fitting cadence inside a **Candidate window**; each run claims one window, one-to-one and in order, so two runs of the same distance can never resolve to the same stretch
- An **Alignment verdict** governs what is returned, not just what is labelled: `weak` and `ambiguous` withhold per-lap readings while keeping run-level ones
- Every aligned reading carries a band derived from the **Offset interval**, so alignment uncertainty is stated in the unit the reader reasons in rather than in rpm
- The scored run, not the lap, is what gets written back to the activity — and the property that makes it worth writing is the one the alignment fought for: it **excludes the rolling entry**, which Intervals.icu's own detection cannot see and so swallows into the effort
- A written run is never an **Execution record**: it is the **Lap-split record** placed against the stream by a fit, and its **Alignment verdict** travels with it in the **Run label** precisely so the placement is never read as fact
- Every placed run is written whatever its **Alignment verdict**, because run-level readings stay robust across the **Offset interval** even where per-lap ones are withheld — the verdict governs _disclosure_ here, not omission
- **Drivetrain speed** is judged against a **Lap-split record**, and **sensor speed** is only a cross-check; a rewritten recording changes only its speed and distance, and its summary totals are recomputed from the same stream so the file agrees with itself
- A **Work step** is declared by its author and read as data, never inferred by a Tool from intensity or structure — the step's own label carries the coaching intent, so nothing about intent is ever guessed downstream
- Every step a Tool does not find in the **Work-word vocabulary** is judged by nothing and counted, so a work step with an unrecognised label surfaces as missing coverage rather than as a session that went well
- A **Forecast** is seeded from delivered state and carried forward under the athlete's own time constants; proposed sessions overlay already-planned work by date, so a partly-fixed week needs only its unfixed part restated
- Where an already-written session carries a platform-computed load, the **Forecast** uses it rather than re-deriving it — the platform's own figure is better evidence than a reproduction of it
- One parse feeds three consumers, and they do not agree by accident: **Session load** and per-zone seconds take a prescribed range at its midpoint, while the **Middle-band dose** takes it by width-share. The midpoint-collapsed stream must never be used to read seconds in the middle band
- A `Z`-target in workout text resolves against the athlete's **FTP zones**, not the **MAP zones** the coaching layer otherwise reasons in — the **Forecast** mirrors the platform, and the platform anchors workout text on FTP
- Strength contributes zero to a **Forecast**, because it contributes zero to the platform's model; the **Forecast** states the exclusion rather than absorbing it silently, so it is never read as a complete account of fatigue
- A **Forecast** and the execution-review lenses answer opposite halves of the same question and **neither subsumes the other**: the Forecast says what a week would cost if ridden as written, the **Verdict** and **Intensity distribution** say what riding it actually delivered

## Example dialogue

> **Dev:** "If I add a `get_segments` operation, do I wire it into both the server and the CLI?"
> **Architect:** "No — you add one **Tool** to the **Tool registry**. Both **Adapters** pick it up, so you get an MCP tool and a CLI command for free. You only touch an **Adapter** if the _transport_ needs something special."

## Flagged ambiguities

- "verdict" was used for two unrelated judgements — resolved: a **Verdict** judges delivery against prescription, an **Alignment verdict** judges how well a measurement was placed. They travel in different results and neither implies the other; a run can be ridden exactly to prescription and still align `weak`.
- "seed" has two senses — a **Seed** is where a **Forecast** starts; a _seed case_ (tag `seed`) is one of the first **Scenarios** built for a skill. Unrelated; say "seed case" in full for the latter.
- "client" named both the HTTP layer and the composition root (`IntervalsClient`) — resolved: `HttpClient` and the API wrappers are the clients; the composition root is **Services**.
- "tool" was used for both the registered operation and its MCP form — resolved: the registered unit is a **Tool**; its MCP-surface form is an **MCP tool** (a **Projection**), and its CLI-surface form is a **CLI command**.
