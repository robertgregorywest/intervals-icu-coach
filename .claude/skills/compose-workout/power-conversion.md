# Power conversion at the API boundary

Reason about intensity in %MAP or %FTP per the coaching context. **Emit absolute watts** when calling any tool that writes to Intervals.icu (`create_workout`, `update_event`).

This applies to _calendar_ writes. Workout templates in `templates/workouts/` are the exception — they are written in percentages and converted to watts by the renderer at sync time.

## Why

- Intervals.icu's parser does **not** understand `%MAP`.
- `%FTP` is supported but couples the workout to whatever FTP is on file at execution time. Watts are stable; if FTP changes the workout still expresses the original intent.
- Library workouts avoid the problem entirely: their template holds the percentages, and `sync_workout_library` re-renders the watts whenever a test value changes.

## Conversion

Pull `ftp` and `map.watts` from `get_coaching_context`, and for zone-based prescriptions its **`mapZones`** — the canonical coaching zones. Its description says how each is derived.

- If `map` is null, follow `mapWarning`: ask the athlete for a current MAP estimate before prescribing %MAP-anchored work; do not invent a value.

**Pattern**: anchor × pct = watts, rounded to nearest 5 W.

| Intent         | Basis | Pct (typical) |
| -------------- | ----- | ------------- |
| Recovery       | FTP   | 40–55%        |
| Z2 / endurance | FTP   | 56–75%        |
| Sweet spot     | FTP   | 84–94%        |
| Threshold      | FTP   | 95–105%       |
| VO2 / MAP      | MAP   | 95–110%       |
| Anaerobic      | MAP   | 120–150%      |

(Use the athlete's actual zone definitions from `get_coaching_context` if they differ.)

## Worked examples

Athlete: FTP 285 W, MAP 380 W.

- "Z2, 75 min" → `220w` (75% × 285 ≈ 213, round to 220)
- "Sweet spot 3×12 at 90% FTP" → `255w` (90% × 285 = 256.5 → 255)
- "VO2 4×4 at 95–102% MAP" → `360w-390w` (95–102% × 380)
- "Threshold 2×20 at 98% FTP" → `280w`

## Range targets

When the user gives a range (e.g. "95–105% MAP"), emit a watts range: `360w-400w`. The Intervals.icu parser supports `<min>w-<max>w`.

**Head-unit granularity (canonical rule — referenced elsewhere).** A long/wide ramp step displays as a single average wattage on a Wahoo/Garmin head unit, losing the progression. Split any ramp or progression into short steps of **≤ 2 min** and **≤ ~8% MAP (~25–30 W)** range each, stepping upward (e.g. a 20-min ramp 40→110% becomes ten 2-min steps). A steady-state **target band** (e.g. Z2 `60-72%`) is a deliberate range the rider holds — keep it as one step, never `ramp`. In a Workout template a `ramp` step is a **parse error** for this reason — write the explicit steps out.

## Persisting to the library

Write a Workout template in percentages and let sync do the conversion:

```markdown
---
seedId: vo2-4x4
name: VO2 4×4
folder: "Coach: VO2 Max"
basis: MAP
purpose: Long-rep VO2 session — the entry point to the main VO2 block, and VO2 maintenance.
---

- Warm-up 15m 50-60%

4x

- On 4m 78-85%
- Off 4m 50%

- Cooldown 10m 45%
```

Then `sync_workout_library` with the athlete's current anchors. A bare `%` resolves against `basis`; literal watts, zones, `% LTHR` and cadence pass through untouched.

## Rounding

Round to nearest 5 W for ranges, nearest 5 or 10 W for point targets. Avoid spurious precision like `213w` — it implies a calibration the athlete doesn't have.
