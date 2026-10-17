---
name: plan-strength-training
description: Plan, schedule or review a gym / strength session on Intervals.icu, and reason about how strength supports the bike. Use when the user asks for a gym / lifting / S&C session, mentions squats/deadlifts/step-ups/jumps, asks how many gym sessions to run, or how strength transfers to the standing start or the pursuit.
---

# plan-strength-training

Strength-and-conditioning skill for the `intervals-icu-coach` project. Decides the gym session,
agrees it with the athlete and schedules it as a `WeightTraining` event. It is the operational
"how"; the durable "why" lives in the `coaching-philosophy` skill's
[strength pillar](../coaching-philosophy/strength.md).

## Session-start moves

Read `docs/agents/icu-cli.md` (from the project root) before your first CLI call — working
directory, piping, `describe`. You run at its **Build** tier — or **Build, replacing an event**
when the athlete has agreed in this conversation that the session replaces a planned one.

**Reuse, don't repeat.** If you arrived from a `coaching-session` (or already gathered these this
turn), the `get_coaching_context` snapshot and the personal files are already in context — reuse them,
don't re-fetch. Re-fetch only what's missing. Invoked cold, gather 1–2 in parallel:

1. **`get_coaching_context`** — today's CTL/ATL/TSB, ramp rate, readiness, and the 7-day wellness
   trend. Gym load is layered on top of an already-fatigued system; readiness gates volume. Don't
   ask the athlete for fitness — read it (or reuse the snapshot already in context).
2. **`docs/personal/season.md`** — the **current block** sets strength **frequency and intent**
   (build/reload vs maintain). Also `docs/personal/steering.md` (overrides win on conflict).
   The philosophy's [strength pillar](../coaching-philosophy/strength.md) and the execution rules in
   `.claude/skills/coaching-philosophy/SKILL.md` are the hard constraints.
3. **Know the week's hard bike/track days** (ask, or `get_events`) — placement matters as much as
   content (see Constraints). This is usually the one item a delegating `coaching-session` hasn't
   already gathered.

## Decision tree

```
User wants a gym session / strength plan
    │
    ▼
get_coaching_context  +  read season.md / steering.md      (parallel)
    │
    ▼
What block are we in?  →  frequency (×/week) + intent      → periodization.md
    │                      (build · reload · maintain · sharpen)
    ▼
Readiness OK + which bike days are hard this week?
    │
    ▼
Pick the template tier for the phase                       → sessions.md
    │
    ▼
Place it right                                             → Constraints
    │
    ▼
Fill the template in by stimulus-to-fatigue ratio          → exercises.md
    │  (adjust for readiness, niggles, the day's placement)
    ▼
Show the athlete the exercise lines  →  agreed?  →  write it
```

**Writing it.** Schedule with `create_strength_workout` — name, date, description =
`exercise · sets×reps · RPE` lines, `\n`-separated — with an `externalId` (e.g.
`strength-2026-08-05`) so a re-plan upserts rather than duplicates. When the session replaces a
planned event the athlete has agreed to drop, write onto that id with `update_event --yes` instead.
Confirm what was written from the tool's response, not from the draft.

## The five principles (the lens for every decision)

One line each; the reasoning and source posts are in [principles.md](principles.md).

1. **Strength serves the bike** — aerobic work is always the higher priority; strength and fitness are built _together_, never traded off.
2. **Minimum effective dose** — as much as necessary, not as much as possible. Ask "what can I _remove_?" before "what can I add?"
3. **Train both ends of the force–velocity curve** — heavy builds the force ceiling; speed/jumps train how fast you reach it (RFD).
4. **Pick exercises by stimulus-to-fatigue ratio for the phase** — multi-joint over isolation, stable over unstable, specificity over novelty. → [exercises.md](exercises.md)
5. **Individualise; evidence-informed, not evidence-blind** — no fixed template; decide for the athlete and the moment in the season.

## Constraints (respect the coaching-philosophy execution rules)

- **Frequency is set by the block** — read it from `season.md`. **Never exceed 2×/week.**
- **Auto-regulate load by RPE / bar velocity**, never prescribe absolute kg — the athlete's gym
  numbers are not in `get_coaching_context`, and Peden's method is intent-and-velocity led anyway.
- **Placement:** stack strength on a **hard ride day** (ride AM / gym PM, a few hours apart) so easy
  days stay truly easy. **No high-intensity bike day _after_ heavy lifting. Never a fatiguing gym
  day the day before a track session.** Two-a-days only on weekends / WFH days.
- **The bike is the priority.** If a session would compromise the quality of a key ride or track
  session, cut it or lighten it — that is the whole point of the method.

## The pursuit application

For a track pursuiter the **standing start** is where strength transfers most directly to the bike.
When the start is a limiter, that makes **maximal force + rate of force development from a dead stop**
the headline strength target — heavy low-rep bilateral work, loaded jumps, and dead-stop/accelerative
lifts. Read the season's **actual** strength target, limiters, and current block from
`docs/personal/season.md` (with `steering.md` overrides) — it changes through the year, don't assume.
How the dose shifts block-to-block is the off↔in-season model in
[periodization.md](periodization.md); ready-to-run templates are in [sessions.md](sessions.md).
