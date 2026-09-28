---
name: coaching-philosophy
description: The athlete's durable cycling coaching philosophy — foundational pillars, intensity anchor (MAP), hard execution rules, biases, and test cadence. The base layer that the coaching-session and plan-workout skills read at session-start. Timeless principles; personal, season-specific deviations live in docs/personal/steering.md (which overrides this) and docs/personal/season.md.
---

# coaching-philosophy

Timeless coaching principles for `intervals-icu-coach`. Edit this skill when beliefs about
_training itself_ change — not every season. It is the **base truth**; a personal override layer
in `docs/personal/steering.md` adjusts or supersedes it per-athlete and **wins on conflict**, and
`docs/personal/season.md` carries the current block. Durable insight proven in steering graduates
_up_ into this skill (a git commit).

This `SKILL.md` front-loads the **operative core** — the rules the coach must have in context every
session to avoid violating a constraint. The deeper _why_ behind each pillar lives in the topic
subfiles below; drill in on demand.

## Foundational pillars

The framework underneath every decision. One line each; the rationale is in the linked subfile.

1. **Consistency** — progress compounds from showing up; frequency over heroics. Have a "minimum
   viable week" and a plan B. → [consistency.md](consistency.md)
2. **Structure** — sessions serve a bigger picture; default to a pyramidal mix; progress one
   variable at a time. → [structure.md](structure.md)
3. **Recovery** — adaptation happens between sessions; easy must be truly easy; plan rest. For
   masters, recovery quality is the rate-limiter. → [recovery.md](recovery.md)
4. **Strength** — non-optional past 35; low-rep heavy, whole body; periodised with the season.
   → [strength.md](strength.md)
5. **Nutrition** — fuel the work required; carbs periodised to demand; protein spread across the
   day. → [nutrition.md](nutrition.md)
6. **Durability** — what matters is the power held at hour 3, not fresh FTP; built over months.
   → [durability.md](durability.md); measure it objectively with [decoupling.md](decoupling.md).

## Intensity anchor

**MAP is the primary anchor.** FTP is derived/contextual; raising the FTP:MAP ratio is the
durability lever for the 2 km IP. All training intensities are reasoned in **%MAP**, with absolute
watts emitted to Intervals.icu. Anaerobic/start work is judged on RPE and on-track speed (no power
on the fixed gear). → [intensity-anchoring.md](intensity-anchoring.md)

## Execution rules

Hard constraints the coach should **always** respect.

- Z2 NP cap **≤ 68% MAP** — compute from live MAP, never a cached wattage. Short excursions fine
  if NP stays capped.
- **No high-intensity day after heavy strength.**
- **Two-a-days only** on weekends or work-from-home days.
- **Strength stacks on hard ride days**, a few hours' separation — ride AM, gym PM. Easy days stay
  truly easy.
- **Protect quality before track** — no fatiguing day the day before a track session.
- **Recovery week every 3–4 weeks** of build.
- **Progress one variable per week** — duration _or_ intensity, not both.
- **Long rides ≥ 2 h fuelled** at ~60–90 g carbs/hr; protein 20–30 g every 3–4 h across the day.

## Biases

How to think about training trade-offs.

- **Repeatability over hero sessions** — fewer hard days done well > more done poorly.
- **Pyramidal default** (Z2 base + MIET/sweetspot + smaller HIT dose) over polarised or
  threshold-heavy.
- **Middle-band dose is the load-bearing metric — not CTL, not hours.** Judge a build week first on
  its **time in the 76–106% FTP band** (tempo through threshold, stated with its block-length floor),
  load number second. Watch for **polarisation by subtraction** — volume and CTL rising while the
  middle quietly empties. → [structure.md](structure.md)
- **Durability > fresh peak** (late-ride / back-half power) when forced to choose.
- **Frequency over duration** when life is busy — preserve the rhythm.
- **Masters: recovery quality is the rate-limiter** — protect it before adding load.
- **Progression only counts if it's _delivered_** — a build week that doesn't raise load is a
  missed week, not a safe one. Verify planned load against the target; let deteriorating readiness,
  not caution-by-default, be the brake.
- **Fuel the work** — under-fuelling erodes adaptation faster than it improves body composition.

## Test cadence

When and how to retest. → [testing.md](testing.md)

- **MAP ramp** every 6–8 weeks or at mesocycle starts. Exclude botched tests by renaming the
  activity with "(skip)".
- **FTP/threshold benchmark** early in each build and again mid-build.
- **Durability check** — fresh vs. late-ride (after 2–3 h) sweetspot every block or two; or run
  `get_aerobic_decoupling` on a qualifying steady long ride. → [decoupling.md](decoupling.md)
- **On-track** — 2 km IP time-trial and schedule-paced efforts to track pacing and the standing
  start.

## How this skill is used

- The `coaching-session` and `plan-workout` skills read this `SKILL.md` at session-start as the
  base philosophy, then read `docs/personal/steering.md` (overrides win) and `docs/personal/season.md`
  (current block).
- Live athlete state (FTP, MAP, zones, CTL/ATL/TSB, wellness) is **never** stored here — it comes
  from `get_coaching_context`, always fresh.
