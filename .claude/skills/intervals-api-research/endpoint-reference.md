# Endpoint reference

Index of Intervals.icu endpoints currently used by this server, plus quirks worth knowing. **This is a pointer, not a contract.** Always confirm shapes against a live response before coding (see `live-probing.md`) — fields drift, the docs SPA lags reality, and shapes vary between sibling endpoints.

## Events (calendar)

- `POST /api/v1/athlete/{id}/events/bulk?upsert=true` — body is a JSON array of events. Upsert match key is `external_id`. Use this for both new and updated planned workouts.
- `PUT /api/v1/athlete/{id}/events/bulk-delete` — body is an array of `{ external_id }` or `{ id }`. Either matcher works.
- `GET /api/v1/athlete/{id}/events` — list, supports `oldest`/`newest` date filters.
- `GET /api/v1/athlete/{id}/events/{eventId}` — single event.

### Quirks that matter for load and for parsing

- `workout_doc` is **Intervals.icu's own parse** of the event's `description`, and it carries the platform's derived figures alongside the steps: `normalized_power`, `average_watts`, `zoneTimes`, `variability_index`, `polarization_index`, `strain_score`. It exists only once the event has been written — there is **no endpoint that parses workout text without saving it**; the plausible routes 422 because Spring cannot coerce the path segment into a Long. That gap is what `src/services/workout-parser/` exists to close.
- A **percentage target is stored as a percentage** (`{units: "%ftp", start: 54, end: 66}`) and a **zone target as a zone number** (`{units: "power_zone", value: 2}`). Neither is resolved to watts in the document, and the event does **not** record the FTP it was resolved at — `icu_ftp` is null throughout. Recover it from `icu_intensity` (`IF = NP / FTP`) if you need it.
- `icu_ftp` **on the request body is ignored**: an event written with `icu_ftp: 200` comes back with it null and its targets resolved against the athlete's own FTP.
- A planned event also carries the platform's **projection** onto it: `icu_ctl`, `icu_atl`, `icu_intensity`, `icu_training_load`. These are the figures a forecast is checked against.
- `WeightTraining` events carry `icu_training_load: null` and are excluded from the platform's own projection. Strength contributes zero, so a model that assigns it a figure diverges from the dashboard.
- **Zone targets do not resolve like the equivalent percentage band.** A `ZN` target resolves to the midpoint of `[floor(prevPct/100 × FTP) + 1, floor(pct/100 × FTP)]`, converting each bound to watts _before_ averaging. At FTP 286 that puts `Z6` at 387 W where `120-150%` lands on 386. Zone 1 has no zone below it and the platform substitutes a floor at four fifths of the zone's ceiling — measured, not documented. Committed as `tests/fixtures/workout-parser/zone-targets.json`; re-measure with `npx tsx scripts/capture-workout-parser-fixtures.ts --zones`.
- **A horizontal rule is not a step.** A line of three or more dashes, optionally spaced (`---`, `-----`, `- - -`), is dropped from `workout_doc` without trace and closes an open repeat block or `Warmup`/`Cooldown` section, as a blank line does: `3x / - 1m 300w / --- / - 1m 100w` comes back as a 3×1m block plus one loose step. `--` and `--- note` are ordinary step lines, dropped for want of a duration, and close nothing. Measured for #37.

## Folders + saved workouts (the workout library)

- `GET /api/v1/athlete/{id}/folders` — returns a tree of `{ type: "FOLDER", children: [...] }`. Children mix nested folders and workouts; distinguish by `type`. **Quirk:** folders are flat in practice; `parent` on `POST` is ignored.
- `POST /api/v1/athlete/{id}/folders` — create folder.
- `POST /api/v1/athlete/{id}/folders/{folderId}/workouts` — create saved workout. Requires `type` (default `"Ride"`) and `folder_id` in the body.
- `PUT /api/v1/athlete/{id}/folders/{folderId}/workouts/{workoutId}` — update saved workout.
- `DELETE` — works on both folders and saved workouts.

## Activities + analysis

- `GET /api/v1/athlete/{id}/activities` — recent activities list (thinner projection than the single-activity endpoint).
- `GET /api/v1/activity/{activityId}` — full detail.
- `GET /api/v1/activity/{activityId}/streams` — time-series streams (`watts`, `heartrate`, `cadence`, etc.). Sparse — confirm null handling live.
- `GET /api/v1/athlete/{id}/power-curves` — power-duration curve.
- `GET /api/v1/activity/{activityId}/intervals` — the interval analysis as its own document: `{ id, analyzed, icu_intervals[], icu_groups[] }`.
- `PUT /api/v1/activity/{activityId}/intervals?all=true` — replace the interval set (`all=false` merges). Verified live 2026-08-13; four things the schema does not tell you:
  - The body is a **bare JSON array**, not an object wrapping one.
  - **Every metric is recomputed** from `start_index`/`end_index` — power, cadence, HR, distance, duration, training load, zone, even weather. Sending a metric is silently discarded, so send none.
  - **`type` is not honoured.** An interval sent as `RECOVERY` comes back `WORK`. Only `start_index`, `end_index` and `label` survive the round trip; `label` is preserved verbatim.
  - **Gaps are backfilled.** Write two intervals into a 4340-sample activity and four come back — the platform partitions the whole ride. You cannot write efforts in isolation.
  - Boundaries are stream sample indices, end-exclusive (`end_index - start_index` = sample count, = seconds only at 1 Hz). Re-sending a captured set reproduces every metric exactly, which makes replace-and-restore a safe probe.
- `PUT /api/v1/activity/{activityId}/delete-intervals` — remove intervals (also a `PUT`, also an array body).

## Athlete + wellness

- `GET /api/v1/athlete/{id}` — profile, FTP, LTHR, weight, custom items, zones.
- `GET /api/v1/athlete/{id}/wellness` — daily wellness records. Supports `oldest`/`newest`. Subjective fields (fatigue, soreness, motivation, sleep) are **nullable** when not logged that day.
  - `ctl`/`atl` are the **delivered** fitness and fatigue; `ctlLoad`/`atlLoad` are the day's training load as the platform fed it into each recursion, always whole numbers. `rampRate` is `ctl(d) − ctl(d−7)`.
  - The recursion is `x' = x + (load − x) · (1 − e^(−1/τ))`, with τ from `ctl_days`/`atl_days` on the sport settings and the platform defaults of 42/7 when those are null. Verified against 112 consecutive records to within 1e-5 — the residual is the float32 the API serialises, not the model.
  - On a day carrying both a completed activity and a planned event, the **delivered** `ctl` here and the **planned** `icu_ctl` on the event differ. Seed a forecast from this one.
- **`sportSettings`, not `sport_settings`.** The athlete payload uses the camelCase key, and carries no top-level `ftp` — FTP, `power_zones`, `ctl_days` and `atl_days` all live on the cycling sport setting.

## Documentation links

- **Forum API reference** — https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624 (the most reliable source; the maintainer answers questions there).
- **API docs SPA** — https://intervals.icu/api-docs.html (JS-rendered; won't work via fetch and has drifted from reality in places — verify against live responses).
- **Intervals.icu forum** — https://forum.intervals.icu/ (search for endpoint names; threads often surface undocumented behavior).

## When in doubt

If this index disagrees with what you see on the live account, **the live account wins.** Update this file, don't code around the doc.
