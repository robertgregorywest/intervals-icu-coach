# Workout-text syntax cheatsheet

The format Intervals.icu expects in event `description` and saved-workout `description` fields. This is the canonical guide; `create_workout`'s own schema (`./bin/icu describe create_workout`) carries only the rules it enforces on its input.

## Shape

```
- [label] [duration] [target] [cadence]      # simple step
- [label] [duration] ramp [target] [cadence] # ramp step
Nx                                            # repeat block (blank lines around)
- step
- step
```

Lines starting with `- ` are steps. `Nx` introduces a repeat block whose following `- ` lines belong to it (until a blank line). Free text outside step lines renders as workout notes.

## Tokens

- **Duration**: `5m`, `30s`, `1h2m30s`, `2km`, `500mtr` (`m` = minutes, `mtr` = meters)
- **Power**: `75%`, `95-105%`, `220w`, `160w-256w`, `Z2`
- **HR**: `70% HR`, `Z2 HR`, `95% LTHR`
- **Pace**: `60% Pace`, `Z2 Pace`, `5:00/km Pace`
- **Cadence**: `90rpm`, `85-95rpm`

## Examples

### Sweet spot 3×12

```
- Warm-up 10m ramp 50-80%
- Opener 1m 90%
- Easy 2m 60%

3x
- Sweet spot 12m 250w-265w 85-105rpm
- Recovery 5m 160w

- Cool 5m 50%
```

### VO2 4×4

```
- Warm-up 10m ramp 50-80%

3x
- Opener 30s 100% 100rpm
- Easy 30s 55%

4x
- VO2 4m 360w-390w 95rpm
- Recovery 4m 160w

- Cool 5m 50%
```

### Z2 endurance

```
- Warm-up 10m ramp 50-65%
- 75m 65-72%
- Cool 5m 50%
```

## What a step label declares

**Step labels declare the step's role.** The **first word** of a step's label says whether the step is the session's work, read against a closed vocabulary. A work step is judged by the execution review; anything else is judged by nothing. Use one of these as the first word of every step that carries the session's intent:

| Group              | First words                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| Generic            | `Work` `Effort` `Interval` `Rep` `Set` `Block`                                        |
| Zone / physiology  | `Tempo` `Sweet spot` `SST` `Threshold` `MIET` `MAP` `VO2` `Anaerobic` `Neuromuscular` |
| Race-specific      | `Sprint` `Start` `Standing` `Pursuit` `Race` `Kilo` `Run` `Lap`                       |
| Rep-internal shape | `On` `Over` `Under` `Float` `Settle` `Hold` `Surge` `Preload`                         |
| Priming            | `Opener` `Openers` `Activation` `Primer`                                              |
| Test               | `Test` `Max` `Peak`                                                                   |

Support steps take any other label — `Warm-up`, `Recovery`, `Easy`, `Off`, `Cool down` — and are never judged, so a recovery step ridden easier than prescribed can no longer read as a miss. `Endurance` and `Steady` are deliberately not work words: a volume block is judged on its share of the middle band, not rep by rep.

**A work step whose label falls outside the vocabulary is invisible to the review**, which is the one way a real miss goes unreported. `create_workout` warns when a step prescribed at or above 88% FTP carries no work word. Leave a step unlabelled deliberately only where it is meant to go unjudged — a ramp test's steps, a warm-up's build.

## When to write a cadence

A cadence on a step is a **condition of the rep**, not a suggestion: `compare_planned_vs_actual` judges every step that carries one (±5 rpm on a point, a range on its own band), and the execution review reports a miss. So:

- **Write it where cadence is part of what the rep trains** — race-pace and pursuit work, VO2 preloads, cadence drills, a recovery spin whose point is high cadence.
- **Use a range for a floor.** There's no `≥` token — "hold ≥ 85" is `85-105rpm`; "above 100" is `100-130rpm`. A point target is for a cadence the rep must sit on.
- **Leave it off warm-ups, recoveries, settles and cool-downs** unless the brief makes it the point of that step. A habitual `90rpm` there creates verdicts nobody reads.
- **Carry a cadence the brief or library item names.** Don't invent one the brief doesn't ask for; if a rep's intent clearly depends on cadence and the brief gives none, say so in your report.

## Gotchas

- **Always emit absolute watts** — `220w`, `160w-256w`. `%MAP` is **not** parseable; `%FTP` works but is fragile. Conversion + why in [power-conversion.md](power-conversion.md).
- **Head-unit granularity** — split ramps/progressions into short steps; keep steady bands whole. Full rule in [power-conversion.md](power-conversion.md).
- **Blank lines around `Nx`** are load-bearing. Without them the parser loses the repeat boundary.
- **Free-text workout notes** can sit above or between step blocks. They render as the workout's prose.
- **Ranges** use `-` (hyphen): `220w-260w`, `95-102%`, `5:00/km Pace`. No spaces.
- **`ramp` is only for genuine ramps — never for steady bands.** A watt range (`158w-217w`) is a held target band by default. When writing via `create_workout`, do **not** set `ramp: true` on an endurance/sweet-spot/recovery step — that forces a linear sweep across the whole step. In raw workout text the equivalent mistake is adding the word `ramp` before a steady band's range.
- **Step labels must be plain words — no token-shaped tokens.** A `number+unit` word in a label (`60s`, `1m`, `2km`, `220w`, `90rpm`, `75%`) gets parsed as the step's duration/target on the text round-trip, silently corrupting the step. Real case: a label ending `…MAP = best 60s` swallowed the `60s` as a duration, turning a 1-min step into 2-min and truncating the label to `…MAP = best`. Keep numeric detail in the workout's prose notes, never in a step `label`. `create_workout` and `update_event` refuse such a label; raw text written elsewhere is not checked.
