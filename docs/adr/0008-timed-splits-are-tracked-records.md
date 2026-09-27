# Timed splits are tracked records; everything derived is recomputed

A timed track session is stored as one Markdown file per session — the measurement basis in
frontmatter, the lap-timer export verbatim in a fenced `splits` block, prose between them. The file
holds **only the measurement**. Every speed, cadence, segment sum, decline, Σv² figure and
head-to-head table is computed on read by `list_track_sessions`, `get_track_session` and
`compare_track_sessions`.

This follows ADR 0005: files are the source of truth, and anything a tool can compute is a
projection, not a stored artefact.

## Why the splits and not something richer

A lap time is the most durable measurement in this project. It does not move when MAP moves, when
air density moves, or when the aero model is revised — and all three have moved. A 2 km pursuit is
decided by eight numbers, and those eight numbers survive every revision the rest of the analysis
has been through.

They are also self-verifying. Lap times sum to the cumulative column and distance advances by the
lap length, so a transcription slip is catchable without any external reference. The record hands
its block straight to `parseLapSplits` — the parser `compute_track_lap_power` already uses — so a
record inherits that check on **every read, forever**, where a pasted export was checked once at the
moment of one tool call and then discarded.

## What this replaced

Before this, splits lived as hand-typed prose tables: `track-context.md` §4 carried Nationals 2026,
Nationals 2025, a 2025-vs-2026 head-to-head and a three-run training session; `season.md` carried the
6 Sept benchmark, whose table **restated both Nationals lap columns** so it could show deltas;
`coaching-log.md` carried a third shape again, slash-separated inline. Six table shapes across three
files for one kind of measurement, with the 2025 splits present three times over.

Each new race added another quadratic hand-built cross-reference table, with a transcription risk per
cell and a decline percentage recomputed by hand — and one of those hand-written labels was inverted
(`(v₂₋₄/v₆₋₈)³` for a quantity that is `(v_close/v_open)³ − 1`), which is exactly the failure a
prose table invites and a tool cannot make.

## Why nothing derived is stored

A stored derived figure is a claim with a hidden anchor. `Modelled W` at ρ = 1.20 was written beside
the 2026 splits and then §6 established the model over-reads by ~6% — the number stayed on the page,
correct-looking, silently wrong in level. A speed or cadence stored beside a lap time has the same
defect more quietly: it is right until the development, the lap distance or the rounding convention
changes, and nothing marks the moment it stops being right.

So the record stores the basis and the splits, and the service recomputes. The cost is that a reader
must run a tool to see a speed. The benefit is that no figure in the system can disagree with the
measurement it came from.

## Why the aero model stays out of code

`get_track_session` deliberately does **not** report modelled watts. §6 of `track-context.md`
measures the model over-reading by ~6% against the SRM, and §3 puts ±5–10% on it from air density
alone. Putting it behind a tool would give a four-assumption estimate the same presentation as a
timed lap.

Modelled watts therefore stay in prose, labelled with their density assumption and read against the
known over-read. Real power comes from the SRM through `compute_track_lap_power`, which owns the
join between the export and the streams.

Note that the model-free decline the service does report — `(v_close/v_open)³ − 1` — agrees with the
modelled-power decline to about a point on both Nationals rides. That agreement is why the model-free
form is sufficient, not why the model is trustworthy.

## Where the files live, and what that costs

Records live in `docs/personal/track/`, the private repo alongside `season.md` and
`coaching-log.md` — race splits are personal data and that is where personal data already lives.

This makes the loader deliberately **more forgiving than `workout-library`'s**, which throws when its
directory is missing. `templates/workouts/` ships inside the bundle, so its absence is corruption.
`docs/personal/track/` ships nowhere: for every install but this athlete's it does not exist and
never will. A missing directory therefore returns an empty list and a note naming the path it looked
in. `INTERVALS_TRACK_SESSIONS_DIR` overrides the location.

## Known development, not fitted development

The record's `gear` and `rolloutMm` give `(chainring / cog) × rollout` — metres per crank revolution,
a **known** drivetrain quantity. The alignment recovers a **fitted** development, which is
distance actually ridden per revolution and equals the known one only if the rider covered exactly
the lap distance. `track-context.md` §1 records them differing by ~0.4% across two sessions.

They are kept apart on purpose: their disagreement is evidence about the line ridden, not a bug to
reconcile. Neither is ever expressed in gear inches. That convention assumes a 27" wheel, so a nominal figure
sits ~2.9% above the true development of a real 700×23 tyre — and a true development expressed "in
inches" correspondingly lands ~2.9% low and looks like a different gear. The frontmatter schema
rejects gear inches outright, because mistaking the two once cost a full analysis cycle
(`track-context.md` §1).

## Closing the loop: the export is never pasted twice

`compute_track_lap_power` and `write_track_runs` predate records, so both took the export pasted as
text. Once a session is filed, that leaves the same numbers typed twice — once into the record, once
into the call — and a second transcription is a second chance to get a digit wrong, in the one place
where the record's reconciliation check cannot help.

Both tools therefore accept `sessionId` as an alternative to `splits`, taking the export, the
`activityId` and the `lapDistanceMeters` from the record's basis. The splits handed over are
**re-serialised from the parsed record**, not the raw block: the alignment then gets exactly the
numbers the reconciliation passed, and any extra trailing columns the timing app exported are
dropped, which costs nothing because the parser ignores them anyway.

`splits` and `sessionId` are mutually exclusive rather than one overriding the other — they could
disagree, and there is no principled way to pick a winner. That check lives in the Track module,
which resolves the input for both tools, not as a Zod refinement, because the MCP adapter registers
`schema.shape` and `.refine()` erases it.

`activityId` stays overridable, and stays required when there is no record to take it from. A record
need not carry one: 2025 Nationals is a timing export with no ride behind it, and asking to align it
says so rather than failing obscurely inside the stream fetch.
