# Preloaded short intermittents

A dense VO2 format: open each series with one long interval to prime VO2, then a cluster of short reps that start already near VO2peak. Canonical shape: library workout `vo2-preloaded-shorts` (`get_workout_library_item` for the current rendered body).

**Why** — Aerobic adaptation from HIT scales with the _fraction of VO2max_ held during work bouts (Odden et al. 2024). Short intermittents accumulate more time near VO2peak than long intervals because the short recoveries don't let VO2 fall, and 30/15s outperformed effort-matched 5-min reps in trained and elite cyclists (Rønnestad et al. 2015, 2020). **But** short-format VO2 _kinetics_ are slow at series start — the first few reps sit well below 90% VO2peak before the system stabilises (Vaccari et al. 2020). Opening each series with one ~2 min long interval primes VO2 upward fast, and a short (~30 s) recovery preserves that elevated state, so the short reps that follow start _already_ near 90% VO2peak instead of climbing into it.

**When to choose it** — The short-intermittent phase of the main VO₂ block, after the long-rep weeks (`season.md` names the phase; see the VO2 entry in [session-patterns.md](session-patterns.md)). Avoid stacking with heavy strength the day before (philosophy permitting).

**Knobs**

- Preload: 2 min, above the long-rep band and well below 2-min max power (≈90–95% MAP for a rider with a low FTP:MAP; nearer 95–100% for a diesel). Cadence ≥ 90.
- Short on/off: 30/15 by default; 40/20 as the next step (same 2:1, longer reps). Avoid 30/30: 30 s off lets VO₂ fall.
- Intensity: self-paced, the highest average repeatable across every series, never below the band. Rønnestad's protocols were effort-matched, not %MAP-prescribed.
- Series count: 3, with 3 min between series. Three series at 12 reps ≈ 6 min preload + 9 min short work / session — a heavy stimulus; trim before adding.
- Anchor: %MAP. Don't use %FTP for the short reps — the kinetics argument is about VO2, not lactate threshold.

**Progression** — Self-paced session power is the first progression: Rønnestad's riders repeated one 30/15 protocol twice weekly for 10 weeks and still improved (2015). Step the structure only after a session that landed (the stepping gate in [session-patterns.md](session-patterns.md)), one step per session:

1. **Reps per series** — 3×8 → 3×10 → 3×12.
2. **Rep length at the same ratio** — 30/15 → 40/20, dropping to 3×8 at the first 40/20 session.

Keep the preload fixed; progress only the short-rep cluster. Twice-weekly dosing (Rønnestad, in riders around 30) only as a declared block experiment.

**Sources** — Odden et al. 2024 (gains scale with % of VO2max during intervals); Vaccari et al. 2020 (short-format VO2 kinetics, a long opening bout); Rønnestad et al. 2015, 2020 (30/15 outperforms effort-matched 5-min reps); Sandford et al. 2021 (prescribe supra-MAP work by anaerobic reserve, not %FTP). Preload and progression scheme: @knowledgeiswatt (Instagram), coaching practice, not a trial.
