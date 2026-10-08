# intervals-icu-coach

intervals-icu-coach coaches an athlete through Intervals.icu: the operations it exposes, the analysis it computes over the athlete's data, and the skills that coach with them. This is its glossary — one language, grouped by area.

## Athlete anchors

The athlete's power reference points, from which every zone and every percentage target is derived.

**Athlete anchors**:
The athlete's current FTP, MAP and weight.
_Avoid_: thresholds, settings

**MAP**:
Maximal aerobic power: the best 60 s power of the athlete's most recent MAP ramp test. The anchor the coaching reasons in.
_Avoid_: VO2max power, peak power

**FTP**:
Functional threshold power, as set on the athlete's Intervals.icu cycling settings. The anchor Intervals.icu reads workout text and its own zones against.
_Avoid_: threshold (alone), CP

**MAP zones**:
The coaching training zones (REC, L1–L7, NMP), anchored to MAP by the Ric Stern / cyclecoach model. Adjacent zones overlap.
_Avoid_: power zones, training zones (both ambiguous with the FTP set)

**FTP zones**:
Intervals.icu's Coggan zones (`Z1`–`Z7`), anchored to FTP.
_Avoid_: power zones, Coggan zones

**Plan FTP**:
The FTP a planned session's percentages are read at: the session's own, else the FTP its ride was recorded at, else the athlete's current FTP.
_Avoid_: current FTP (when judging a past session)

## Prescription

What a workout asks the athlete to do, read as steps with resolved targets — the contract every review judges against.

**Prescription**:
What a workout asks for, as its **Planned steps**, with every target resolved to watts at the athlete's anchors.
_Avoid_: plan (for one workout), structure

**Planned step**:
One prescribed step of a workout with repeats expanded, so a 3×(12min/4min) block is six Planned steps, each knowing its rep number.
_Avoid_: interval (that is the ridden side — see **Delivered interval**)

**Parse basis**:
Where a Prescription was read from: the platform's own reading of a written workout, or a local reading of text that may never have been written.

**Work step**:
A Planned step that carries the session's intent, declared by its author in the first word of its label.
_Avoid_: hard step, effort (as the category name)

**Unclassified step**:
A Planned step whose label declares no work. Nothing judges it, whether it is a warm-up or work its author labelled outside the vocabulary.
_Avoid_: support step, recovery step (it may be neither)

**Work-word vocabulary**:
The closed list of label first words that declare a Work step.
_Avoid_: keywords, tags

**Open-ended work step**:
A Work step whose target is a floor, not a band — a test, a maximal effort, a primer ridden hard on purpose — declared by its own work word. Riding over it is the step working.
_Avoid_: max effort (as the category name)

**Key session**:
A session with a Work step prescribed at or above the sweet-spot floor (88% of FTP).
_Avoid_: hard session, quality session

## Execution review

What the athlete actually rode, judged against what was prescribed — rep by rep, and as time at each intensity.

**Delivered interval**:
One segment of a ridden activity — its duration and average power, cadence and heart rate. The ridden counterpart of a **Planned step**.
_Avoid_: actual step (there are no steps on the ridden side)

**Execution record**:
The reading of a ride its Delivered intervals were cut from: the laps the athlete marked on the head unit, or Intervals.icu's own detected intervals when there are no usable laps.
_Avoid_: the recording (detected intervals are an interpretation of it)

**Unplanned work**:
A Delivered interval that no Planned step was paired to.

**Alignment basis**:
How Planned steps were paired to Delivered intervals: all in order, partly, or not at all.
_Avoid_: match quality, confidence

**Verdict**:
The judgement of one Planned step against the interval that delivered it: on target, over, under, not attempted, or unmatched.
_Avoid_: compliance (Intervals.icu's own single figure, a different thing)

**Verdict basis**:
Which power figure a Verdict was judged on: average power, or normalized power for a long band step.

**Cadence verdict**:
The judgement of a step's delivered cadence against its prescribed cadence, reported beside its Verdict and never folded into it.

**Intensity distribution**:
Time at each intensity over a session or window, planned and delivered, in the same frame.
_Avoid_: time in zone, zone times

**Partition band**:
One band of the frame an Intensity distribution counts into: a MAP zone narrowed so it no longer overlaps the next, so every second is counted once.
_Avoid_: the MAP zone of the same name (the partition's band is narrower)

**Execution digest**:
The mechanical half of reviewing a Review window: its key sessions, each read to a Session outcome, the work steps that missed or exceeded by more than noise, and its Middle-band dose — leaving the reporting to the coaching.
_Avoid_: review, findings

**Session outcome**:
One key session's work steps read to one word: landed, exceeded (nothing missed, a rep ridden over), partial (some missed), missed (every work step missed), or unverified (the step lens could not be trusted). Computed in the digest, so the coaching applies a reporting policy instead of re-reading steps.
_Avoid_: verdict (that is one step's), compliance

**Fade**:
A partial session whose misses are its last two or more reps and nothing before them: the work ran out, rather than missing at random.
_Avoid_: decay (as a field name)

## Training load

What training costs the athlete over time: what a week delivered, and what proposed sessions would do to fitness and fatigue.

**Training week**:
Monday to Sunday, the frame the coaching plans and reviews in.
_Avoid_: last 7 days, rolling week

**Fitness, fatigue, form**:
Intervals.icu's CTL, ATL and TSB: the long and short exponentially weighted averages of daily load, and the difference between them.
_Avoid_: freshness (for form)

**Session load**:
One session's training load under the platform's model: intensity factor squared, times hours, times 100.
_Avoid_: stress, strain

**Middle band**:
76–106% of FTP — tempo through threshold.
_Avoid_: sweet spot (a narrower band inside it), tempo zone

**Middle-band dose**:
Seconds spent in the Middle band over a session or week; the coaching philosophy's main measure of a build week.
_Avoid_: time in zone (it is not a zone — see **Intensity distribution**)

**Forecast**:
The fitness, fatigue and form a set of proposed sessions would produce, carried forward from what the athlete has delivered.
_Avoid_: **Projection** (a Tool as one Adapter offers it), prediction

**Seed**:
The fitness and fatigue a Forecast starts from, as delivered on the day before it.
_Avoid_: starting CTL, baseline

## Workout library

The athlete's curated workouts, kept as tracked templates and copied onto Intervals.icu, and how any workout reaches the calendar.

**Workout template**:
The tracked source of truth for one curated workout: its identity, purpose and Basis, and its steps.
_Avoid_: seed, canonical template

**Library workout**:
A Workout template's copy on Intervals.icu — a rendered view, never a source.
_Avoid_: the workout "in the library" (as though it were authoritative)

**Sync**:
Rendering every Workout template at the athlete's current anchors onto its Library workout, creating what is missing and updating what differs.
_Avoid_: seed, refresh, import

**Basis**:
The anchor, MAP or FTP, that a Workout template's percentages are read against. One per template.
_Avoid_: reference, anchor type

**Anchored target**:
A percentage in a Workout template, whose watts move when the Basis moves.
_Avoid_: relative target

**Literal target**:
Any other target in a Workout template — watts, zones, heart rate, pace, cadence — unaffected by the anchors.
_Avoid_: fixed target

**Template marker**:
The hidden identity a Library workout carries, naming the Workout template it was rendered from.
_Avoid_: tag, id

**Orphan**:
A Library workout whose Workout template no longer exists.
_Avoid_: stale workout

## Track

Track efforts timed lap by lap, placed against what the bike recorded, and what the placement lets us measure.

### Records

**Lap-split record**:
A timing app's export of a track session: one row per timed lap, with its run, distance and time. The measurement of what happened, as the ride's streams are the measurement of what it cost.
_Avoid_: lap times, splits file

**Track session record**:
The tracked, durable form of one Session: its measurement basis (gear, rollout, lap distance, start type) and its Lap-split record verbatim.
_Avoid_: track log, session notes

**Session**:
One visit to the track.
_Avoid_: workout, run (see below)

**Run**:
One timed effort within a Session. A race has one; a training session has several.
_Avoid_: rep, interval, effort

**Flying portion**:
The laps of a Run ridden from speed — every lap of a flying start, or all but the first after a standing or gate start.
_Avoid_: race pace laps

**Decline**:
How much the power a Run's pace needs fell from its opening laps to its closing laps: the ratio of their speeds, cubed, minus one.
_Avoid_: fade, drop-off, power loss (it is a ratio, not watts)

### Placing a run

**Alignment**:
Placing a Run's laps against the ride's recorded cadence, so each lap has a start and end in the recording.
_Avoid_: matching, sync

**Candidate window**:
A stretch of the ride where cadence stays near the session's peak for long enough to hold a Run; the Alignment searches only inside one.

**Offset interval**:
The span of start times that place a Run as well as the best one does.
_Avoid_: error bar, uncertainty

**Band**:
How far a reading moves across its Offset interval.
_Avoid_: margin of error

**Alignment verdict**:
How well a Run was placed: strong, marginal, weak, or ambiguous.
_Avoid_: **Verdict** (which judges an athlete's delivery, not a measurement), fit quality

**Fitted development**:
Metres per crank revolution as the Alignment recovers it from the assumed lap distance. Differs from the gear's true development when the line ridden differs from the lap.
_Avoid_: gear inches, gear

### Writing back

**Run label**:
The text a written Run carries on the activity: its name from the Lap-split record, plus its Alignment verdict when that is less than strong.

**Boundary snap**:
Rounding a placed Run's start and end onto whole recorded samples, so it can be written to the activity.

**Snap drift**:
How far a Boundary snap moved a boundary, in seconds.

**Drivetrain speed**:
Wheel speed recovered from recorded cadence through a fixed gear's true development — what a speed sensor would have measured.
_Avoid_: estimated speed, virtual speed (it is a measurement, not a model)

**Sensor speed**:
What a wheel speed sensor recorded. A cross-check, not the reference; the Lap-split record is the reference.

## Coaching

How the coaching skills know the athlete, decide what to train, and hand that decision to the skill that builds it.

**Coaching-context stack**:
The four layers a coaching session reads, most durable first — Coaching philosophy, Steering, Season, Coaching log — where a later layer wins on conflict and a fact moves up as it proves durable.
_Avoid_: athlete state (the live FTP, MAP, zones and load, which is not a layer)

**Coaching philosophy**:
The athlete's durable training principles: foundational pillars, intensity anchor, execution rules, biases, test cadence. Shared by every install.
_Avoid_: season plan, preferences

**Steering**:
One athlete's personal overrides on the Coaching philosophy.
_Avoid_: philosophy (for one athlete's deviations), preferences

**Season**:
The current block's context: race calendar, macro structure, block constraints.
_Avoid_: plan, periodisation (alone)

**Coaching log**:
The running record of coaching sessions: what was decided, open threads, and how far execution has been reviewed.
_Avoid_: journal, notes

**Review window**:
The span an execution review covers: from the date the Coaching log was last reviewed through, to today.
_Avoid_: since last time, recent sessions

**Workout brief**:
The decision a planning skill hands to its build skill: what to build, the context that shapes it, and when. A **strength brief** is the gym session's equivalent.
_Avoid_: prompt, spec

## Skill evals

Replaying real moments from the athlete's history through the coaching skills, and scoring what they did.

**Scenario**:
A real moment in the athlete's history, frozen: a prompt, the date that stands in for today, the athlete's files as they were then, a Cassette, and the graders a good run must pass. "Case" means the same thing.
_Avoid_: test, fixture (a Scenario is judged, not asserted)

**Seed case**:
One of the first Scenarios built for a skill.
_Avoid_: seed (alone — see **Seed** in Training load)

**Cassette**:
A Scenario's recorded Intervals.icu responses, replayed so a run never reaches the platform.
_Avoid_: snapshot, mock (the responses are real)

**Trial**:
One run of one Scenario at one model and effort.

**Cell**:
Every Trial of one Scenario at one model, effort and Arm — the unit results are compared in.

**Arm**:
Whether a Trial runs with the coaching skills or without them, as a baseline.

**pass^k**:
Whether every Trial in a Cell passed.

## Tool surface

How each operation is defined once and offered to callers through more than one surface.

**Tool**:
A named operation a caller can invoke — its input, what it returns, and what it does to Intervals.icu — defined once, whatever surface it is reached through.
_Avoid_: command, endpoint, function (for the defined unit)

**Tool registry**:
The list of every Tool; what exists is what it lists.
_Avoid_: tool list, catalogue

**Adapter**:
A surface that offers every Tool in the registry to one kind of caller: the MCP adapter to Model Context Protocol clients, the CLI adapter to a shell.
_Avoid_: transport, layer

**Projection**:
One Tool as one Adapter offers it. An MCP tool and a CLI command are two Projections of the same Tool.
_Avoid_: **Forecast** (a Projection has nothing to do with training load)

**Services**:
Everything a Tool computes with, built once — the logic over Intervals.icu data and the thin clients that reach it.
_Avoid_: client, `IntervalsClient` (the only clients are the HTTP client and the API wrappers)

## Relationships

- **Athlete anchors → everything that prescribes or judges**: every percentage target and every zone is read against the athlete's FTP or MAP
- **Coaching → Workout library**: a **Workout brief** carries a planning decision to the build that writes it
- **Prescription → Execution review, Training load**: **Planned steps** are what both review lenses judge against and what a **Forecast** costs
- **Skill evals → Coaching**: a **Scenario** replays the coaching skills against a **Cassette**
- **Track** stands apart: a placed **Run** is a measurement against the recording, never an **Execution record**
- Workouts are written in absolute watts, so a **Verdict** and an **Intensity distribution** do not move when FTP or MAP changes between prescribing and riding
- Workout text's zone targets are **FTP zones**, as on the platform; the coaching otherwise reasons in **MAP zones**
- A **Forecast** says what a week would cost if ridden as written; a **Verdict** and an **Intensity distribution** say what riding it delivered. Neither replaces the other

## Flagged ambiguities

- "verdict" — a **Verdict** judges an athlete's delivery against the prescription; an **Alignment verdict** judges how well a **Run** was placed. A run can be ridden exactly to prescription and still align weak.
- "seed" — a **Seed** is where a **Forecast** starts; a **Seed case** is one of a skill's first **Scenarios**.
- "projection" — a **Projection** is a Tool as one Adapter offers it; a training-load trajectory is a **Forecast**.
- "basis" — a **Parse basis** says where a prescription was read from, an **Alignment basis** how steps were paired, a **Verdict basis** which power figure judged a step, a template's **Basis** which anchor its percentages read against.
- "band" — a **Middle band** and a **Partition band** are ranges of watts; a track reading's **Band** is how far it moves across its **Offset interval**.
