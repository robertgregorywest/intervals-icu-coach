# Preloaded short intermittents (VO2 primer)

A dense VO2 format: open each series with one long interval to prime VO2, then a cluster of short reps that start already near VO2peak. Canonical shape: library workout `vo2-preloaded-shorts` (`get_workout_library_item` for the current rendered body).

**Why** — Aerobic adaptation from HIT scales with _time spent at a high fraction of VO2max_ during work bouts (Odden et al. 2024). Short intermittents (15–40 s @ Z5, 1:1–3:2 work-rest) accumulate more time near VO2peak than long intervals because the short recoveries don't let VO2 fall. **But** short-format VO2 _kinetics_ are slow at series start — the first few reps sit well below 90% VO2peak before the system stabilises (Vaccari et al. 2020). Opening each series with one ~2 min long interval primes VO2 upward fast, and a short (~30 s) recovery preserves that elevated state, so the short reps that follow start _already_ near 90% VO2peak instead of climbing into it.

**When to choose this over 4×4 or 30/30** — Pick this when the athlete tolerates 30/30s well but you want more total time at high %VO2max per session, or when their last 30/30 block showed weak first-reps (HR/VO2 slow to rise). Don't use as the first VO2 session of a block — the format is dense and benefits from a base of plain 30/30s first. Avoid stacking with heavy strength the day before (philosophy permitting).

**Knobs**

- Preload: 1.5–3 min @ 95–100% MAP. Longer/harder → faster VO2 rise but more peripheral cost; keep cadence ≥ 90.
- Short on/off: 20/10, 30/15, 30/30, 40/20 are all in range. Lean shorter for fresher athletes, longer for diesels.
- Series count: 2–4. Three series at 12 reps ≈ 6 min preload + 9 min short work / session — a heavy stimulus; trim before adding.
- Anchor: %MAP. Don't use %FTP for the short reps — the kinetics argument is about VO2, not lactate threshold.

**Progression** — This applies to plain 30/30s (`vo2-30-30`) as much as to the preloaded variant. Repeating the same short-intermittent session week after week stagnates: it's already near-maximal and leaves no room to push (Ronnestad et al. 2015, 2020). Apply progressive overload by manipulating three variables, in this order:

1. **Series count** — 2 → 3.
2. **Reps per series** — start short (e.g. 8) and grow toward 12.
3. **Work:recovery ratio** — 1:1 → 3:2 → 2:1 (e.g. 30/30 → 30/20 → 40/20).

When stepping up the work:rec ratio (weeks 3 and 5 in the block below), drop series length one notch in the first session at the new ratio, then re-grow. Example block (Ronnestad-style, no preload — for the preloaded variant start one notch lighter because the preload adds load):

| Week | Session 1  | Session 2  |
| ---- | ---------- | ---------- |
| 1    | 2×8 30/30  | 3×8 30/30  |
| 2    | 3×10 30/30 | 3×12 30/30 |
| 3    | 3×12 30/30 | 3×10 30/20 |
| 4    | 3×10 30/20 | 3×12 30/20 |
| 5    | 3×10 40/20 | 3×10 40/20 |
| 6    | 3×11 40/20 | 3×12 40/20 |

For the preloaded variant: keep the 2 min @ 95–100% MAP preload fixed across the block; only progress the short-rep cluster. Adding the preload itself is already a stimulus bump versus plain 30/30s — don't also chase the highest series count in week 1.

**Sources** — Odden et al. 2024 (HIT time-at-fraction-of-VO2max), Vaccari et al. 2020 (VO2 kinetics in short vs long intermittents), Ronnestad et al. 2015, 2020 (short-intermittent protocols and progression). Slide decks cached at `docs/personal/instagram/DXUgF3DDAjv/` (preloaded variant) and `docs/personal/instagram/DXgy9CTDHiR/` (progression scheme) — both Instagram @knowledgeiswatt.
