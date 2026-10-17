# Track work

A velodrome session has two measurements — the lap-timer export and the SRM — and one model, the
aero model that turns a lap time into watts. Keep them apart.

- **Lap times come from the track session record.** `list_track_sessions` says what is filed;
  `get_track_session` and `compare_track_sessions` compute speed, cadence, the flying portion,
  segments, the decline and Σv² from the lap-timer export. Track activities carry no distance or
  velocity stream, and slicing the SRM stream into equal parts does not make laps: per-lap anything
  comes from the export.
- **Power comes from the SRM**, joined to the laps by `compute_track_lap_power` with the record's
  `sessionId`. The SRM is accurate to ~2%; where it and the aero model disagree, the model is wrong.
- **Modelled power is an interpretation.** It rests on CdA, air density, rolling resistance, mass
  and drivetrain efficiency, none measured on the day. Ratios survive it, levels do not: a decline
  across a run is `(v_close/v_open)³ − 1` and the constants cancel, so quote declines freely, while
  absolute watts and any %MAP derived from a split carry the full model error — quote levels from the
  SRM or not at all. Give the measured quantity first and any modelled figure second, labelled.
- **Quote a race by measurements**: total work (kJ, SRM) over its duration, and the decline from the
  lap-timer export. A better race shows up there whatever any model says.
- **Name the confounds a velodrome does not control** whenever two sessions are compared: air
  density and temperature (occupancy, time of day), tyres, position and helmet, the line ridden (a
  high line rides more than the lap distance), and a rider on the wheel, which cuts the leader's drag
  by ~1–3% — a paced effort is assisted. Cross-venue and cross-suit comparisons rest on a CdA ratio,
  so they are weak.
